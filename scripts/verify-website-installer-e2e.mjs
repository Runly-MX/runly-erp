// Website installation rehearsal: the real update-external.sh / setup-external.mjs against a disposable Supabase
// stack, a controlled distribution origin, and API/Worker/Web images built from the exact HEAD under test.
// Starts from a previous Installer and a historical database, then proves variables, migrations, publication and
// resolution through the packaged Nginx, secret hygiene, repeatability and controlled failure recovery.
//   node scripts/verify-website-installer-e2e.mjs --api-image=... --worker-image=... --web-image=... [--legacy-image=...]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
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
const { createClient } = require('@supabase/supabase-js')
const results = []
const wait = ms => new Promise(r => setTimeout(r, ms))

// A historical installation: a site, page and form with a stored submission, created before the new migrations.
async function insertRow(pool, table, values) {
  const cols = (await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_nullable='NO' AND column_default IS NULL", [table])).rows
  const row = { ...values }
  for (const { column_name: c, data_type: t } of cols) if (!(c in row)) row[c] = t === 'uuid' ? randomUUID() : /int|numeric/.test(t) ? 0 : t === 'boolean' ? false : /json/.test(t) ? '{}' : /timestamp/.test(t) ? new Date() : 'fixture'
  const keys = Object.keys(row)
  return (await pool.query(`INSERT INTO "${table}"(${keys.map(k => '"' + k + '"').join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, keys.map(k => row[k]))).rows[0]
}
async function seedLegacy(stack) {
  const { users, companies, admin } = await seedStudioScenario(stack), company = companies[0]
  const site = await insertRow(stack.pool, 'website_site', { company_id: company.id, name: 'Sitio historico' })
  const page = await insertRow(stack.pool, 'website_page', { company_id: company.id, site_id: site.id, title: 'Inicio', slug: 'inicio', route_path: '/' })
  const form = await insertRow(stack.pool, 'website_form', { company_id: company.id, site_id: site.id, name: 'Contacto' })
  const submission = await insertRow(stack.pool, 'website_form_submission', { company_id: company.id, form_id: form.id, data: JSON.stringify({ mensaje: 'respuesta historica' }) })
  const snapshot = async () => ({
    site: (await stack.pool.query('SELECT id, name, slug FROM website_site ORDER BY id')).rows,
    pages: (await stack.pool.query('SELECT id, site_id, title FROM website_page ORDER BY id')).rows,
    forms: (await stack.pool.query('SELECT id, site_id, name FROM website_form ORDER BY id')).rows,
    submissions: (await stack.pool.query('SELECT id, form_id, data FROM website_form_submission ORDER BY id')).rows,
  })
  return { users, companies, company, admin, site, page, form, submission, snapshot, before: await snapshot() }
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
      if (!schemaChangesOnFailure) assert.deepEqual(await schemaSnapshot(stack), before, `${name}: a failed preflight must not migrate or seed`)
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
      const inspected = await command('docker', ['inspect', `${appName}-api-${mode}`, '--format', '{{json .Config.Env}}'])
      assert.equal(inspected.includes('RUNLY_NOTES_OWNER_DATABASE_URL'), false, 'owner connection must not reach the API container')
      if (repeat) { const again = await run('repeat'); assert.equal(again.ok, true, `${name}: repeated installation must succeed\n${again.output.slice(-1500)}`) }
    }
    if (after) await after({ stack, run, state, containerExists, storageOwnerUrl, origin, installerState, installerBefore, before, directory, tagged, snapshot: () => schemaSnapshot(stack),
      apiContainer: async () => (await command('docker', ['inspect', `${appName}-api-${mode}`, '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}'])).trim() })
    results.push(`${name}: PASS`); console.log(`${name}: PASS`)
  } finally {
    try {
      if (await readFile(join(directory, `.env.${mode}`)).catch(() => null)) await command('docker', [...appCompose, '--profile', mode, 'down', '--volumes', '--remove-orphans'], { env: { ...cleanEnv, RUNLY_COMPOSE_PROJECT_NAME: appName, RUNLY_CONTAINER_PREFIX: appName }, log: join(stack.directory, 'full-cleanup.log') })
    } finally { await stack.close() }
  }
}



// ---- Website scenario -------------------------------------------------------------------------------
import { request as httpRequest } from 'node:http'
const lab = { app: 'https://erp.lab-admin.test', namespace: 'sites.lab-sites.test', content: 'content.lab-sites.test', preview: 'preview.lab-sites.test' }
const WEBSITE_KEYS = ['RUNLY_WEBSITE_NAMESPACE_ROOT', 'RUNLY_WEBSITE_CONTENT_ROOT', 'RUNLY_WEBSITE_PREVIEW_ROOT']
const envValue = (text, key) => text.split(/\r?\n/).filter(line => line.startsWith(key + '=')).map(line => line.slice(key.length + 1))
const hostRequest = (port, host, path = '/') => new Promise((resolve, reject) => {
  const req = httpRequest({ host: '127.0.0.1', port, path, headers: { Host: host } }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', s => body += s); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers })) })
  req.on('error', reject); req.end()
})
const document = text => { const blocks = { heading: { id: 'heading', type: 'HeadingBlock', props: { text, level: 'h1' }, children: {} } }; return { schemaVersion: 1, id: 'page-rehearsal', slug: '/', title: text, visibility: 'public', regions: { main: { id: 'main', children: ['heading'] } }, blocks, seo: { title: text, description: '', canonical: null, ogImageAssetId: null }, updatedAt: '2026-11-03T00:00:00.000Z' } }

await scenario('website-update-from-previous-installer', { mode: 'external', via: { script: 'update-external.sh' }, prepare: prepareDisposableNotesStorageOwner, repeat: false, after: async ({ stack, run, state, origin, installerState, installerBefore, snapshot, directory }) => {
  const envFile = join(directory, '.env.external'), read = () => readFile(envFile, 'utf8')
  const secrets = [stack.secret.SUPABASE_SERVICE_ROLE_KEY, stack.secret.SUPABASE_JWT_SECRET, stack.secret.SUPABASE_POSTGRES_PASSWORD].filter(Boolean)
  const noLeak = (name, output) => { for (const secret of secrets) assert.equal(output.includes(secret), false, `${name}: output leaked a credential`) }
  // 1-2. The installer refreshed itself and appended the Website keys once, blank, keeping the existing values.
  assert.notEqual(installerBefore.version, manifest.version)
  assert.equal((await installerState()).version, manifest.version)
  let env = await read()
  for (const key of WEBSITE_KEYS) assert.deepEqual(envValue(env, key), [''], `${key} must be appended exactly once and blank`)
  assert.ok(env.includes(`SUPABASE_SERVICE_ROLE_KEY=${stack.secret.SUPABASE_SERVICE_ROLE_KEY}`), 'existing values are preserved')
  // 3. Migrations and historical data.
  const applied = (await stack.pool.query('SELECT migration_name, finished_at FROM _prisma_migrations')).rows
  for (const name of ['20261102110000_website_releases', '20261102180000_website_form_scope', '20261218120000_website_catalog_selection']) assert.ok(applied.some(row => row.migration_name === name && row.finished_at), `${name} applied`)
  assert.deepEqual(await state.snapshot(), state.before, 'historical site, page, form and submission are unchanged')
  assert.equal((await stack.pool.query('SELECT catalog_mode FROM website_site WHERE id=$1', [state.site.id])).rows[0].catalog_mode, 'legacy_all', 'historical sites keep their implicit catalog visibility')
  // 4. Private release bucket created by the API itself.
  const bucket = await state.admin.storage.getBucket('runly-website-releases')
  assert.equal(bucket.error, null, 'the API must create the release bucket'); assert.equal(bucket.data.public, false)
  // 5. Administrative access and the historical site through the real API.
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'website.%' ON CONFLICT DO NOTHING", [state.company.roleId])
  const login = await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: state.users[0].email, password: state.users[0].password }) })
  assert.equal(login.status, 200); const token = (await login.json()).data.access_token
  const call = async (path, { method = 'GET', body, status = 200 } = {}) => {
    const r = await fetch(stack.urls.api + path, { method, headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': state.company.id, 'Content-Type': 'application/json', 'Idempotency-Key': 'k'.repeat(24) + Math.random().toString(16).slice(2) }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    const json = await r.json(); assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(json).slice(0, 300)}`); return json
  }
  const listed = (await call('/website/sites')).data
  assert.ok(listed.some(site => site.id === state.site.id), 'the historical site is listed after the update')
  // 6. The administrator sets the values once; a second update must keep them and change nothing else.
  let configured = env
  for (const [key, value] of [['RUNLY_APP_URL', lab.app], ['RUNLY_WEBSITE_NAMESPACE_ROOT', lab.namespace], ['RUNLY_WEBSITE_CONTENT_ROOT', lab.content], ['RUNLY_WEBSITE_PREVIEW_ROOT', lab.preview]])
    configured = configured.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
  await writeFile(envFile, configured)
  const second = await run('configured'); assert.equal(second.ok, true, `update with Website settings must succeed\n${second.output.slice(-1500)}`); noLeak('configured', second.output)
  env = await read()
  for (const [key, value] of [['RUNLY_WEBSITE_CONTENT_ROOT', lab.content], ['RUNLY_WEBSITE_PREVIEW_ROOT', lab.preview], ['RUNLY_WEBSITE_NAMESPACE_ROOT', lab.namespace], ['RUNLY_APP_URL', lab.app]]) assert.deepEqual(envValue(env, key), [value], `${key} survives the update`)
  // 7. Publish a site and resolve it through the packaged Nginx and gateway.
  const created = (await call('/website/sites', { method: 'POST', status: 201, body: { name: 'Sitio ensayo' } })).data
  const page = (await call(`/website/sites/${created.id}/pages`, { method: 'POST', status: 201, body: { title: 'Home', slug: 'home', routePath: '/', visibility: 'public' } })).data
  await call(`/website/sites/${created.id}/pages/${page.id}/draft`, { method: 'PUT', body: { document: document('Hola desde el ensayo'), expectedRevision: 0 } })
  const siteState = (await call(`/website/sites/${created.id}/state`)).data
  const release = (await call(`/website/sites/${created.id}/releases`, { method: 'POST', status: 202, body: { kind: 'builder', expectedDraftRevision: siteState.draftRevision, expectedPublicationRevision: siteState.publicationRevision, baseReleaseId: siteState.activeReleaseId, changes: { publishPageIds: [page.id], includeThemeAndMenus: true } } })).data
  await call(`/website/sites/${created.id}/publication/activate`, { method: 'POST', body: { releaseId: release.id, manifestHash: release.manifestHash, expectedDraftRevision: release.draftRevision, expectedPublicationRevision: release.publicationRevision } })
  // Hostname assignment has no REST route yet (see the registry proposal): assigned directly, as the lab always did.
  const host = `ensayo-${created.id.slice(-8)}.${lab.content}`
  await stack.pool.query("INSERT INTO website_domain(hostname,company_id,site_id,kind,state,ready) VALUES($1,$2,$3,'platform','assigned',true)", [host, state.company.id, created.id])
  const site = await hostRequest(stack.ports.web, host, '/')
  assert.equal(site.status, 200, `published site resolves through Nginx: ${site.body.slice(0, 200)}`); assert.match(site.body, /Hola desde el ensayo/)
  for (const path of ['/app/', '/app/login']) { const r = await hostRequest(stack.ports.web, host, path); assert.ok([403, 404].includes(r.status), `${path} on a site host: ${r.status}`); assert.doesNotMatch(r.body, /<div id="root"/) }
  assert.equal((await hostRequest(stack.ports.web, new URL(lab.app).hostname, '/app/')).status, 200, 'the administrative origin serves the ERP')
  assert.ok([403, 404].includes((await hostRequest(stack.ports.web, 'unknown.content.lab-sites.test', '/')).status), 'unassigned hostnames do not resolve')
  // 8. Repeat: nothing changes.
  const dataBefore = await state.snapshot(), envBefore = await read()
  const third = await run('repeat'); assert.equal(third.ok, true, third.output.slice(-1200)); noLeak('repeat', third.output)
  assert.equal(await read(), envBefore, 'a repeated update does not touch .env.external'); assert.deepEqual(await state.snapshot(), dataBefore)
  assert.equal((await hostRequest(stack.ports.web, host, '/')).status, 200)
  // 9. Controlled failure: an interrupted refresh changes nothing and the published site keeps serving; recovery converges.
  const installerStable = await installerState(), schemaStable = await snapshot()
  await origin.setFail('setup-external.mjs corrupt')
  const failed = await run('corrupt'); assert.equal(failed.ok, false); assert.match(failed.output, /INSTALLER_INTEGRITY_FAILED/); noLeak('corrupt', failed.output)
  assert.deepEqual(await installerState(), installerStable); assert.deepEqual(await snapshot(), schemaStable); assert.equal(await read(), envBefore)
  assert.equal((await hostRequest(stack.ports.web, host, '/')).status, 200, 'the running site is unaffected by a failed update')
  await origin.setFail('')
  const recovered = await run('recovered'); assert.equal(recovered.ok, true, recovered.output.slice(-1200))
  assert.equal((await hostRequest(stack.ports.web, host, '/')).status, 200)
  // 10. The previous API image still serves the migrated database (image rollback without restoring data).
  const container = `${stack.name}-previous-api`
  try {
    await command('docker', ['run', '-d', '--rm', '--name', container, '--network', `${stack.name}_default`, '--env-file', envFile, '-p', '127.0.0.1::4010', legacyImage])
    const port = (await command('docker', ['port', container, '4010/tcp'])).trim().split(':').pop()
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await fetch(`http://127.0.0.1:${port}/health`).then(r => r.ok, () => false); if (!ok) await wait(1500) }
    assert.equal(ok, true, 'the previous API image starts against the migrated database')
    const rollback = await fetch(`http://127.0.0.1:${port}/website/sites`, { headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': state.company.id } })
    assert.equal(rollback.status, 200, 'the previous API image still lists the historical sites'); assert.ok((await rollback.json()).data.some(row => row.id === state.site.id))
  } finally { await command('docker', ['rm', '-f', container]).catch(() => {}) }
} })
console.log(JSON.stringify({ passed: true, images, legacyImage, results }))
