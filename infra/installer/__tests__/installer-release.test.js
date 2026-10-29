import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { installRelease, sha256 } from '../update-installer.mjs'
import { applyStoredImageSelections, verifyRuntimeImages, INSTALLER_CONTRACT, acquireInstallerDeployment } from '../lib/installer-runtime.mjs'

const ref = 'b'.repeat(40)
function fixture(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'runly-release-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
const manifestFor = (files, version = 'test-1') => ({ schema: 1, contract: INSTALLER_CONTRACT, version, files: Object.fromEntries(Object.entries(files).map(([file, content]) => [file, { sha256: sha256(Buffer.from(content)), modes: ['local', 'external'], legacyGitBlobs: [] }])) })

test('legacy scripts upgrade together and preserve configuration, data, secrets, selected images and mode', async t => {
  const root = fixture(t)
  const manifest = JSON.parse(fs.readFileSync('infra/installer/installer-release.json'))
  const old = execFileSync('git', ['show', 'a4d6b7aa:infra/installer/setup-local.mjs'])
  fs.writeFileSync(join(root, 'setup-local.mjs'), old)
  const preserved = { '.env.local': 'RUNLY_API_LOCAL_IMAGE=example/api:chosen\n', '.env': 'KEEP=true\n', 'docker-compose.override.yml': 'services: {}\n', 'custom-modules/keep': 'module', '.secrets/keep': 'private', 'files/keep': 'attachment' }
  for (const [file, content] of Object.entries(preserved)) { fs.mkdirSync(join(root, file, '..'), { recursive: true }); fs.writeFileSync(join(root, file), content) }
  const readSource = file => Buffer.from(fs.readFileSync(`infra/installer/${file}`, 'utf8').replaceAll('\r\n', '\n'))
  await installRelease({ root, mode: 'local', ref, manifest, readSource })
  await installRelease({ root, mode: 'local', ref, manifest, readSource })
  for (const [file, content] of Object.entries(preserved)) assert.equal(fs.readFileSync(join(root, file), 'utf8'), content)
  await assert.rejects(installRelease({ root, mode: 'external', ref, manifest, readSource }), /MODE_MISMATCH/)
  fs.appendFileSync(join(root, 'docker-compose.yml'), '\n# custom\n')
  await assert.rejects(installRelease({ root, mode: 'local', ref, manifest, readSource }), /LOCAL_CHANGES/)
  assert.match(fs.readFileSync(join(root, 'docker-compose.yml'), 'utf8'), /# custom/)
})

test('downloads, integrity, unsafe paths, reused versions and locks fail before live files are changed', async t => {
  const root = fixture(t), files = { 'setup-local.mjs': 'first', 'lib/test.mjs': 'second' }, manifest = manifestFor(files)
  const options = { root, mode: 'local', ref, manifest, readSource: file => Buffer.from(files[file]) }
  await assert.rejects(installRelease({ ...options, readSource: file => Buffer.from(file.startsWith('lib') ? 'tamper' : files[file]) }), /INTEGRITY_FAILED/)
  assert.equal(fs.existsSync(join(root, 'setup-local.mjs')), false)
  await assert.rejects(installRelease({ ...options, manifest: manifestFor({ '../escape.mjs': 'bad' }) }), /UNSAFE_PATH/)
  await installRelease(options)
  await assert.rejects(installRelease({ ...options, manifest: manifestFor({ 'setup-local.mjs': 'different' }) }), /VERSION_REUSED/)
  fs.writeFileSync(join(root, '.runly-installer/update.lock'), String(process.pid))
  await assert.rejects(installRelease(options), /UPDATE_IN_PROGRESS/)
  assert.equal(fs.readFileSync(join(root, 'setup-local.mjs'), 'utf8'), 'first')
})

test('an interrupted transaction restores all previous scripts before any further download', async t => {
  const root = fixture(t), area = join(root, '.runly-installer')
  fs.mkdirSync(join(area, 'backup'), { recursive: true })
  fs.writeFileSync(join(root, 'setup-local.mjs'), 'partial')
  fs.writeFileSync(join(area, 'backup/0'), 'original')
  fs.writeFileSync(join(area, 'journal.json'), JSON.stringify([{ file: 'setup-local.mjs', existed: true, mode: 0o644, originalHash:sha256(Buffer.from('original')), newHash:sha256(Buffer.from('partial')) }]))
  await assert.rejects(installRelease({ root, mode: 'local', ref, manifest: manifestFor({ 'setup-local.mjs': 'new' }), readSource: () => { throw Error('offline') } }), /offline/)
  assert.equal(fs.readFileSync(join(root, 'setup-local.mjs'), 'utf8'), 'original')
  assert.equal(fs.existsSync(join(area, 'journal.json')), false)
})

test('a failure during application rolls back already replaced files and version metadata', async t => {
  const root = fixture(t), first = { 'setup-local.mjs': 'old', 'lib/test.mjs': 'old-helper' }
  await installRelease({ root, mode: 'local', ref, manifest: manifestFor(first), readSource: file => Buffer.from(first[file]) })
  const next = { 'setup-local.mjs': 'new', 'lib/test.mjs': 'new-helper' }
  await assert.rejects(installRelease({ root, mode: 'local', ref, manifest: manifestFor(next, 'test-2'), readSource: file => Buffer.from(next[file]), beforeApply: () => fs.unlinkSync(join(root, '.runly-installer/stage/lib/test.mjs')) }), /ENOENT/)
  assert.equal(fs.readFileSync(join(root, 'setup-local.mjs'), 'utf8'), 'old')
  assert.equal(fs.readFileSync(join(root, 'lib/test.mjs'), 'utf8'), 'old-helper')
  assert.equal(JSON.parse(fs.readFileSync(join(root, '.runly-installer/state.json'))).version, 'test-1')
})

test('custom nonempty directories and symlinks are preserved and refused', async t => {
  const root = fixture(t)
  fs.mkdirSync(join(root, 'lib')); fs.writeFileSync(join(root, 'lib/keep'), 'preserve')
  await assert.rejects(installRelease({ root, mode: 'local', ref, manifest: manifestFor({ 'lib': 'invalid' }), readSource: () => Buffer.from('invalid') }), /UNSAFE_PATH/)
  fs.mkdirSync(join(root, 'setup-local.mjs')); fs.writeFileSync(join(root, 'setup-local.mjs/keep'), 'preserve')
  await assert.rejects(installRelease({ root, mode: 'local', ref, manifest: manifestFor({ 'setup-local.mjs': 'new' }), readSource: () => Buffer.from('new') }), /DIRECTORY_CONFLICT/)
  const other = fixture(t)
  fs.symlinkSync(join(root, 'lib'), join(other, 'lib'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(installRelease({ root:other, mode: 'local', ref, manifest: manifestFor({ 'lib/test.mjs': 'new' }), readSource: () => Buffer.from('new') }), /SYMLINK_REFUSED/)
  assert.equal(fs.existsSync(join(root,'lib/test.mjs')),false)
  const missing = join(root,'missing'); fs.mkdirSync(missing)
  const dangling = fixture(t)
  fs.symlinkSync(missing, join(dangling,'lib'), process.platform === 'win32' ? 'junction' : 'dir'); fs.rmdirSync(missing)
  await assert.rejects(installRelease({ root:dangling, mode:'local',ref,manifest:manifestFor({'lib/test.mjs':'new'}),readSource:()=>Buffer.from('new')}),/SYMLINK_REFUSED/)
})

test('an edit after an interrupted update is preserved and requires reconciliation', async t => {
  const root=fixture(t),area=join(root,'.runly-installer')
  fs.mkdirSync(join(area,'backup'),{recursive:true})
  fs.writeFileSync(join(root,'setup-local.mjs'),'user-edit')
  fs.writeFileSync(join(area,'backup/0'),'original')
  fs.writeFileSync(join(area,'journal.json'),JSON.stringify([{file:'setup-local.mjs',existed:true,mode:0o644,originalHash:sha256(Buffer.from('original')),newHash:sha256(Buffer.from('installed'))}]))
  await assert.rejects(installRelease({root,mode:'local',ref,manifest:manifestFor({'setup-local.mjs':'new'}),readSource:()=>Buffer.from('new')}),/ROLLBACK_CONFLICT/)
  assert.equal(fs.readFileSync(join(root,'setup-local.mjs'),'utf8'),'user-edit')
  assert.throws(()=>acquireInstallerDeployment(root),/UPDATE_RECOVERY_REQUIRED/)
})

test('stored image selections survive and incompatible/mixed image contracts are rejected', t => {
  const cwd = fixture(t)
  fs.writeFileSync(join(cwd, '.env.external'), 'RUNLY_API_IMAGE=example/api:chosen\nRUNLY_WEB_EXTERNAL_IMAGE=example/web:chosen\n')
  const env = { ATLAS_API_IMAGE: 'example/api:explicit' }
  applyStoredImageSelections({ cwd, mode: 'external', env })
  assert.equal(env.RUNLY_API_IMAGE, undefined)
  assert.equal(env.ATLAS_API_IMAGE, 'example/api:explicit')
  assert.equal(env.RUNLY_WEB_EXTERNAL_IMAGE, 'example/web:chosen')
  const inspect = label => (_, args) => args[0] === 'run' ? { status: 0, stdout: '9.15.0\n' } : ({ status: 0, stdout: JSON.stringify([{ Id: `sha256:${'c'.repeat(64)}`, Config: { Labels: { 'io.runly.installer.contract': label } } }]) })
  assert.throws(() => verifyRuntimeImages({ cwd, mode: 'external', images: { api: 'example/api:old' }, spawn: inspect('old') }), /IMAGE_INCOMPATIBLE/)
  assert.equal(fs.existsSync(join(cwd, '.runly-installer/images.json')), false)
  const result = verifyRuntimeImages({ cwd, mode: 'external', images: { api: 'example/api:chosen' }, spawn: inspect(INSTALLER_CONTRACT) })
  assert.equal(result.api, `sha256:${'c'.repeat(64)}`)
})

test('images that download pnpm at runtime are rejected before migrating, with the probe run offline', t => {
  const cwd = fixture(t), calls = []
  const corepackDownload = { status: 1, stdout: '', stderr: '! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-9.15.0.tgz\nError: getaddrinfo EAI_AGAIN registry.npmjs.org' }
  const spawn = runResult => (_, args) => {
    calls.push(args)
    return args[0] === 'run' ? runResult : { status: 0, stdout: JSON.stringify([{ Id: `sha256:${'d'.repeat(64)}`, Config: { Labels: { 'io.runly.installer.contract': INSTALLER_CONTRACT } } }]) }
  }
  assert.throws(() => verifyRuntimeImages({ cwd, mode: 'local', images: { worker: 'example/worker:old' }, spawn: spawn(corepackDownload) }),
    /INSTALLER_RUNTIME_DEPENDENCY_UNAVAILABLE: worker image example\/worker:old needs to download pnpm@9\.15\.0 from the npm registry.*Nothing was migrated/)
  assert.deepEqual(calls[1].slice(0, 5), ['run', '--rm', '--pull=never', '--network', 'none'])
  assert.equal(fs.existsSync(join(cwd, '.runly-installer/images.json')), false)
  calls.length = 0
  const result = verifyRuntimeImages({ cwd, mode: 'local', images: { api: 'example/api:new', web: 'example/web:new' }, spawn: spawn({ status: 0, stdout: '9.15.0\n' }) })
  assert.equal(result.api, `sha256:${'d'.repeat(64)}`)
  assert.equal(calls.filter(args => args[0] === 'run').length, 1, 'web (nginx) has no pnpm to probe')
})

test('setup/recovery and script replacement cannot overlap', async t => {
  const root = fixture(t), release = acquireInstallerDeployment(root)
  assert.throws(() => acquireInstallerDeployment(root), /DEPLOYMENT_IN_PROGRESS/)
  await assert.rejects(installRelease({ root, mode: 'local', ref, manifest: manifestFor({ 'setup-local.mjs': 'new' }), readSource: () => Buffer.from('new') }), /DEPLOYMENT_IN_PROGRESS/)
  release()
  assert.equal(fs.existsSync(join(root, '.runly-installer/deploy.lock')), false)
  fs.writeFileSync(join(root, '.runly-installer/update.lock'), String(process.pid))
  assert.throws(() => acquireInstallerDeployment(root), /UPDATE_IN_PROGRESS/)
})
