import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes, generateKeyPairSync } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import net from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { createRegistryClient } from '../apps/api/src/services/website-registry-client.js'

// Two REAL, disposable ERP installations (each with its own Supabase/PostgreSQL laboratory and API), one registry
// (Developer Hub service + PostgreSQL) and the Runly Edge, all on loopback with *.sites.localhost hostnames.
//   pnpm test:website:multi     (RUNLY_HUB_REPO defaults to ../runly-developer-hub-registry)
const HUB = resolve(process.env.RUNLY_HUB_REPO ?? '../runly-developer-hub-registry')
if (!existsSync(resolve(HUB, 'apps/edge/edge.js'))) { console.error('RUNLY_HUB_REPO must point to a Developer Hub checkout with the registry and the edge'); process.exit(2) }
const node = process.execPath, suffix = Date.now().toString(36), namespace = 'sites.localhost', operator = '00000000-0000-4000-8000-000000000009'
const root = resolve('.artifacts/website-multi')
const children = new Set(), results = []
const killTree = (child) => { try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ } try { child.kill() } catch { /* already gone */ } children.delete(child) }
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)) }) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check, what, ms = 40000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await check(); if (last) return last } catch (error) { last = error } await wait(400) } throw Error('TIMEOUT ' + what + (last instanceof Error ? ': ' + last.message : '')) }
async function check(name, fn) { await fn(); results.push(name); console.log('PASS', name) }
const keysFor = () => { const { privateKey, publicKey } = generateKeyPairSync('ed25519'); return { seed: privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64url'), publicKey: publicKey.export({ format: 'jwk' }).x } }
const hostGet = (port, host, path = '/', headers = {}) => new Promise((res, rej) => { const q = httpRequest({ host: '127.0.0.1', port, path, headers: { host, ...headers }, agent: false }, (r) => { let b = ''; r.on('data', (x) => b += x); r.on('end', () => res({ status: r.statusCode, body: b, headers: r.headers })) }); q.on('error', rej); q.end() })
const releaseOf = (body) => body.match(/data-release="([^"]+)"/)?.[1]
const document = (text) => { const blocks = { heading: { id: 'heading', type: 'HeadingBlock', props: { text, level: 'h1' }, children: {} } }; return { schemaVersion: 1, id: 'page-multi', slug: '/', title: text, visibility: 'public', regions: { main: { id: 'main', children: ['heading'] } }, blocks, seo: { title: text, description: '', canonical: null, ogImageAssetId: null }, updatedAt: '2026-11-03T00:00:00.000Z' } }

const regName = `runly-multi-registry-${randomBytes(4).toString('hex')}`
const adminPassword = randomBytes(12).toString('hex'), runtimePassword = randomBytes(12).toString('hex')
const registryDbPort = await freePort(), registryPort = await freePort(), edgePort = await freePort()
let registryServer, edgeServer, hub, registryDb, adminDb
const registryUrl = `http://127.0.0.1:${registryPort}`
const startRegistry = () => {
  registryServer = spawn(node, ['scripts/registry-lab-server.mjs'], { cwd: HUB, stdio: 'ignore', env: { ...process.env, REGISTRY_LAB_DATABASE_URL: `postgresql://hub_runtime:${runtimePassword}@127.0.0.1:${registryDbPort}/postgres`, REGISTRY_LAB_PORT: String(registryPort), REGISTRY_CLAIMS_PER_HOUR: '1000', REGISTRY_IP_LIMIT_PER_MIN: '100000', REGISTRY_READ_LIMIT_PER_MIN: '100000', REGISTRY_WRITE_LIMIT_PER_MIN: '100000' } })
  children.add(registryServer)
  return until(async () => (await fetch(`${registryUrl}/registry/v1/names`)).status === 401, 'registry server')
}

// One real ERP installation.
function erpInstallation(label) {
  const dir = resolve(root, label), self = { label, dir, proc: null }
  const env = { ...process.env, WEBSITE_LAB_DIR: dir }
  self.setup = async () => {
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
    if (spawnSync(node, ['scripts/fixtures/website-integration-lab.mjs'], { stdio: 'inherit', env }).status !== 0) throw Error(`LAB_${label}_FAILED`)
    self.cfg = JSON.parse(readFileSync(dir + '/private.json', 'utf8'))
    self.db = new pg.Pool({ connectionString: self.cfg.env.DATABASE_URL, max: 2 })
  }
  self.configure = (registry) => {
    Object.assign(self.cfg.env, { RUNLY_REGISTRY_URL: registryUrl, RUNLY_INSTALLATION_ID: registry.id, RUNLY_INSTALLATION_PRIVATE_KEY: registry.seed, RUNLY_WEBSITE_NAMESPACE_ROOT: namespace, RUNLY_REGISTRY_SYNC_MS: '1500', RUNLY_REGISTRY_MAX_STALE_MS: '9000' })
    self.cfg.ports.registry = registryPort
    writeFileSync(dir + '/private.json', JSON.stringify(self.cfg, null, 2))
  }
  self.start = async () => {
    const log = openSync(dir + '/api.log', 'a')
    self.proc = spawn(node, ['scripts/fixtures/website-integration-server.mjs'], { stdio: ['ignore', log, log], env }); children.add(self.proc)
    await until(async () => (await fetch(`${self.cfg.urls.api}/health`)).ok, `${label} API`, 90000)
  }
  self.stop = () => { if (self.proc) killTree(self.proc); self.proc = null }
  self.origin = () => `http://127.0.0.1:${self.cfg.ports.api}`
  self.login = async (index) => (await (await fetch(self.cfg.urls.api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: self.cfg.users[index].email, password: self.cfg.users[index].password }) })).json()).data.access_token
  self.company = () => self.cfg.companies[0].id
  self.call = async (path, { method = 'GET', body, status = 200, token = self.token, key = randomBytes(16).toString('hex') } = {}) => {
    const r = await fetch(self.cfg.urls.api + path, { method, headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': self.company(), 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    const json = await r.json(); assert.equal(r.status, status, `${label} ${method} ${path}: ${JSON.stringify(json).slice(0, 300)}`); return json
  }
  self.direct = (host, path = '/') => hostGet(self.cfg.ports.api, host, path)
  return self
}

async function publish(erp, site, text) {
  if (!site.page) { site.page = (await erp.call(`/website/sites/${site.id}/pages`, { method: 'POST', status: 201, body: { title: 'Home', slug: 'home', routePath: '/', visibility: 'public' } })).data; site.revision = 0 }
  const saved = await erp.call(`/website/sites/${site.id}/pages/${site.page.id}/draft`, { method: 'PUT', body: { document: document(text), expectedRevision: site.revision } })
  site.revision = saved.data?.revision ?? saved.data?.draftRevision ?? site.revision + 1
  const state = (await erp.call(`/website/sites/${site.id}/state`)).data
  const release = (await erp.call(`/website/sites/${site.id}/releases`, { method: 'POST', status: 202, body: { kind: 'builder', expectedDraftRevision: state.draftRevision, expectedPublicationRevision: state.publicationRevision, baseReleaseId: state.activeReleaseId, changes: { publishPageIds: [site.page.id], includeThemeAndMenus: true } } })).data
  await erp.call(`/website/sites/${site.id}/publication/activate`, { method: 'POST', body: { releaseId: release.id, manifestHash: release.manifestHash, expectedDraftRevision: release.draftRevision, expectedPublicationRevision: release.publicationRevision } })
  return release.id
}

const A = erpInstallation('erp-a'), B = erpInstallation('erp-b')
function teardown() {
  for (const child of [...children]) killTree(child)
  spawnSync('docker', ['rm', '-f', regName], { stdio: 'ignore' })
  for (const erp of [A, B]) {
    const target = resolve(erp.dir, 'target.json')
    if (!existsSync(target)) continue
    const { name, composeFile } = JSON.parse(readFileSync(target, 'utf8'))
    if (/^runly-studio-e2e-[a-f0-9]+$/.test(name)) spawnSync('docker', ['compose', '-f', composeFile, '-p', name, 'down', '-v'], { stdio: 'inherit' })
  }
}

let failed = null
try {
  rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true })
  // ---- Registry and operator.
  const started = spawnSync('docker', ['run', '-d', '--rm', '--name', regName, '--label', 'runly.test=multi-registry', '-e', `POSTGRES_PASSWORD=${adminPassword}`, '-p', `127.0.0.1:${registryDbPort}:5432`, 'postgres:18'], { encoding: 'utf8' })
  if (started.status !== 0) throw Error('postgres:18 must be available locally')
  adminDb = new pg.Pool({ connectionString: `postgresql://postgres:${adminPassword}@127.0.0.1:${registryDbPort}/postgres`, max: 2 })
  await until(() => adminDb.query('SELECT 1'), 'registry postgres', 90000)
  await adminDb.query(`CREATE ROLE hub_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER`)
  for (const file of ['20261103000000_subdomain_registry.sql', '20261103010000_registry_keys_edge.sql']) await adminDb.query(readFileSync(resolve(HUB, 'supabase/migrations', file), 'utf8'))
  const { createDatabase } = await import(pathToFileURL(resolve(HUB, 'apps/api/src/db.js')).href)
  const { createRegistryService } = await import(pathToFileURL(resolve(HUB, 'apps/api/src/services/registry/service.js')).href)
  registryDb = createDatabase(`postgresql://hub_runtime:${runtimePassword}@127.0.0.1:${registryDbPort}/postgres`, { name: 'multi-operator' })
  hub = createRegistryService({ db: registryDb, env: { REGISTRY_CLAIMS_PER_HOUR: '1000' } })
  await hub.setNamespace(operator, { root: namespace, ready: false })
  await startRegistry()

  // ---- Two real installations.
  await A.setup(); await B.setup()
  const regA = keysFor(), regB = keysFor(), regEdge = keysFor()
  const rowA = await hub.enrollInstallation(operator, { label: 'real ERP A', publicKey: regA.publicKey, originUrl: A.origin() })
  const rowB = await hub.enrollInstallation(operator, { label: 'real ERP B', publicKey: regB.publicKey, originUrl: B.origin() })
  const edgeRow = await hub.enrollInstallation(operator, { label: 'edge', publicKey: regEdge.publicKey, kind: 'edge' })
  A.configure({ id: rowA.id, seed: regA.seed }); B.configure({ id: rowB.id, seed: regB.seed })
  await A.start(); await B.start()
  A.token = await A.login(0); B.token = await B.login(0)
  const edgeLog = openSync(resolve(root, 'edge.log'), 'a')
  edgeServer = spawn(node, ['apps/edge/server.js'], { cwd: HUB, stdio: ['ignore', edgeLog, edgeLog], env: { ...process.env, EDGE_PORT: String(edgePort), EDGE_REGISTRY_URL: registryUrl, EDGE_ID: edgeRow.id, EDGE_PRIVATE_KEY: regEdge.seed, EDGE_NAMESPACES: namespace, EDGE_ALLOW_HTTP_ORIGINS: '1', EDGE_ALLOW_PRIVATE_ORIGINS: '1', EDGE_CACHE_TTL_MS: '1500', EDGE_NEGATIVE_TTL_MS: '500', EDGE_MAX_STALE_MS: '6000' } })
  children.add(edgeServer)
  await until(async () => (await hostGet(edgePort, `nada.${namespace}`)).status === 404, 'edge')
  const viaEdge = (host, path = '/', headers = {}) => hostGet(edgePort, host, path, headers)
  const clientA = createRegistryClient({ baseUrl: registryUrl, installationId: rowA.id, privateKey: regA.seed })
  const siteA = (await A.call('/website/sites', { method: 'POST', status: 201, body: { name: 'Sitio A ' + suffix } })).data
  const siteB = (await B.call('/website/sites', { method: 'POST', status: 201, body: { name: 'Sitio B ' + suffix } })).data
  const reserve = (erp, site, slug) => fetch(`${erp.cfg.urls.api}/website/sites/${site.id}/domains`, { method: 'POST', headers: { Authorization: `Bearer ${erp.token}`, 'X-Runly-Company-Id': erp.company(), 'Content-Type': 'application/json', 'Idempotency-Key': randomBytes(16).toString('hex') }, body: JSON.stringify({ slug }) }).then(async (r) => ({ status: r.status, json: await r.json() }))

  await check('two real installations race for the same names: exactly one reservation each time, in both directions', async () => {
    for (let round = 0; round < 10; round++) {
      const slug = `carrera-${suffix}-${round}`
      const [a, b] = await Promise.all([reserve(A, siteA, slug), reserve(B, siteB, slug)])
      assert.deepEqual([a.status, b.status].sort(), [201, 409], `round ${round}: ${a.status}/${b.status}`)
      const winner = a.status === 201 ? { erp: A, loser: B, id: rowA.id } : { erp: B, loser: A, id: rowB.id }
      assert.equal((await registryDb.query('SELECT installation_id FROM hub.registry_names WHERE slug=$1', [slug])).rows[0].installation_id, winner.id)
      assert.equal((await winner.erp.db.query('SELECT count(*)::int n FROM website_domain WHERE hostname=$1', [`${slug}.${namespace}`])).rows[0].n, 1)
      assert.equal((await winner.loser.db.query('SELECT count(*)::int n FROM website_domain WHERE hostname=$1', [`${slug}.${namespace}`])).rows[0].n, 0, 'the losing installation has no local trace')
    }
  })

  const hostA = `tienda-a-${suffix}.${namespace}`, hostB = `tienda-b-${suffix}.${namespace}`
  let releaseA1, releaseB1
  await check('names are associated with the right installation and site; nothing is served until the namespace is ready', async () => {
    const a = (await reserve(A, siteA, `tienda-a-${suffix}`)), b = (await reserve(B, siteB, `tienda-b-${suffix}`))
    assert.deepEqual([a.status, b.status], [201, 201])
    assert.equal((await registryDb.query('SELECT installation_id FROM hub.registry_names WHERE hostname=$1', [hostA])).rows[0].installation_id, rowA.id)
    assert.equal((await A.db.query('SELECT site_id FROM website_domain WHERE hostname=$1', [hostA])).rows[0].site_id, siteA.id)
    releaseA1 = await publish(A, siteA, 'Sitio A v1'); releaseB1 = await publish(B, siteB, 'Sitio B v1')
    assert.equal((await viaEdge(hostA)).status, 404, 'pending names are not served')
    await A.call(`/website/sites/${siteA.id}/domains/${hostA}/activate`, { method: 'POST', status: 409 })
    await hub.setNamespace(operator, { root: namespace, ready: true })
    await A.call(`/website/sites/${siteA.id}/domains/${hostA}/activate`, { method: 'POST' }); await B.call(`/website/sites/${siteB.id}/domains/${hostB}/activate`, { method: 'POST' })
  })

  await check('the Edge resolves hostname -> installation -> site -> active release for each installation', async () => {
    const a = await until(async () => { const r = await viaEdge(hostA); return r.status === 200 && r }, 'edge serves A')
    const b = await until(async () => { const r = await viaEdge(hostB); return r.status === 200 && r }, 'edge serves B')
    assert.equal(releaseOf(a.body), releaseA1); assert.equal(releaseOf(b.body), releaseB1)
    assert.notEqual(releaseOf(a.body), releaseOf(b.body))
  })

  await check('release updates and rollback propagate through the Edge within its cache window', async () => {
    const releaseA2 = await publish(A, siteA, 'Sitio A v2')
    await until(async () => releaseOf((await viaEdge(hostA)).body) === releaseA2, 'edge shows A v2', 15000)
    const state = (await A.call(`/website/sites/${siteA.id}/state`)).data
    await A.call(`/website/sites/${siteA.id}/publication/rollback`, { method: 'POST', body: { releaseId: releaseA1, expectedPublicationRevision: state.publicationRevision } })
    await until(async () => releaseOf((await viaEdge(hostA)).body) === releaseA1, 'edge shows the rolled-back release', 15000)
    assert.equal(releaseOf((await viaEdge(hostB)).body), releaseB1, 'the other installation is untouched')
  })

  await check('isolation: no installation serves, activates or releases another installation names; forged headers change nothing', async () => {
    assert.equal((await A.direct(hostB)).status, 404, 'installation A does not know B names')
    assert.equal((await B.direct(hostA)).status, 404)
    await assert.rejects(clientA.activate(hostB), (e) => e.status === 404); await assert.rejects(clientA.release(hostB), (e) => e.status === 404)
    assert.equal((await viaEdge(`nunca-${suffix}.${namespace}`, '/', { 'x-forwarded-host': hostA })).status, 404)
    const spoof = await viaEdge(hostB, '/', { 'x-forwarded-host': hostA, forwarded: `host=${hostA}`, 'x-forwarded-for': '192.0.2.4' })
    assert.equal(releaseOf(spoof.body), releaseB1, 'the connection Host decides; B content is never mixed with A')
    assert.equal((await viaEdge(hostA, '/app/login')).status >= 400, true, 'ERP administrative paths are not exposed on site hostnames')
    for (const path of ['/website/sites', '/auth/me', '/modules']) assert.equal((await viaEdge(hostA, path)).status >= 400 || !/"data"/.test((await viaEdge(hostA, path)).body), true, path)
    assert.equal((await B.db.query('SELECT count(*)::int n FROM website_domain WHERE hostname=$1', [hostA])).rows[0].n, 0)
  })

  await check('key rotation without interruption: the old key works during the grace window, then it is revoked', async () => {
    const keyFile = resolve(root, 'erp-a.env')
    writeFileSync(keyFile, `RUNLY_REGISTRY_URL=${registryUrl}\nRUNLY_INSTALLATION_ID=${rowA.id}\nRUNLY_INSTALLATION_PRIVATE_KEY=${regA.seed}\n`, { mode: 0o600 })
    const rotate = spawnSync(node, ['scripts/registry-installation-key.mjs', '--env-file', keyFile, '--rotate', '--grace-seconds=3600'], { encoding: 'utf8' })
    assert.equal(rotate.status, 0, rotate.stderr); assert.equal(rotate.stdout.includes(regA.seed), false, 'the old key is never printed')
    const newSeed = readFileSync(keyFile, 'utf8').match(/^RUNLY_INSTALLATION_PRIVATE_KEY=(.+)$/m)[1]
    assert.notEqual(newSeed, regA.seed); assert.equal(rotate.stdout.includes(newSeed), false, 'the new private key is never printed')
    assert.equal((await A.call(`/website/sites/${siteA.id}/domains/${hostA}`)).data.stale, false, 'the running API still works with the old key')
    A.stop(); A.cfg.env.RUNLY_INSTALLATION_PRIVATE_KEY = newSeed; writeFileSync(A.dir + '/private.json', JSON.stringify(A.cfg, null, 2)); await A.start(); A.token = await A.login(0)
    assert.equal((await viaEdge(hostA)).status, 200, 'the site kept serving through the restart')
    assert.equal((await A.call(`/website/sites/${siteA.id}/domains/${hostA}`)).data.stale, false, 'the restarted API signs with the new key')
    const revoke = spawnSync(node, ['scripts/registry-installation-key.mjs', '--env-file', keyFile, '--revoke-previous'], { encoding: 'utf8' })
    assert.equal(revoke.status, 0, revoke.stderr)
    await assert.rejects(clientA.status(hostA), (e) => e.status === 401, 'the old key no longer authenticates')
    const audit = JSON.stringify((await hub.operatorAudit({ hostname: hostA })).concat((await registryDb.query("SELECT detail FROM hub.registry_audit WHERE action LIKE 'key_%'")).rows))
    assert.equal(audit.includes(regA.seed) || audit.includes(newSeed), false, 'no private key in the audit trail')
    regA.seed = newSeed
  })

  await check('a disconnected installation stops answering only for its own names and recovers', async () => {
    A.stop()
    await until(async () => (await viaEdge(hostA)).status === 502, 'edge reports 502 for A', 20000)
    assert.equal(releaseOf((await viaEdge(hostB)).body), releaseB1, 'B keeps serving')
    await A.start()
    await until(async () => (await viaEdge(hostA)).status === 200, 'A serves again', 30000)
  })

  await check('suspension and restoration reach the Edge and the installation within their stated windows', async () => {
    await hub.setNameState(operator, { hostname: hostA, state: 'suspended', reason: 'multi-instance lab abuse report' })
    await until(async () => (await viaEdge(hostA)).status === 404, 'edge stops serving the suspended name', 15000)
    await until(async () => (await A.direct(hostA)).status === 404, 'the installation mirror stops serving it', 15000)
    assert.equal(releaseOf((await viaEdge(hostB)).body), releaseB1)
    await hub.setNameState(operator, { hostname: hostA, state: 'assigned', reason: 'multi-instance lab restore' })
    await until(async () => (await viaEdge(hostA)).status === 200, 'edge serves the restored name', 15000)
    await until(async () => (await A.direct(hostA)).status === 200, 'the installation mirror serves it again', 15000)
  })

  await check('registry outage: stale service is bounded at the Edge and at the installation, and recovery needs no restart', async () => {
    registryServer && killTree(registryServer)
    assert.equal((await viaEdge(hostA)).status, 200, 'cached route keeps serving'); assert.equal((await A.direct(hostA)).status, 200)
    await A.call('/website/sites', { method: 'POST', status: 201, body: { name: 'during outage' } })
    const refused = await reserve(A, siteA, `caida-${suffix}`); assert.equal(refused.status, 503); assert.equal(refused.json.code, 'registry_unavailable')
    await until(async () => (await viaEdge(hostA)).status === 503, 'the Edge fails closed after its stale bound', 20000)
    await until(async () => (await A.direct(hostA)).status === 404, 'the installation stops resolving registry-managed names after its stale bound', 25000)
    await startRegistry()
    await until(async () => (await viaEdge(hostA)).status === 200, 'Edge recovers', 20000)
    await until(async () => (await A.direct(hostA)).status === 200, 'installation recovers after a sync', 20000)
    assert.equal(releaseOf((await viaEdge(hostA)).body), releaseA1, 'the historical release is intact')
    assert.equal((await registryDb.query('SELECT state FROM hub.registry_names WHERE hostname=$1', [hostA])).rows[0].state, 'assigned', 'nothing was released by the interruption')
  })

  await check('installation revocation: its names stop at the Edge, the other installation is unaffected, history is kept', async () => {
    const owned = async () => (await registryDb.query('SELECT count(*)::int n FROM hub.registry_names WHERE installation_id=$1', [rowB.id])).rows[0].n
    const before = await owned()
    const cut = await hub.setInstallationStatus(operator, { id: rowB.id, status: 'revoked', reason: 'multi-instance lab compromise' })
    assert.ok(cut.suspendedNames >= 1)
    await until(async () => (await viaEdge(hostB)).status === 404, 'edge stops serving the revoked installation', 15000)
    assert.equal(releaseOf((await viaEdge(hostA)).body), releaseA1)
    assert.ok(before >= 2); assert.equal(await owned(), before, 'no name was deleted')
    await until(async () => (await B.direct(hostB)).status === 404, 'the revoked installation stops resolving managed names after its stale bound', 30000)
    assert.ok((await hub.operatorAudit({ hostname: hostB })).some((row) => row.action === 'installation_revoked' || row.action === 'claim'))
  })
  console.log(`\nWebsite multi-installation lab PASSED (${results.length} checks)`)
} catch (error) {
  failed = error
  console.error(error.stack ?? error.message)
} finally {
  for (const pool of [adminDb, registryDb, A.db, B.db]) await pool?.end().catch(() => {})
  teardown()
}
process.exit(failed ? 1 : 0)
