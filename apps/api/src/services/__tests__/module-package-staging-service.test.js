import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { createModulePackageStagingService } from '../module-package-staging-service.js'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..')

function manifest(key = 'custom.atomic') {
  return `import { defineRunlyModule } from '@runly/module-engine'
export default defineRunlyModule({
  key: '${key}', name: 'Atomic', version: '1.0.0', kind: 'FEATURE',
  icon: 'Package', color: '#2563EB', pwa: { shortName: 'Atomic', startPath: '/inicio' },
  dependencies: [], models: [], views: [], permissions: [], navigation: []
})`
}

async function zipOf(files) {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer' })
}

// P0-01: staging import()s the manifest, so authority is checked before any byte is written.
test('refuses to stage (and so to execute) a package without a code authority', async (t) => {
  const root = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-stage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const canary = path.join(root, 'executed.txt')
  // Inert canary: the manifest only writes a marker file if it is ever imported.
  const body = `import fs from 'node:fs'\nfs.writeFileSync(${JSON.stringify(canary)}, 'x')\n${manifest()}`
  const service = createModulePackageStagingService()
  for (const authority of [undefined, null, '', 'company-admin', 'PLATFORM-OWNER']) {
    await assert.rejects(
      service.stageZipPackage({ authority, key: 'custom.atomic', modulesDir: root, fileBuffer: await zipOf({ 'module.manifest.js': body }) }),
      { code: 'MODULE_CODE_AUTHORITY_REQUIRED', statusCode: 403 },
    )
  }
  await assert.rejects(fs.access(canary), 'the package code must never run')
  assert.deepEqual(await fs.readdir(path.join(root, '.staging')).catch(() => []), [])
})

test('stages and inspects a valid package, then cleans it', async (t) => {
  const root = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-stage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const service = createModulePackageStagingService()
  const staged = await service.stageZipPackage({ authority: 'platform-owner',
    key: 'custom.atomic', modulesDir: root,
    fileBuffer: await zipOf({ 'custom.atomic/module.manifest.js': manifest(), 'custom.atomic/README.md': 'ok' }),
  })
  assert.equal(staged.inspection.files, 2)
  assert.equal(staged.inspection.moduleKey, 'custom.atomic')
  assert.match(staged.packageHash, /^[a-f0-9]{64}$/)
  await fs.access(path.join(staged.packageDir, 'module.manifest.js'))
  await service.cleanupStage(staged)
  await assert.rejects(fs.access(staged.operationDir))
})

test('rejects malformed ZIP and leaves no staging residue', async (t) => {
  const root = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-stage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const service = createModulePackageStagingService()
  await assert.rejects(
    service.stageZipPackage({ authority: 'platform-owner', key: 'custom.atomic', modulesDir: root, fileBuffer: Buffer.from('broken') }),
    { code: 'INVALID_ZIP' },
  )
  const staged = await fs.readdir(path.join(root, '.staging')).catch(() => [])
  assert.deepEqual(staged, [])
})

// Regression: the module-key format check used to be hyphen-only while
// @runly/module-compiler's own MODULE_KEY pattern (definition.js) allows
// underscores — a Builder-compiled package for e.g. `custom.vehicle_control`
// passed the Builder's compile-time validation and then failed here at
// publish time with a bare INVALID_MODULE_KEY. Found during golden-path QA.
test('stages a package whose key uses an underscore, matching the compiler MODULE_KEY pattern', async (t) => {
  const root = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-stage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const service = createModulePackageStagingService()
  const staged = await service.stageZipPackage({ authority: 'platform-owner',
    key: 'custom.vehicle_control', modulesDir: root,
    fileBuffer: await zipOf({ 'module.manifest.js': manifest('custom.vehicle_control') }),
  })
  assert.equal(staged.inspection.moduleKey, 'custom.vehicle_control')
})

test('rejects traversal, duplicate normalized paths and wrong manifest keys', async (t) => {
  const root = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-stage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const service = createModulePackageStagingService()

  await assert.rejects(service.stageZipPackage({ authority: 'platform-owner',
    key: 'custom.atomic', modulesDir: root,
    fileBuffer: await zipOf({ 'module.manifest.js': manifest(), '../escape.txt': 'bad' }),
  }), { code: 'UNSAFE_ZIP_ENTRY' })

  await assert.rejects(service.stageZipPackage({ authority: 'platform-owner',
    key: 'custom.atomic', modulesDir: root,
    fileBuffer: await zipOf({ 'module.manifest.js': manifest('custom.other') }),
  }), { code: 'MANIFEST_KEY_MISMATCH' })

  const duplicate = new JSZip()
  duplicate.file('module.manifest.js', manifest())
  duplicate.file('Readme.md', 'one')
  duplicate.file('README.md', 'two')
  await assert.rejects(service.stageZipPackage({ authority: 'platform-owner',
    key: 'custom.atomic', modulesDir: root,
    fileBuffer: await duplicate.generateAsync({ type: 'nodebuffer' }),
  }), { code: 'DUPLICATE_ZIP_ENTRY' })
})

test('rejects a malformed manifest and removes its operation directory', async (t) => {
  const root = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-stage-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const service = createModulePackageStagingService()
  await assert.rejects(service.stageZipPackage({ authority: 'platform-owner',
    key: 'custom.atomic', modulesDir: root,
    fileBuffer: await zipOf({ 'module.manifest.js': 'export default {' }),
  }), { code: 'INVALID_MANIFEST' })
  assert.deepEqual(await fs.readdir(path.join(root, '.staging')), [])
})
