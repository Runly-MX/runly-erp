// Real setup-local / setup-external runs against disposable Supabase stacks, with the API,
// Worker and Web images built from the exact HEAD under test (scripts/build-local-api-image.mjs).
// An "existing installation" is created with the previous API image and legacy public Notes buckets.
//   node scripts/verify-notes-installer-e2e.mjs --api-image=... --worker-image=... --web-image=... [--legacy-image=runly-realtime2:full-api-fa6f6d2a2877]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createStudioStack, command, unusedPort } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { prepareDisposableNotesStorageOwner } from './fixtures/realtime-2/notes-storage-owner.mjs'
import { installRelease } from '../infra/installer/update-installer.mjs'

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

async function scenario(name, { mode, legacy = true, prepare = null, owner = 'none', repeat = true, expectFailure = null, after = null, args = [] }) {
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
    if (prepare) await prepare(stack)
    await mkdir(directory)
    await installRelease({ root: directory, mode, ref: 'd'.repeat(40), manifest, readSource: file => sources.get(file) })
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
      try { await command(process.execPath, [join(directory, `setup-${mode}.mjs`), '--skip-pull', '--skip-dev-kit', ...extraArgs], { env: { ...cleanEnv, ...ownerEnv, ...env }, log }); return { ok: true, output: await readFile(log, 'utf8') } }
      catch { return { ok: false, output: await readFile(log, 'utf8') } }
    }
    const containerExists = async () => (await command('docker', ['ps', '-a', '--filter', `name=${appName}-api-${mode}`, '--format', '{{.Names}}'])).includes(`${appName}-api-${mode}`)
    const before = await schemaSnapshot(stack)
    const first = await run('first')
    if (expectFailure) {
      assert.equal(first.ok, false, `${name}: installation must fail`)
      assert.match(first.output, expectFailure, `${name}: failure must be explicit`)
      for (const secret of [ownerEnv.RUNLY_NOTES_OWNER_DATABASE_URL, 'wrong-password-marker'].filter(Boolean)) assert.equal(first.output.includes(secret), false, `${name}: output leaked the owner credential`)
      assert.equal(await containerExists(), false, `${name}: no API may be started when the gate fails`)
      // The preflight runs before any migration or seed: a failed update leaves the application schema exactly as it was.
      if (legacy) assert.equal(before.migrations.includes(NOTES_MIGRATION), false, `${name}: fixture must start without the Notes migration`)
      assert.deepEqual(await schemaSnapshot(stack), before, `${name}: a failed preflight must not migrate or seed`)
      if (state) assert.equal((await fetch(state.url)).status !== undefined, true)
    } else {
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
    if (after) await after({ stack, run, state, containerExists, storageOwnerUrl, snapshot: () => schemaSnapshot(stack) })
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
await scenario('external-regression-to-unsafe', { mode: 'external', prepare: prepareDisposableNotesStorageOwner, after: async ({ stack, run, state, storageOwnerUrl, snapshot }) => {
  await dropGuardAndOpen(stack)
  const migrated = await snapshot()
  assert.equal(migrated.migrations.includes(NOTES_MIGRATION), true, 'precondition: the Prisma migration is already applied')
  const regressed = await run('regressed')
  assert.equal(regressed.ok, false, 'an update over regressed Storage must not succeed silently')
  assert.match(regressed.output, /NOTES_STORAGE_NOT_PREPARED/)
  assert.deepEqual(await snapshot(), migrated, 'a failed preflight over a migrated database must not change the schema or seed')
  // Recovery: migration applied but guard missing. Re-running with the owner restores the guard
  // idempotently without reverting migrations or touching data.
  const recovered = await run('recovered', { env: { RUNLY_NOTES_OWNER_DATABASE_URL: storageOwnerUrl } })
  assert.equal(recovered.ok, true, `recovery with the owner must succeed
${recovered.output.slice(-1500)}`)
  assert.deepEqual(await snapshot(), migrated, 'recovery must not revert or add migrations')
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
console.log(JSON.stringify({ passed: true, images: images, legacyImage, results }))
