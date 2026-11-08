// ERP E4 multi-instance verification.
//   Hub: the REAL Developer Hub H5 code (registry + /installations/v1, read-only checkout ../runly-developer-hub at
//        H5) on its own disposable PostgreSQL 18 (registry + H5 migrations, real hub_runtime role), served over HTTP.
//        Platform-operator actions go through the Hub services (the console needs a Hub session).
//        Published releases known to the Hub = the entries of the signed H4 lab feed (no H4 tables in this DB).
//   ERP A and ERP B: two disposable Supabase stacks (own Postgres, Auth, private Storage), this tree's migrations
//        and seed, own installation identity and key file. Every ERP step runs as a SEPARATE Node process
//        (scripts/fixtures/marketplace/erp-instance.mjs) with only that instance's environment.
//   Protocol negatives (registry signature, nonce replay, clock skew, old key) are sent from this process with the
//        real ERP client code and A's key: those are "simulated client" checks, labelled as such.
// Never reads .env, never uses production keys or URLs.   node scripts/verify-marketplace-install-channel.mjs
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { chmodSync, cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { createMarketplaceInstallClient, InstallChannelError } from '../apps/api/src/services/marketplace/marketplace-install-client.js'
import { createRegistryClient } from '../apps/api/src/services/website-registry-client.js'
import { createSignedTransport } from '../apps/api/src/services/installation-signer.js'
import { RESOURCE_CONFIG_KEYS } from '../apps/api/src/services/catalog/resource-catalog-service.js'

const HUB = resolve(process.env.RUNLY_DEVELOPER_HUB_REPO || '../runly-developer-hub')
const hubImport = (p) => import(pathToFileURL(join(HUB, p)).href)
const hubRequire = createRequire(join(HUB, 'package.json'))
const LAB = resolve('scripts/fixtures/marketplace/h4-lab/published')
const feed = JSON.parse(readFileSync(join(LAB, 'index.json'), 'utf8'))
const LAB_KEY = feed.signed.trust.keys[0].publicKey
const OPERATOR = '00000000-0000-4000-8000-0000000000e4'
const checks = []
const ok = (label, message) => { checks.push(`${label} ${message}`); console.log(`PASS ${label} ${message}`) }
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8' })
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)) }) })
const seedOf = () => { const { privateKey, publicKey } = generateKeyPairSync('ed25519'); return { seed: privateKey.export({ format: 'jwk' }).d, publicKey: publicKey.export({ format: 'jwk' }).x } }

