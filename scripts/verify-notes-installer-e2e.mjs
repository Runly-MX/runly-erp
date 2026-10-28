// Real setup-local / setup-external runs against disposable Supabase stacks, with the API,
// Worker and Web images built from the exact HEAD under test (scripts/build-local-api-image.mjs).
// An "existing installation" is created with the previous API image and legacy public Notes buckets.
//   node scripts/verify-notes-installer-e2e.mjs --api-image=... --worker-image=... --web-image=... [--legacy-image=runly-realtime2:full-api-fa6f6d2a2877]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { delimiter, dirname, join, resolve, sep } from 'node:path'
import { createStudioStack, command, unusedPort } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { prepareDisposableNotesStorageOwner } from './fixtures/realtime-2/notes-storage-owner.mjs'
import { installRelease } from '../infra/installer/update-installer.mjs'
import { diffInventories } from './rehearsal/lib/inventory.mjs'

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const images = { api: arg('api-image'), worker: arg('worker-image'), web: arg('web-image') }
const legacyImage = arg('legacy-image', 'runly-realtime2:full-api-fa6f6d2a2877')
const only = arg('only', '').split(',').filter(Boolean)
for (const value of Object.values(images)) assert.match(value ?? '', /^runly-notifications:(api|worker|web)-[a-f0-9]+$/)
const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
for (const [kind, image] of Object.entries(images)) await command('docker', ['build', '--pull=false', '-t', image.replace(/-[a-f0-9]+$/, '-installer'), '-'], { input: `FROM ${image}\nLABEL io.runly.installer.contract="studio-realtime-1"\n` })
const tagged = Object.fromEntries(Object.entries(images).map(([kind, image]) => [kind, image.replace(/-[a-f0-9]+$/, '-installer')]))
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|pathext|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles(?:\(x86\))?|programw6432|homedrive|homepath|home)$/i.test(key)))
const manifest = JSON.parse(await readFile('infra/installer/installer-release.json', 'utf8'))
const sources = new Map(await Promise.all(Object.keys(manifest.files).map(async file => [file, Buffer.from((await readFile(`infra/installer/${file}`, 'utf8')).replaceAll('\r\n', '\n'))])))
const require = createRequire(resolve('apps/api/package.json'))
const sharp = require('sharp')
const { createClient } = require('@supabase/supabase-js')
const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#2563eb' } }).png().toBuffer()
const results = []
const wait = ms => new Promise(r => setTimeout(r, ms))

// An existing installation: schema from the previous API image, a note and an image in a public bucket.
async function seedLegacy(stack) {
  const { users, companies, admin } = await seedStudioScenario(stack), company = companies[0]
  await stack.pool.query("UPDATE runly_module SET enabled=true,status='INSTALLED' WHERE key IN ('runly.notes')")
  const note = (await stack.pool.query("INSERT INTO notes(company_id,owner_user_id,title) VALUES($1,$2,'Historica') RETURNING id", [company.id, users[0].id])).rows[0]
  await admin.storage.createBucket('runly-notes', { public: true })
  const key = `companies/${company.id}/notes/${note.id}/legacy.png`
  assert.equal((await admin.storage.from('runly-notes').upload(key, png, { contentType: 'image/png' })).error, null)
  const url = `${stack.urls.kong}/storage/v1/object/public/runly-notes/${key}`
  assert.equal((await fetch(url)).status, 200, 'legacy fixture must start publicly readable')
  await stack.pool.query('UPDATE notes SET content=$1::jsonb WHERE id=$2', [JSON.stringify(`<p>Historica</p><img src="${url}">`), note.id])
  return { noteId: note.id, key, url, content: (await stack.pool.query('SELECT content FROM notes WHERE id=$1', [note.id])).rows[0].content, admin }
}