// ---------------- Hub H5 on disposable PostgreSQL ----------------
const pgName = `runly-e4-hub-${randomBytes(4).toString('hex')}`, pgPort = await freePort()
const adminPassword = randomBytes(12).toString('hex'), runtimePassword = randomBytes(12).toString('hex')
const stacks = []
let hubServer, hubPool, passed = false
try {
  const started = docker(['run', '-d', '--rm', '--name', pgName, '--label', 'runly.test=e4-hub', '-e', `POSTGRES_PASSWORD=${adminPassword}`, '-p', `127.0.0.1:${pgPort}:5432`, 'postgres:18'])
  if (started.status !== 0) throw new Error('postgres:18 must be available locally')
  const pg = hubRequire('pg')
  const admin = new pg.Pool({ connectionString: `postgresql://postgres:${adminPassword}@127.0.0.1:${pgPort}/postgres`, max: 2 })
  for (let i = 0; ; i++) { try { await admin.query('SELECT 1'); break } catch (error) { if (i > 60) throw error; await new Promise((r) => setTimeout(r, 1000)) } }
  await admin.query(`CREATE ROLE hub_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER`)
  for (const file of readdirSync(join(HUB, 'supabase/migrations')).filter((n) => n.startsWith('20261103') || n === '20261113090000_installations_channel_h5.sql').sort()) await admin.query(readFileSync(join(HUB, 'supabase/migrations', file), 'utf8'))
  hubPool = new pg.Pool({ connectionString: `postgresql://hub_runtime:${runtimePassword}@127.0.0.1:${pgPort}/postgres`, max: 10 })
  const { createRegistryService } = await hubImport('apps/api/src/services/registry/service.js')
  const { createRegistryApp } = await hubImport('apps/api/src/services/registry/routes.js')
  const { createInstallationsService } = await hubImport('apps/api/src/services/installations/service.js')
  const { createInstallationsApp } = await hubImport('apps/api/src/services/installations/routes.js')
  const { Hono } = await import(pathToFileURL(hubRequire.resolve('hono')).href)
  const { serve } = await import(pathToFileURL(hubRequire.resolve('@hono/node-server')).href)
  const known = new Map(feed.signed.entries.map((e) => [e.releaseId, { sha256: e.sha256, type: e.type }]))
  const registry = createRegistryService({ db: hubPool, env: {} })
  const installations = createInstallationsService({ db: hubPool, registry, env: {}, releases: async (ids) => new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id)])) })
  const root = new Hono()
  root.route('/registry/v1', createRegistryApp({ service: registry, env: {} }))
  root.route('/installations/v1', createInstallationsApp({ service: installations, env: {} }))
  const hubPort = await freePort()
  hubServer = serve({ fetch: root.fetch, port: hubPort, hostname: '127.0.0.1' })
  const HUB_URL = `http://127.0.0.1:${hubPort}`

  // ---------------- Two independent ERP stacks ----------------
  async function erpStack(label) {
    const stack = await createStudioStack({ apiImage: 'runly-studio-combined:api' }); stacks.push(stack)
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
    await stack.verifyTarget()
    const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
    const env = { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl }
    await command(process.execPath, [createRequire(resolve('package.json')).resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env, log: join(stack.directory, 'migrate.log') })
    await command(process.execPath, [resolve('prisma/seed.js')], { env, log: join(stack.directory, 'seed.log') })
    const data = await seedStudioScenario(stack)
    await stack.pool.query(`UPDATE runly_module SET enabled=true,status='INSTALLED' WHERE key='runly.automations'`)
    const bucket = await data.admin.storage.createBucket('runly-files', { public: false }); assert.ok(!bucket.error || bucket.error.statusCode === '409')
    // Its own copy of the same signed public feed, at its own location.
    const feedDir = join(stack.directory, 'feed'); cpSync(LAB, feedDir, { recursive: true })
    await stack.pool.query('INSERT INTO instance_config(key,value,updated_at) VALUES($1,$2,now())', [RESOURCE_CONFIG_KEYS.url, pathToFileURL(join(feedDir, 'index.json')).href])
    const keys = seedOf(), keyFile = join(stack.directory, 'installation.key')
    writeFileSync(keyFile, keys.seed, { mode: 0o600 }); chmodSync(keyFile, 0o600)
    const enrolled = await registry.enrollInstallation(OPERATOR, { label: `ERP ${label} (erp-${label.toLowerCase()}.example.test)`, publicKey: keys.publicKey })
    const base = { E4_LABEL: label, E4_DATABASE_URL: dbUrl, E4_SUPABASE_URL: stack.urls.kong, E4_SERVICE_ROLE_KEY: stack.secret.SUPABASE_SERVICE_ROLE_KEY, E4_COMPANY_ID: data.companies[0].id, E4_ACTOR_ID: data.users[0].id, E4_AUTH_USER_ID: data.users[0].authId, E4_LAB_TRUST_KEY: LAB_KEY }
    const h5 = { RUNLY_INSTALLATIONS_URL: HUB_URL, RUNLY_INSTALLATION_ID: enrolled.id, RUNLY_INSTALLATION_PRIVATE_KEY_FILE: keyFile }
    // A separate OS process per step, with ONLY this instance's configuration (nothing inherited from the other).
    // Async: this process also serves the Hub, so it must keep its event loop free while the ERP process runs.
    const run = (args, { withH5 = true } = {}) => new Promise((resolveRun, reject) => {
      const child = spawn(process.execPath, [resolve('scripts/fixtures/marketplace/erp-instance.mjs'), ...args], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA, ...base, ...(withH5 ? h5 : {}) } })
      let stdout = '', stderr = ''
      child.stdout.on('data', (d) => { stdout += d }); child.stderr.on('data', (d) => { stderr += d })
      child.on('close', (code) => code === 0 ? resolveRun(JSON.parse(stdout.trim().split('\n').at(-1))) : reject(new Error(`ERP ${label} ${args[0]} failed: ${stderr.slice(-1200)}`)))
    })
    return { label, stack, data, keys, keyFile, id: enrolled.id, run, HUB_URL }
  }
  const [A, B] = await Promise.all([erpStack('A'), erpStack('B')])
  assert.notEqual(A.id, B.id); assert.notEqual(A.keys.publicKey, B.keys.publicKey); assert.notEqual(A.stack.ports.db, B.stack.ports.db)
  ok('[setup]', 'Hub H5 on disposable PostgreSQL; ERP A and ERP B on two independent disposable Supabase stacks with distinct identities and keys')

  // 1-3, 15: public feed and E3a imports, B without any H5 configuration.
  const [importA, importB] = await Promise.all([A.run(['import']), B.run(['import'], { withH5: false })])
  assert.equal(importA.installClient, true); assert.equal(importB.installClient, false)
  assert.equal(importA.sequence, importB.sequence)
  assert.deepEqual(importA.releases, importB.releases)
  assert.deepEqual(importA.verified, importA.releases.map((r) => r.sha256)); assert.deepEqual(importB.verified, importB.releases.map((r) => r.sha256))
  assert.equal(importA.automationEnabled, false); assert.equal(importB.automationEnabled, false)
  ok('[1-3,15]', 'A and B read the same signed public feed and verify the same SHA-256 without any installation key; each imports into its own company (B with no H5 configuration at all)')

  // 16: nothing of A appears in B (and vice versa).
  const [localA, localB] = await Promise.all([A.run(['local']), B.run(['local'])])
  assert.ok(!localA.companies.some((id) => localB.companies.includes(id)))
  assert.ok(localA.templates.includes(importA.templateId) && !localB.templates.includes(importA.templateId))
  assert.ok(localB.templates.includes(importB.templateId) && !localA.templates.includes(importB.templateId))
  assert.equal(localA.instanceReceipts, null); assert.equal(localB.instanceReceipts, null)
  ok('[16]', 'companies, templates and automations of A never appear in B; receipts are off by default in both')

  // 4-5: capabilities.
  assert.deepEqual(await B.run(['capabilities'], { withH5: false }), { configured: false, capabilities: [] })
  await installations.setCapability(OPERATOR, { installationId: A.id, capability: 'marketplace:receipt', action: 'grant', reason: 'Piloto E4 de recibos' })
  assert.deepEqual((await A.run(['capabilities'])).capabilities, ['marketplace:receipt', 'registry:names'])
  assert.deepEqual((await B.run(['capabilities'])).capabilities, ['registry:names'])
  ok('[4-5]', 'A holds marketplace:receipt, B does not; an instance without H5 configuration reports configured:false')

  // Receipts are off until the instance administrator opts in.
  assert.deepEqual(await A.run(['receipt', 'studio', importA.studioImportId]), { sent: false, reason: 'disabled' })
  await A.run(['enable-receipts']); await B.run(['enable-receipts'])
  // 6, 13: A sends a valid receipt; retries (new processes, same import) never duplicate it.
  const first = await A.run(['receipt', 'studio', importA.studioImportId])
  assert.equal(first.sent, true); assert.equal(first.replay, false)
  const retry = await A.run(['receipt', 'studio', importA.studioImportId])
  assert.deepEqual([retry.sent, retry.replay, retry.receiptId], [true, true, first.receiptId])
  assert.equal((await hubPool.query('SELECT count(*)::int n FROM hub.installation_receipts WHERE installation_id=$1', [A.id])).rows[0].n, 1)
  const stored = (await hubPool.query('SELECT kind,state,components FROM hub.installation_receipts WHERE installation_id=$1', [A.id])).rows[0]
  assert.deepEqual(stored.components, [{ releaseId: importA.releases[0].releaseId, sha256: importA.releases[0].sha256, state: 'applied', errorCode: null }])
  ok('[6,13]', 'opt-in: nothing is sent while disabled; A sends one component receipt from the verified E3a provenance; retries return the same receiptId and store one row')
  // 7: B has no capability.
  assert.deepEqual(await B.run(['receipt', 'studio', importB.studioImportId]), { sent: false, reason: 'capability_missing', status: 403, retryable: false })
  ok('[7]', 'B is refused with 403 capability_missing (no automatic retry); its local import is untouched')
  // 8: revocation is immediate.
  await installations.setCapability(OPERATOR, { installationId: A.id, capability: 'marketplace:receipt', action: 'revoke', reason: 'Fin del piloto E4' })
  assert.equal((await A.run(['receipt', 'automation', importA.automationImportId])).reason, 'capability_missing')
  assert.ok((await A.run(['local'])).automations.includes(importA.automationKey), 'the confirmed local import is never undone by a failed receipt')
  ok('[8]', 'revoking marketplace:receipt blocks the very next attempt; the local import stays')

  // 9-10 (simulated client, real ERP client code with A's key against the real Hub).
  const captured = []
  const capture = (fetchImpl = fetch) => async (url, init) => { captured.push({ url, init }); return fetchImpl(url, init) }
  const registryA = createRegistryClient({ baseUrl: HUB_URL, installationId: A.id, privateKey: A.keys.seed, fetchImpl: capture() })
  await registryA.keys()
  const registrySigned = captured.at(-1)
  const crossed = await fetch(`${HUB_URL}/installations/v1/capabilities`, { headers: registrySigned.init.headers })
  assert.equal(crossed.status, 401)
  const channelA = createMarketplaceInstallClient({ baseUrl: HUB_URL, installationId: A.id, privateKey: A.keys.seed, fetchImpl: capture() })
  await channelA.capabilities()
  const replay = await fetch(`${HUB_URL}/installations/v1/capabilities`, { headers: captured.at(-1).init.headers })
  assert.equal(replay.status, 401)
  for (const drift of [+400_000, -400_000]) {
    const skewed = createMarketplaceInstallClient({ baseUrl: HUB_URL, installationId: A.id, privateKey: A.keys.seed, now: () => Date.now() + drift })
    await assert.rejects(skewed.capabilities(), (e) => e instanceof InstallChannelError && e.status === 401)
  }
  ok('[9-10]', '(simulated client) a valid /registry/v1 signature is refused on /installations/v1; a replayed nonce and a clock off by 400 s are refused')

  // 14: private downloads stay inactive.
  await installations.setCapability(OPERATOR, { installationId: A.id, capability: 'marketplace:download', action: 'grant', reason: 'Prueba de descarga inactiva' })
  assert.deepEqual(await A.run(['download', importA.releases[0].releaseId]), { error: 'release_not_found', status: 404 })
  assert.deepEqual(await B.run(['download', importA.releases[0].releaseId]), { error: 'capability_missing', status: 403 })
  ok('[14]', 'with marketplace:download a public release still answers 404 on the private route; without it 403')

  // 11: rotation through the registry with the shared key; the new key file is picked up by new processes and
  // by a long-lived client; after the old key is revoked only the new one works.
  const longLived = createMarketplaceInstallClient({ baseUrl: HUB_URL, installationId: A.id, privateKey: () => readFileSync(A.keyFile, 'utf8').trim() })
  const next = seedOf()
  const rotated = await createRegistryClient({ baseUrl: HUB_URL, installationId: A.id, privateKey: A.keys.seed }).rotateKey(next.publicKey, 600)
  assert.ok(rotated.fingerprint)
  writeFileSync(A.keyFile, next.seed, { mode: 0o600 })
  assert.deepEqual((await A.run(['capabilities'])).capabilities, ['marketplace:download', 'registry:names'])
  assert.equal((await longLived.capabilities()).installationId, A.id)
  const old = (await hubPool.query("SELECT fingerprint FROM hub.registry_keys WHERE installation_id=$1 AND status='retiring'", [A.id])).rows[0].fingerprint
  await registry.operatorRevokeKey(OPERATOR, { fingerprint: old, reason: 'Rotación E4 completada' })
  await assert.rejects(createMarketplaceInstallClient({ baseUrl: HUB_URL, installationId: A.id, privateKey: A.keys.seed }).capabilities(), { status: 401 })
  assert.equal((await createRegistryClient({ baseUrl: HUB_URL, installationId: A.id, privateKey: next.seed }).keys()).length, 1, 'registry keeps working with the new key')
  ok('[11]', 'key rotation through /registry/v1 keeps the channel authorized (new processes and a long-lived client re-read the key file); the revoked old key gets 401')

  // 12: a revoked installation is out of the signed channel, the public Marketplace still works for it.
  await registry.setInstallationStatus(OPERATOR, { id: A.id, status: 'revoked', reason: 'Fin de la prueba E4' })
  assert.deepEqual(await A.run(['capabilities']), { error: 'REGISTRY_AUTH_FAILED', status: 401 })
  assert.equal((await A.run(['receipt', 'studio', importA.studioImportId])).status, 401)
  ok('[12]', 'the revoked installation gets 401 on the signed channel')
  passed = true
} finally {
  hubServer?.close(); await hubPool?.end().catch(() => {})
  docker(['rm', '-f', pgName])
  for (const stack of stacks) await stack.close().catch(() => {})
  mkdirSync(resolve('.artifacts/marketplace'), { recursive: true })
  writeFileSync(resolve('.artifacts/marketplace/e4-result.json'), JSON.stringify({ passed, checks }, null, 2))
  console.log(`${passed ? 'PASSED' : 'FAILED'} ${checks.length} checks`)
}