// The Installer published before the ordering fix (2026.10.28.5), read from Git, is what an existing
// installation has on disk when update-*.sh runs. The update scripts then refresh it from a controlled origin.
const PREVIOUS_INSTALLER_COMMIT = '330e4a71204990cc6b5bd7f4dfdfe20bd08a8296'
let previousReleaseCache = null
function previousRelease() {
  if (previousReleaseCache) return previousReleaseCache
  const show = file => execFileSync('git', ['show', `${PREVIOUS_INSTALLER_COMMIT}:infra/installer/${file}`], { maxBuffer: 64 * 1024 * 1024 })
  const previousManifest = JSON.parse(show('installer-release.json').toString('utf8'))
  previousReleaseCache = { manifest: previousManifest, sources: new Map(Object.keys(previousManifest.files).map(file => [file, Buffer.from(show(file).toString('utf8').replaceAll('\r\n', '\n'))])) }
  return previousReleaseCache
}
const updateFixture = resolve('scripts/fixtures/installer-update')
// Git Bash explicitly: on Windows a bare bash can resolve to the WSL launcher, which cannot read D:/ paths.
const gitBash = process.env.RUNLY_BASH ?? (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash')
const recoveryStateScript = (await readFile('docs/deployment/EXTERNAL_NOTES_STORAGE_RECOVERY.md', 'utf8')).replaceAll('\r\n', '\n').match(/```js\n([\s\S]*?)```/)[1]
const NOTES_MIGRATION = '20261028011349_notes_private_images'
// Everything an update could change in the application schema/data: applied migrations,
// the column catalog, and the rows the seed writes. Equal snapshots mean nothing ran.
async function schemaSnapshot(stack) {
  const has = (await stack.pool.query("SELECT to_regclass('public._prisma_migrations') AS t")).rows[0].t
  if (!has) return { migrations: [], columns: null, seeded: null }
  const migrations = (await stack.pool.query('SELECT migration_name FROM _prisma_migrations ORDER BY migration_name')).rows.map(row => row.migration_name)
  const columns = (await stack.pool.query("SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type, ',' ORDER BY table_name, column_name)) AS h FROM information_schema.columns WHERE table_schema='public'")).rows[0].h
  const seeded = (await stack.pool.query('SELECT (SELECT count(*) FROM permission) AS permissions, (SELECT count(*) FROM runly_module) AS modules')).rows[0]
  return { migrations, columns, seeded }
}

async function scenario(name, { mode, legacy = true, prepare = null, owner = 'none', repeat = true, expectFailure = null, after = null, args = [], via = null, fail = '', composeFault = false, schemaChangesOnFailure = false, premigrated = false }) {
  if (only.length && !only.includes(name)) return
  const stack = await createStudioStack({ apiImage: legacy ? legacyImage : tagged.api })
  stack.pool.on('error', () => {})
  const directory = join(stack.directory, 'full-installer'), appName = mode === 'local' ? stack.name : `${stack.name}-app`
  const appCompose = ['compose', '--project-name', appName, '--env-file', join(directory, `.env.${mode}`), '-f', join(directory, 'docker-compose.yml'), '-f', join(directory, `docker-compose.${mode}.override.yml`)]
  if (mode === 'local') appCompose.push('-f', join(directory, 'supabase/docker-compose.supabase.yml'))
  try {
    const config = JSON.parse(await readFile(stack.composeFile, 'utf8'))
    // A fresh install lets the installer apply the Realtime owner SQL; the previous version's schema needs it up front.
    if (!legacy) config.services['supabase-db'].volumes = config.services['supabase-db'].volumes.filter(v => !v.target.includes('studio-realtime-role'))
    await writeFile(stack.composeFile, JSON.stringify(config))
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'])
    await stack.verifyTarget()
    if (legacy) await stack.initialize()
    const state = legacy ? await seedLegacy(stack) : null
    if (prepare) await prepare(stack, state)
    await mkdir(directory)
    const installed = via ? previousRelease() : { manifest, sources }
    await installRelease({ root: directory, mode, ref: (via ? 'c' : 'd').repeat(40), manifest: installed.manifest, readSource: file => installed.sources.get(file) })
    // A controlled origin that serves the versioned distribution the update scripts download.
    const originDirectory = join(stack.directory, 'origin'), currentRef = 'd'.repeat(40)
    const origin = {
      directory: originDirectory,
      setFail: text => writeFile(join(originDirectory, 'fail'), text),
      requests: async () => (await readFile(join(originDirectory, 'requests.log'), 'utf8').catch(() => '')).split(/\r?\n/).filter(Boolean),
    }
    if (via) {
      await mkdir(join(originDirectory, currentRef), { recursive: true })
      for (const file of [...Object.keys(manifest.files), 'installer-release.json']) {
        await mkdir(dirname(join(originDirectory, currentRef, file)), { recursive: true })
        await writeFile(join(originDirectory, currentRef, file), file === 'installer-release.json' ? await readFile('infra/installer/installer-release.json') : sources.get(file))
      }
      // The Dev Kit export is downloaded from main by setup-external; serve it from the same origin.
      await cp('infra/installer/devkit-export', join(originDirectory, currentRef, 'devkit-export'), { recursive: true })
      await writeFile(join(originDirectory, 'main-ref'), currentRef)
      await origin.setFail(fail)
      if (composeFault) await writeFile(join(originDirectory, 'fail-compose-up-once'), '1')
      if (!existsSync(join(directory, via.script))) await copyFile(join('infra/installer', via.script), join(directory, via.script))
    }
    const installerState = async () => JSON.parse(await readFile(join(directory, '.runly-installer/state.json'), 'utf8'))
    const values = new Map((await readFile(join(stack.directory, 'test.env'), 'utf8')).split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    const appUrl = config.services['runly-api'].environment.DATABASE_URL
    const settings = {
      RUNLY_COMPOSE_PROJECT_NAME: appName, RUNLY_CONTAINER_PREFIX: appName, RUNLY_INSTANCE_ID: stack.name.slice(-8),
      RUNLY_API_PORT: '4010', RUNLY_API_HOST_PORT: String(stack.ports.api), RUNLY_WEB_HOST_PORT: String(stack.ports.web), RUNLY_PUBLIC_BIND_ADDR: '127.0.0.1',
      RUNLY_SUPABASE_MODE: 'selfhosted', RUNLY_SUPABASE_STUDIO_HOST_PORT: String(await unusedPort()),
      LIVEKIT_MODE: 'disabled', TRANSCRIPTION_MODE: 'disabled', MIRAI_TTS_MODE: 'disabled', BACKUP_MODE: 'disabled', RUNLY_OFFICE_ENABLED: 'false',
      RUNLY_API_LOCAL_IMAGE: tagged.api, RUNLY_WORKER_LOCAL_IMAGE: tagged.worker, RUNLY_WEB_LOCAL_IMAGE: tagged.web,
      RUNLY_API_IMAGE: tagged.api, RUNLY_WORKER_IMAGE: tagged.worker, RUNLY_WEB_EXTERNAL_IMAGE: tagged.web,
      DATABASE_URL: appUrl, DIRECT_URL: appUrl, SUPABASE_URL: 'http://supabase-kong:8000', RUNLY_SUPABASE_PUBLIC_URL: stack.urls.kong,
      SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: stack.secret.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET, RUNLY_INTERNAL_SECRET: stack.secret.SUPABASE_JWT_SECRET,
      RUNLY_API_URL: stack.urls.api, RUNLY_APP_URL: stack.urls.web, CORS_ORIGIN: stack.urls.web,
    }
    if (mode === 'external') settings.RUNLY_MIGRATION_NETWORK = `${stack.name}_default`
    for (const [key, value] of Object.entries(settings)) values.set(key, value)
    await writeFile(join(directory, `.env.${mode}`), [...values].map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
    const override = mode === 'local' ? { services: { 'supabase-db': { ports: [{ target: 5432, published: String(stack.ports.db), host_ip: '127.0.0.1' }] } } } : { networks: { default: { external: true, name: `${stack.name}_default` } } }
    await writeFile(join(directory, `docker-compose.${mode}.override.yml`), JSON.stringify(override))
    await mkdir(join(directory, 'custom-modules'), { recursive: true })
    if (mode === 'external') {
      await mkdir(join(directory, '.secrets'), { recursive: true })
      await writeFile(join(directory, '.secrets/studio-admin.env'), `SUPABASE_ADMIN_DATABASE_URL=${appUrl.replace('postgres:', 'supabase_admin:')}\n`)
    }
    const storageOwnerUrl = config.services['supabase-storage'].environment.DATABASE_URL
    const ownerEnv = owner === 'good' ? { RUNLY_NOTES_OWNER_DATABASE_URL: storageOwnerUrl }
      : owner === 'bad' ? { RUNLY_NOTES_OWNER_DATABASE_URL: storageOwnerUrl.replace(/\/\/([^:]+):[^@]+@/, '//$1:wrong-password-marker@') } : {}
    const run = async (suffix, { env = {}, extraArgs = args } = {}) => {
      const log = join(stack.directory, `${name}-${suffix}.log`)
      const viaEnv = { PATH: `${join(updateFixture, 'bin')}${delimiter}${cleanEnv.PATH ?? cleanEnv.Path ?? ''}`, NODE_OPTIONS: `--require ${join(updateFixture, 'origin-preload.cjs').split(sep).join('/')}`, RUNLY_TEST_ORIGIN: originDirectory.split(sep).join('/'), RUNLY_TEST_BIN: join(updateFixture, 'bin').split(sep).join('/'), BASH_ENV: join(updateFixture, 'bash-env.sh').split(sep).join('/') }
      try { if (via) await command(gitBash, [join(directory, via.script).split(sep).join('/')], { env: { ...Object.fromEntries(Object.entries(cleanEnv).filter(([key]) => key.toLowerCase() !== 'path')), ...ownerEnv, ...viaEnv, ...env }, log }); else await command(process.execPath, [join(directory, `setup-${mode}.mjs`), '--skip-pull', '--skip-dev-kit', ...extraArgs], { env: { ...cleanEnv, ...ownerEnv, ...env }, log }); return { ok: true, output: await readFile(log, 'utf8') } }
      catch { return { ok: false, output: await readFile(log, 'utf8') } }
    }
    const containerExists = async () => (await command('docker', ['ps', '-a', '--filter', `name=${appName}-api-${mode}`, '--format', '{{.Names}}'])).includes(`${appName}-api-${mode}`)
    const before = await schemaSnapshot(stack)
    const installerBefore = via ? await installerState() : null
    const first = await run('first')
    if (expectFailure) {
      assert.equal(first.ok, false, `${name}: installation must fail`)
      assert.match(first.output, expectFailure, `${name}: failure must be explicit`)
      for (const secret of [ownerEnv.RUNLY_NOTES_OWNER_DATABASE_URL, 'wrong-password-marker'].filter(Boolean)) assert.equal(first.output.includes(secret), false, `${name}: output leaked the owner credential`)
      assert.equal(await containerExists(), false, `${name}: no API may be started when the gate fails`)
      // The preflight runs before any migration or seed: a failed update leaves the application schema exactly as it was.
      if (legacy && !premigrated) assert.equal(before.migrations.includes(NOTES_MIGRATION), false, `${name}: fixture must start without the Notes migration`)
      if (!schemaChangesOnFailure) assert.deepEqual(await schemaSnapshot(stack), before, `${name}: a failed preflight must not migrate or seed`)
      if (state) assert.equal((await fetch(state.url)).status !== undefined, true)
    } else {
      if (!first.ok && via) console.log([`--- ${name}: origin requests ---`, ...(await origin.requests()).slice(-12), '--- origin files ---', (await command('ls', ['-la', join(originDirectory, currentRef)]).catch(e => String(e.message))).slice(0, 600)].join(String.fromCharCode(10)))
      if (!first.ok) console.log(`--- ${name}: API container log ---
` + (await command('docker', ['logs', '--tail', '60', `${appName}-api-${mode}`]).catch(e => String(e.message))).slice(-3500))
      assert.equal(first.ok, true, `${name}: installation must succeed\n${first.output.slice(-1500)}`)
      // The installer already waited for /health; a host-side request can still hit a connection reset while Docker publishes the port, so retry briefly and keep the container log if it never answers.
      let healthy = false
      for (let attempt = 0; attempt < 20 && !healthy; attempt++) { healthy = await fetch(`${stack.urls.api}/health`).then(r => r.status === 200, () => false); if (!healthy) await wait(1000) }
      if (!healthy) console.log((await command('docker', ['logs', '--tail', '40', `${appName}-api-${mode}`]).catch(e => String(e.message))).slice(-2500))
      assert.equal(healthy, true, `${name}: API must answer /health from the host`)
      assert.match(first.output, /Verifying Notes private image Storage/)
      assert.match(first.output, /Probing Notes Storage with anonymous requests/)
      const inspected = await command('docker', ['inspect', `${appName}-api-${mode}`, '--format', '{{json .Config.Env}}'])
      assert.equal(inspected.includes('RUNLY_NOTES_OWNER_DATABASE_URL'), false, 'owner connection must not reach the API container')
      // Real requests, not just /health: anonymous reads stay denied, bytes are preserved.
      if (state) {
        const statuses = await Promise.all([state.url, `${stack.urls.kong}/storage/v1/object/runly-notes/${state.key}`, `${stack.urls.kong}/storage/v1/render/image/public/runly-notes/${state.key}?width=8`].map(async url => (await fetch(url, { headers: { apikey: stack.secret.SUPABASE_ANON_KEY } })).status))
        assert.ok(statuses.every(status => status !== 200), `${name}: anonymous reads must be denied, got ${statuses}`)
        assert.equal((await state.admin.storage.getBucket('runly-notes')).data.public, false)
        const stored = await state.admin.storage.from('runly-notes').download(state.key)
        assert.equal(Buffer.from(await stored.data.arrayBuffer()).equals(png), true, `${name}: original bytes must be preserved`)
        assert.equal(JSON.stringify((await stack.pool.query('SELECT content FROM notes WHERE id=$1', [state.noteId])).rows[0].content), JSON.stringify(state.content), `${name}: note content must be unchanged`)
        assert.ok(Number((await stack.pool.query('SELECT count(*) FROM note_image_binding WHERE note_id=$1', [state.noteId])).rows[0].count) >= 1, `${name}: historical image must be bound to its note`)
      }
      if (repeat) { const again = await run('repeat'); assert.equal(again.ok, true, `${name}: repeated installation must succeed\n${again.output.slice(-1500)}`) }
    }
    if (after) await after({ stack, run, state, containerExists, storageOwnerUrl, origin, installerState, installerBefore, before, directory, tagged, snapshot: () => schemaSnapshot(stack),
      // The recovery runbook's own read-only state script, run exactly as documented.
      readState: async () => JSON.parse(await command('docker', ['run', '--rm', '-i', '--network', `${stack.name}_default`, '--env-file', join(directory, `.env.${mode}`), tagged.api, 'node', '-'], { input: recoveryStateScript })),
      apiContainer: async () => (await command('docker', ['inspect', `${appName}-api-${mode}`, '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}'])).trim() })
    results.push(`${name}: PASS`); console.log(`${name}: PASS`)
  } finally {
    try {
      if (await readFile(join(directory, `.env.${mode}`)).catch(() => null)) await command('docker', [...appCompose, '--profile', mode, 'down', '--volumes', '--remove-orphans'], { env: { ...cleanEnv, RUNLY_COMPOSE_PROJECT_NAME: appName, RUNLY_CONTAINER_PREFIX: appName }, log: join(stack.directory, 'full-cleanup.log') })
    } finally { await stack.close() }
  }
}

const dropGuardAndOpen = async stack => {
  const owner = await ownerPool(stack)
  try {
    await owner.query('DROP TRIGGER IF EXISTS runly_notes_bucket_private_v1 ON storage.buckets')
    await owner.query("UPDATE storage.buckets SET public=true WHERE id='runly-notes'")
  } finally { await owner.end() }
}
async function ownerPool(stack) {
  const { default: pg } = await import('pg')
  const configuration = JSON.parse(await readFile(stack.composeFile, 'utf8'))
  const connection = new URL(configuration.services['supabase-storage'].environment.DATABASE_URL)
  connection.hostname = '127.0.0.1'; connection.port = String(stack.ports.db)
  return new pg.Pool({ connectionString: connection.href })
}
const policyOnly = async stack => {
  const owner = await ownerPool(stack)
  try { await owner.query(`CREATE POLICY runly_notes_private_images_v1 ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
    USING (bucket_id NOT IN ('runly-notes','atlas-notes')) WITH CHECK (bucket_id NOT IN ('runly-notes','atlas-notes'))`) } finally { await owner.end() }
}

await scenario('local-existing-upgrade', { mode: 'local' })
await scenario('local-fresh', { mode: 'local', legacy: false })
await scenario('external-owner-available', { mode: 'external', owner: 'good' })
await scenario('external-no-owner-unprepared', { mode: 'external', repeat: false, expectFailure: /NOTES_STORAGE_NOT_PREPARED/ })
await scenario('external-bad-owner-credential', { mode: 'external', owner: 'bad', repeat: false, expectFailure: /NOTES_STORAGE_NOT_PREPARED|preflight failed/ })
await scenario('external-partial-preparation', { mode: 'external', prepare: policyOnly, repeat: false, expectFailure: /NOTES_STORAGE_NOT_PREPARED/ })
await scenario('external-no-owner-prepared', { mode: 'external', prepare: prepareDisposableNotesStorageOwner })
await scenario('external-regression-to-unsafe', { mode: 'external', prepare: prepareDisposableNotesStorageOwner, after: async ({ stack, run, state, storageOwnerUrl, snapshot, readState, apiContainer }) => {
  await dropGuardAndOpen(stack)
  const migrated = await snapshot()
  const stateBefore = await readState()
  const containerBefore = await apiContainer()
  for (const name of [NOTES_MIGRATION, '20261211000000_studio_retired_asset_lineage']) assert.ok(stateBefore.migrations.includes(name), `precondition: ${name} applied`)
  assert.deepEqual([stateBefore.guard, stateBefore.policy], [0, 1], 'precondition: guard missing')
  assert.equal(stateBefore.buckets.find(bucket => bucket.id === 'runly-notes').public, true, 'precondition: bucket public again')
  assert.ok(stateBefore.objects.find(row => row.bucket_id === 'runly-notes').n >= 1, 'precondition: stored objects exist')
  assert.equal(migrated.migrations.includes(NOTES_MIGRATION), true, 'precondition: the Prisma migration is already applied')
  const regressed = await run('regressed')
  assert.equal(regressed.ok, false, 'an update over regressed Storage must not succeed silently')
  assert.match(regressed.output, /NOTES_STORAGE_NOT_PREPARED/)
  assert.deepEqual(await snapshot(), migrated, 'a failed preflight over a migrated database must not change the schema or seed')
  assert.equal(await apiContainer(), containerBefore, 'a failed preflight must not replace or restart the running containers')
  assert.deepEqual(await readState(), stateBefore, 'a failed preflight must not change Storage, notes or migration history')
  // Recovery: migration applied but guard missing. Re-running with the owner restores the guard
  // idempotently without reverting migrations or touching data.
  const recovered = await run('recovered', { env: { RUNLY_NOTES_OWNER_DATABASE_URL: storageOwnerUrl } })
  assert.equal(recovered.ok, true, `recovery with the owner must succeed
${recovered.output.slice(-1500)}`)
  assert.deepEqual(await snapshot(), migrated, 'recovery must not revert or add migrations')
  const stateAfter = await readState()
  assert.deepEqual(stateAfter.migrations, stateBefore.migrations, 'migration history must be preserved')
  assert.deepEqual([stateAfter.notes, stateAfter.objects], [stateBefore.notes, stateBefore.objects], 'notes and every Storage object must be preserved')
  assert.deepEqual([stateAfter.guard, stateAfter.policy], [1, 1], 'guard and policy must be present after recovery')
  assert.equal(stateAfter.buckets.find(bucket => bucket.id === 'runly-notes').public, false, 'bucket must be private after recovery')
  const owner = await ownerPool(stack)
  try {
    assert.equal((await owner.query("SELECT 1 FROM pg_trigger WHERE tgname='runly_notes_bucket_private_v1' AND NOT tgisinternal")).rowCount, 1, 'guard must be restored')
    assert.equal((await owner.query("SELECT public FROM storage.buckets WHERE id='runly-notes'")).rows[0].public, false, 'bucket must be private again')
  } finally { await owner.end() }
  assert.equal(JSON.stringify((await stack.pool.query('SELECT content FROM notes WHERE id=$1', [state.noteId])).rows[0].content), JSON.stringify(state.content), 'note content must survive the recovery')
  const again = await run('recovered-again', { env: { RUNLY_NOTES_OWNER_DATABASE_URL: storageOwnerUrl } })
  assert.equal(again.ok, true, 'a second recovery run must be idempotent')
} })
await scenario('external-skip-migrate-unprepared', { mode: 'external', repeat: false, args: ['--skip-migrate'], expectFailure: /NOTES_STORAGE_NOT_PREPARED/ })
await scenario('external-up-only-unprepared', { mode: 'external', repeat: false, args: ['--up-only'], expectFailure: /NOTES_STORAGE_NOT_PREPARED/ })

// ---- update-external.sh / update-local.sh against a controlled origin (no GitHub, no registry) ----
// The installation on disk is the previously published Installer (2026.10.28.5); the scripts download
// the current distribution from the fixture origin and run the real setup. Image pulls and prunes are
// no-ops (the images are local); any other outbound request is refused and recorded.
const published = () => manifest.version
const noUnexpectedInstallerRequests = async origin => {
  const requests = await origin.requests()
  assert.ok(requests.some(line => line.startsWith('https://api.github.com/repos/Runly-MX/runly-erp/git/ref/heads/main')), 'the script must resolve the published ref')
  assert.deepEqual(requests.filter(line => line.startsWith('UNEXPECTED') && line.includes('/infra/installer/')), [], 'no Installer file may be fetched outside the controlled origin')
}
await scenario('update-script-external-owner', { mode: 'external', via: { script: 'update-external.sh' }, owner: 'good', repeat: false, after: async ({ origin, installerState, installerBefore }) => {
  assert.notEqual(installerBefore.version, published(), 'precondition: the installation starts on the previous Installer')
  assert.equal((await installerState()).version, published(), 'update-external.sh must refresh the Installer')
  await noUnexpectedInstallerRequests(origin)
} })
await scenario('update-script-external-unprepared', { mode: 'external', via: { script: 'update-external.sh' }, repeat: false, expectFailure: /NOTES_STORAGE_NOT_PREPARED/, after: async ({ installerState, installerBefore }) => {
  // The refresh of the scripts is complete and safe; the failure is the Storage gate, before any migration.
  assert.equal((await installerState()).version, published())
  assert.notEqual(installerBefore.version, published())
} })
for (const [name, failure, expected] of [
  ['update-script-refresh-network', 'setup-external.mjs network', /simulated network failure|INSTALLER_DOWNLOAD_FAILED/],
  ['update-script-refresh-corrupt', 'setup-external.mjs corrupt', /INSTALLER_INTEGRITY_FAILED/],
  ['update-script-bootstrap-unreachable', 'bootstrap-external.sh network', /simulated network failure/],
]) {
  await scenario(name, { mode: 'external', via: { script: 'update-external.sh' }, owner: 'good', fail: failure, repeat: false, expectFailure: expected, after: async ({ origin, run, installerState, installerBefore, containerExists, snapshot, before }) => {
    // An interrupted refresh changes nothing: the old Installer, its files and the database stay as they were.
    assert.deepEqual(await installerState(), installerBefore, 'a failed refresh must leave the installed Installer untouched')
    assert.deepEqual(await snapshot(), before, 'a failed refresh must not run migrations or the seed')
    await origin.setFail('')
    const retry = await run('retry')
    assert.equal(retry.ok, true, `rerun after the origin recovers must succeed\n${retry.output.slice(-1200)}`)
    assert.equal((await installerState()).version, published())
    assert.equal(await containerExists(), true)
  } })
}
await scenario('update-script-compose-interrupted', { mode: 'external', via: { script: 'update-external.sh' }, owner: 'good', composeFault: true, schemaChangesOnFailure: true, repeat: false, expectFailure: /INSTALLER_SETUP_FAILED|simulated interruption/, after: async ({ run, snapshot, before, installerState, containerExists }) => {
  // Interruption while recreating containers: migrations were already applied and are NOT rolled back.
  const interrupted = await snapshot()
  assert.equal(before.migrations.includes(NOTES_MIGRATION), false, 'precondition: pending migration')
  assert.equal(interrupted.migrations.includes(NOTES_MIGRATION), true, 'the migrations stay applied after an interrupted recreation')
  assert.equal(await containerExists(), false)
  assert.equal((await installerState()).version, published())
  const retry = await run('retry')
  assert.equal(retry.ok, true, `rerun must converge\n${retry.output.slice(-1200)}`)
  assert.deepEqual((await snapshot()).migrations, interrupted.migrations, 'the rerun must not repeat or revert migrations')
  assert.equal(await containerExists(), true)
} })
await scenario('update-script-migration-failed', { mode: 'external', via: { script: 'update-external.sh' }, owner: 'good', schemaChangesOnFailure: true, repeat: false,
  prepare: async stack => { await stack.pool.query('CREATE TABLE note_image_binding (id integer)') },
  expectFailure: /INSTALLER_SETUP_FAILED|db:migrate|failed with exit code/, after: async ({ stack, run, containerExists, tagged, directory }) => {
    // A failed Prisma migration is recorded as unfinished and is NOT rolled back automatically.
    const unfinished = async () => (await stack.pool.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows.map(row => row.migration_name)
    assert.deepEqual(await unfinished(), ['20261028011349_notes_private_images'])
    assert.equal(await containerExists(), false)
    await stack.pool.query('DROP TABLE note_image_binding')
    const blocked = await run('blocked')
    assert.equal(blocked.ok, false, 'fixing the cause is not enough: the Installer (or Prisma) refuses to continue over a failed migration')
    assert.match(blocked.output, /STUDIO_FAILURE_REQUIRES_REVIEW|P3009|failed migrations|failed to apply/i)
    // The documented manual step: mark it rolled back (its transaction already was), then the update converges.
    await command('docker', ['run', '--rm', '--network', `${stack.name}_default`, '--env-file', join(directory, '.env.external'), tagged.api, 'node', 'node_modules/prisma/build/index.js', 'migrate', 'resolve', '--rolled-back', '20261028011349_notes_private_images'])
    const recovered = await run('recovered')
    assert.equal(recovered.ok, true, `update must converge after the manual resolve\n${recovered.output.slice(-1200)}`)
    assert.deepEqual(await unfinished(), [])
    assert.equal(await containerExists(), true)
  } })
await scenario('update-script-local', { mode: 'local', via: { script: 'update-local.sh' }, repeat: false, after: async ({ origin, installerState, installerBefore }) => {
  assert.notEqual(installerBefore.version, published())
  assert.equal((await installerState()).version, published(), 'update-local.sh must refresh the Installer')
  await noUnexpectedInstallerRequests(origin)
} })

// ---- Rehearsal of the affected external instance on a disposable replica ----
// The replica reproduces what the previous Installer left behind: the Prisma migrations and the seed were applied
// with the candidate image, Storage was never prepared (no guard, no policy) and the Notes buckets are still public.
// It holds users, permissions, notes and historical objects of several kinds in both buckets. A restored backup of the
// real instance is NOT used here; this is a synthetic replica, and the rehearsal on the real backup stays pending.
let replicaBefore = null, replicaInventoryBefore = null
// The rehearsal tooling itself (scripts/rehearsal/replica-inventory.mjs) runs against the disposable replica exactly as it
// would against a restored copy: connection data only through the environment, loopback hosts only.
async function runInventoryCli(stack, output) {
  const config = JSON.parse(await readFile(stack.composeFile, 'utf8')), url = new URL(config.services['runly-api'].environment.DATABASE_URL)
  url.hostname = '127.0.0.1'; url.port = String(stack.ports.db)
  const env = { ...cleanEnv, REPLICA_DATABASE_URL: url.href, REPLICA_SUPABASE_URL: stack.urls.kong, REPLICA_SERVICE_ROLE_KEY: stack.secret.SUPABASE_SERVICE_ROLE_KEY }
  const summary = await command(process.execPath, ['scripts/rehearsal/replica-inventory.mjs', 'collect', '--output=' + output], { env })
  assert.equal(summary.includes(stack.secret.SUPABASE_SERVICE_ROLE_KEY) || summary.includes(url.password), false, 'the inventory CLI must not print connection data')
  return JSON.parse(await readFile(output, 'utf8'))
}
const supabaseAdminFor = stack => createClient(stack.urls.kong, stack.secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function replicaState(stack) {
  const admin = supabaseAdminFor(stack), rows = async sql => (await stack.pool.query(sql)).rows
  const objects = {}
  for (const row of await rows("SELECT bucket_id, name FROM storage.objects WHERE bucket_id IN ('runly-notes','atlas-notes') ORDER BY bucket_id, name")) {
    const downloaded = await admin.storage.from(row.bucket_id).download(row.name)
    assert.equal(downloaded.error, null, `object ${row.bucket_id}/${row.name} must stay readable by the service role`)
    objects[`${row.bucket_id}/${row.name}`] = createHash('sha256').update(Buffer.from(await downloaded.data.arrayBuffer())).digest('hex')
  }
  return {
    migrations: (await rows('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).map(row => row.migration_name),
    people: (await rows("SELECT (SELECT count(*) FROM user_profile)::int AS users, (SELECT count(*) FROM membership)::int AS memberships, (SELECT count(*) FROM role_permission)::int AS grants, (SELECT md5(string_agg(id::text || coalesce(email,''), ',' ORDER BY id)) FROM user_profile) AS identities"))[0],
    notes: (await rows("SELECT count(*)::int AS count, md5(string_agg(id::text || coalesce(title,'') || coalesce(content::text,''), ',' ORDER BY id)) AS digest FROM notes"))[0],
    objects,
    buckets: await rows("SELECT id, public FROM storage.buckets WHERE id IN ('runly-notes','atlas-notes') ORDER BY id"),
  }
}
await scenario('external-affected-replica-rehearsal', { mode: 'external', via: { script: 'update-external.sh' }, premigrated: true, repeat: false, expectFailure: /NOTES_STORAGE_NOT_PREPARED/,
  prepare: async (stack, state) => {
    const admin = state.admin, company = (await stack.pool.query('SELECT company_id FROM notes WHERE id=$1', [state.noteId])).rows[0].company_id
    const green = await sharp({ create: { width: 24, height: 24, channels: 4, background: '#16a34a' } }).png().toBuffer()
    const extras = [['runly-notes', `companies/${company}/notes/${state.noteId}/second.png`, green, 'image/png'], ['runly-notes', `companies/${company}/notes/${state.noteId}/historic.pdf`, Buffer.from('%PDF-1.4 historical document'), 'application/pdf']]
    assert.equal((await admin.storage.createBucket('atlas-notes', { public: true })).error, null)
    extras.push(['atlas-notes', `legacy/${state.noteId}/old.png`, green, 'image/png'])
    for (const [bucket, name, bytes, contentType] of extras) assert.equal((await admin.storage.from(bucket).upload(name, bytes, { contentType })).error, null)
    // What the previous Installer did before it stopped at the Storage gate.
    const config = JSON.parse(await readFile(stack.composeFile, 'utf8')), appUrl = config.services['runly-api'].environment.DATABASE_URL
    const migrationEnv = { ...cleanEnv, DATABASE_URL: appUrl, DIRECT_URL: appUrl }
    for (const script of ['db:migrate', 'db:seed']) await command('docker', ['run', '--rm', '--network', `${stack.name}_default`, '-e', 'DATABASE_URL', '-e', 'DIRECT_URL', tagged.api, 'pnpm', script], { env: migrationEnv })
    replicaBefore = await replicaState(stack)
    replicaInventoryBefore = await runInventoryCli(stack, join(stack.directory, 'inventory-before.json'))
    assert.ok(replicaBefore.migrations.includes(NOTES_MIGRATION), 'precondition: the migrations are already applied')
    assert.deepEqual(replicaBefore.buckets.map(bucket => bucket.public), [true, true], 'precondition: both buckets are still public')
    assert.ok(Object.keys(replicaBefore.objects).length >= 4, 'precondition: historical objects of several kinds')
    assert.equal((await stack.pool.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='runly_notes_bucket_private_v1'")).rows[0].n, 0, 'precondition: no guard')
  },
  after: async ({ stack, run, state, storageOwnerUrl, containerExists, installerState, directory, origin }) => {
    // 1. Without the owner the update stops before touching schema, seed, data, Storage or containers.
    assert.deepEqual(await replicaState(stack), replicaBefore, 'a failed preflight must leave the replica exactly as it was')
    assert.equal(await containerExists(), false)
    // 2. With a temporary owner credential (process environment only) it prepares, closes the buckets and updates.
    const recovered = await run('recovered', { env: { RUNLY_NOTES_OWNER_DATABASE_URL: storageOwnerUrl } })
    assert.equal(recovered.ok, true, `update with the temporary owner must succeed\n${recovered.output.slice(-1500)}`)
    assert.equal(recovered.output.includes(storageOwnerUrl), false, 'the owner connection must not appear in the update output')
    const environment = await command('docker', ['inspect', `${stack.name}-app-api-external`, '--format', '{{json .Config.Env}}'])
    assert.equal(environment.includes('RUNLY_NOTES_OWNER_DATABASE_URL'), false, 'the owner connection must not reach the API container')
    const envFile = await readFile(join(directory, '.env.external'), 'utf8')
    assert.equal(envFile.includes('RUNLY_NOTES_OWNER_DATABASE_URL'), false, 'the owner connection must not be written to .env.external')
    assert.ok(envFile.includes(`SUPABASE_SERVICE_ROLE_KEY=${stack.secret.SUPABASE_SERVICE_ROLE_KEY}`), 'existing configuration values are preserved')
    const after = await replicaState(stack)
    const cliAfter = await runInventoryCli(stack, join(stack.directory, 'inventory-after.json'))
    // What an update legitimately writes (audit, blueprint re-sync, module registry, the Notes tables, permission seed timestamps).
    // Objects, business tables and the SEMANTIC permission/membership/identity digests must be identical.
    const updateTables = ['audit_log', 'blueprint', 'module_migration', 'note_image_binding', 'note_image_storage_state', 'realtime_authorization_revision', 'role', 'role_permission', 'runly_field', 'runly_model', 'runly_module', 'inventory_assistant_thread', 'inventory_reusable_catalog']
    assert.deepEqual(diffInventories(replicaInventoryBefore, cliAfter, { allow: ['migrations-added', 'protections', 'buckets', ...updateTables.map(table => 'tables:' + table)] }), [], 'only the expected update-time tables may change')
    assert.equal(cliAfter.semantic.grants, replicaInventoryBefore.semantic.grants, 'permission grants must be semantically identical')
    assert.ok(Object.values(replicaInventoryBefore.semantic).every(Boolean), 'the semantic digests must be computed')
    assert.deepEqual(after.migrations, replicaBefore.migrations, 'Prisma history is preserved (no migration reverted, none repeated)')
    assert.deepEqual(after.objects, replicaBefore.objects, 'every Storage object keeps its exact bytes')
    assert.deepEqual([after.people, after.notes], [replicaBefore.people, replicaBefore.notes], 'users, permissions and notes are preserved')
    assert.deepEqual(after.buckets.map(bucket => bucket.public), [false, false], 'both buckets are private')
    assert.equal((await installerState()).version, manifest.version)
    // 3. Real anonymous requests against every historical object and against the listing.
    const anonymous = { apikey: stack.secret.SUPABASE_ANON_KEY, Authorization: `Bearer ${stack.secret.SUPABASE_ANON_KEY}` }
    for (const key of Object.keys(replicaBefore.objects)) {
      const [bucket, ...rest] = key.split('/'), name = rest.join('/')
      const urls = [`/storage/v1/object/public/${bucket}/${name}`, `/storage/v1/object/${bucket}/${name}`, `/storage/v1/object/authenticated/${bucket}/${name}`, ...(name.endsWith('.png') ? [`/storage/v1/render/image/public/${bucket}/${name}?width=8`] : [])]
      for (const path of urls) assert.notEqual((await fetch(stack.urls.kong + path, { headers: anonymous })).status, 200, `anonymous read must be denied: ${bucket}/${name.slice(0, 24)}... ${path.split('/')[3]}`)
    }
    for (const bucket of ['runly-notes', 'atlas-notes']) {
      const listing = await fetch(`${stack.urls.kong}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...anonymous, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 20 }) })
      assert.ok(!listing.ok || (await listing.json()).length === 0, `anonymous listing of ${bucket} must be empty`)
    }
    // 4. A repeated update converges and changes nothing.
    const again = await run('again', { env: { RUNLY_NOTES_OWNER_DATABASE_URL: storageOwnerUrl } })
    assert.equal(again.ok, true, `a repeated update must succeed\n${again.output.slice(-1200)}`)
    assert.deepEqual(await replicaState(stack), after, 'a repeated update must not change data or history')
  } })
console.log(JSON.stringify({ passed: true, images: images, legacyImage, results }))
