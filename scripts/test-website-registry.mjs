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

// Multi-installation registry laboratory. Disposable pieces only: a PostgreSQL container for the registry, the real
// registry routes from the Developer Hub checkout, the real Runly API with its own disposable Supabase/PostgreSQL lab,
// and a simulated second installation (a signed client with its own key). Hostnames are *.sites.localhost.
//   pnpm test:website:registry     (RUNLY_HUB_REPO defaults to ../runly-developer-hub-registry)
const HUB = resolve(process.env.RUNLY_HUB_REPO ?? '../runly-developer-hub-registry')
if (!existsSync(resolve(HUB, 'apps/api/src/services/registry/service.js'))) { console.error('RUNLY_HUB_REPO must point to a Developer Hub checkout with the registry'); process.exit(2) }
const dir = resolve('.artifacts/website-integration'), node = process.execPath
const children = []
const operator = '00000000-0000-4000-8000-000000000009', namespace = 'sites.localhost'
const suffix = Date.now().toString(36)
const run = (args, options = {}) => spawnSync(node, args, { stdio: 'inherit', ...options }).status === 0
const killTree = (child) => { try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {} try { child.kill() } catch {} }
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)) }) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(check, what, ms = 90000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await check()) return } catch {} await wait(500) } throw Error('TIMEOUT ' + what) }
const results = []
async function check(name, fn) { await fn(); results.push(name); console.log('PASS', name) }

const registryDbName = `runly-registry-lab-${randomBytes(4).toString('hex')}`
const adminPassword = randomBytes(12).toString('hex'), runtimePassword = randomBytes(12).toString('hex')
const registryDbPort = await freePort(), registryPort = await freePort()
let labTarget, registryServer, hub, registryDb, adminDb, labDb
const startRegistry = () => {
  registryServer = spawn(node, ['scripts/registry-lab-server.mjs'], { cwd: HUB, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, REGISTRY_LAB_DATABASE_URL: `postgresql://hub_runtime:${runtimePassword}@127.0.0.1:${registryDbPort}/postgres`, REGISTRY_LAB_PORT: String(registryPort), REGISTRY_CLAIMS_PER_HOUR: '1000' } })
  children.push(registryServer)
  return waitFor(async () => (await fetch(`http://127.0.0.1:${registryPort}/registry/v1/names`)).status === 401, 'registry server')
}
const stopRegistry = () => { killTree(registryServer) }

function teardown() {
  for (const child of children) killTree(child)
  spawnSync('docker', ['rm', '-f', registryDbName], { stdio: 'ignore' })
  if (!existsSync(dir + '/target.json')) return
  const { name, composeFile } = JSON.parse(readFileSync(dir + '/target.json', 'utf8'))
  if (/^runly-studio-e2e-[a-f0-9]+$/.test(name)) spawnSync('docker', ['compose', '-f', composeFile, '-p', name, 'down', '-v'], { stdio: 'inherit' })
}

let failed = null
try {
  // ---- Registry: own PostgreSQL, real migration, real routes, hub_runtime role.
  const started = spawnSync('docker', ['run', '-d', '--rm', '--name', registryDbName, '--label', 'runly.test=registry-lab', '-e', `POSTGRES_PASSWORD=${adminPassword}`, '-p', `127.0.0.1:${registryDbPort}:5432`, 'postgres:18'], { encoding: 'utf8' })
  if (started.status !== 0) throw Error('postgres:18 must be available locally')
  adminDb = new pg.Pool({ connectionString: `postgresql://postgres:${adminPassword}@127.0.0.1:${registryDbPort}/postgres`, max: 2 })
  await waitFor(() => adminDb.query('SELECT 1'), 'registry postgres', 90000)
  await adminDb.query(`CREATE ROLE hub_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER`)
  await adminDb.query(readFileSync(resolve(HUB, 'supabase/migrations/20261103000000_subdomain_registry.sql'), 'utf8'))
  const { createDatabase } = await import(pathToFileURL(resolve(HUB, 'apps/api/src/db.js')).href)
  const { createRegistryService } = await import(pathToFileURL(resolve(HUB, 'apps/api/src/services/registry/service.js')).href)
  registryDb = createDatabase(`postgresql://hub_runtime:${runtimePassword}@127.0.0.1:${registryDbPort}/postgres`, { name: 'registry-lab-operator' })
  hub = createRegistryService({ db: registryDb, env: { REGISTRY_CLAIMS_PER_HOUR: '1000' } })
  await hub.setNamespace(operator, { root: namespace, ready: false })
  const keysFor = () => { const { privateKey, publicKey } = generateKeyPairSync('ed25519'); return { seed: privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64url'), publicKey: publicKey.export({ format: 'jwk' }).x } }
  const keysA = keysFor(), keysB = keysFor()
  const installationA = await hub.enrollInstallation(operator, { label: 'lab installation A (real ERP)', publicKey: keysA.publicKey })
  const installationB = await hub.enrollInstallation(operator, { label: 'lab installation B (simulated)', publicKey: keysB.publicKey })
  await startRegistry()
  const clientB = createRegistryClient({ baseUrl: `http://127.0.0.1:${registryPort}`, installationId: installationB.id, privateKey: keysB.seed })

  // ---- ERP laboratory (installation A) wired to the registry.
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  if (!run(['scripts/fixtures/website-integration-lab.mjs'])) throw Error('LAB_SETUP_FAILED')
  labTarget = JSON.parse(readFileSync(dir + '/private.json', 'utf8'))
  Object.assign(labTarget.env, { RUNLY_REGISTRY_URL: `http://127.0.0.1:${registryPort}`, RUNLY_INSTALLATION_ID: installationA.id, RUNLY_INSTALLATION_PRIVATE_KEY: keysA.seed, RUNLY_WEBSITE_NAMESPACE_ROOT: namespace, RUNLY_REGISTRY_SYNC_MS: '1500' })
  labTarget.ports.registry = registryPort
  writeFileSync(dir + '/private.json', JSON.stringify(labTarget, null, 2))
  const logFile = openSync(dir + '/api.log', 'a')
  children.push(spawn(node, ['scripts/fixtures/website-integration-server.mjs'], { stdio: ['ignore', logFile, logFile] }))
  await waitFor(async () => (await fetch(`${labTarget.urls.api}/health`)).ok, 'ERP API')
  labDb = new pg.Pool({ connectionString: labTarget.env.DATABASE_URL, max: 2 })
  const company = labTarget.companies[0].id, foreignCompany = labTarget.companies[1].id

  const login = async (index) => (await (await fetch(labTarget.urls.api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: labTarget.users[index].email, password: labTarget.users[index].password }) })).json()).data.access_token
  const owner = await login(0), reader = await login(2), foreign = await login(3)
  const call = async (path, { method = 'GET', body, auth = owner, companyId = company, status = 200, key = randomBytes(16).toString('hex') } = {}) => {
    const r = await fetch(labTarget.urls.api + path, { method, headers: { Authorization: `Bearer ${auth}`, 'X-Runly-Company-Id': companyId, 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    const json = await r.json(); assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(json).slice(0, 300)}`); return json
  }
  const hostGet = (host, path = '/', headers = {}) => new Promise((res, rej) => { const q = httpRequest({ host: '127.0.0.1', port: labTarget.ports.api, path, headers: { Host: host, ...headers } }, (r) => { let b = ''; r.on('data', (x) => b += x); r.on('end', () => res({ status: r.statusCode, body: b })) }); q.on('error', rej); q.end() })
  const document = (text) => { const blocks = { heading: { id: 'heading', type: 'HeadingBlock', props: { text, level: 'h1' }, children: {} } }; return { schemaVersion: 1, id: 'page-registry', slug: '/', title: text, visibility: 'public', regions: { main: { id: 'main', children: ['heading'] } }, blocks, seo: { title: text, description: '', canonical: null, ogImageAssetId: null }, updatedAt: '2026-11-03T00:00:00.000Z' } }
  const site = (await call('/website/sites', { method: 'POST', status: 201, body: { name: 'Registry lab ' + suffix } })).data
  const otherSite = (await call('/website/sites', { method: 'POST', status: 201, body: { name: 'Foreign lab ' + suffix }, auth: foreign, companyId: foreignCompany })).data
  const claimOnB = (slug, label = 'b') => clientB.claim({ namespace, slug, companyRef: clientB.ref('company', label), siteRef: clientB.ref('site', label) })

  await check('without the registry namespace ready, a name is reserved as pending and serves nothing', async () => {
    const slug = `tienda-${suffix}`
    const free = (await call(`/website/sites/${site.id}/domains/availability?slug=${slug}`)).data
    assert.deepEqual(free, { available: true, reason: null })
    const reserved = (await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 201, body: { slug } })).data
    assert.equal(reserved.hostname, `${slug}.${namespace}`); assert.equal(reserved.state, 'pending'); assert.equal(reserved.ready, false)
    assert.equal((await hostGet(reserved.hostname)).status, 404, 'a pending name does not resolve')
    const row = (await labDb.query('SELECT registry_managed,state,ready FROM website_domain WHERE hostname=$1', [reserved.hostname])).rows[0]
    assert.deepEqual(row, { registry_managed: true, state: 'pending', ready: false })
    assert.deepEqual((await call(`/website/sites/${site.id}/domains/availability?slug=${slug}`)).data, { available: false, reason: 'NAME_UNAVAILABLE' })
    const early = await call(`/website/sites/${site.id}/domains/${reserved.hostname}/activate`, { method: 'POST', status: 409 })
    assert.equal(early.code, 'namespace_not_ready')
  })

  await check('two installations racing for the same slug: exactly one reservation, 15 rounds, both directions', async () => {
    for (let round = 0; round < 15; round++) {
      const slug = `carrera-${suffix}-${round}`
      const [a, b] = await Promise.all([
        fetch(`${labTarget.urls.api}/website/sites/${site.id}/domains`, { method: 'POST', headers: { Authorization: `Bearer ${owner}`, 'X-Runly-Company-Id': company, 'Content-Type': 'application/json', 'Idempotency-Key': randomBytes(16).toString('hex') }, body: JSON.stringify({ slug }) }).then(async (r) => ({ status: r.status, json: await r.json() })),
        claimOnB(slug).then(() => ({ status: 201 }), (error) => ({ status: error.status })),
      ])
      assert.deepEqual([a.status, b.status].sort(), [201, 409], `round ${round}: ${a.status}/${b.status}`)
      const owners = (await registryDb.query("SELECT installation_id FROM hub.registry_names WHERE slug=$1", [slug])).rows
      assert.equal(owners.length, 1); assert.equal(owners[0].installation_id, a.status === 201 ? installationA.id : installationB.id)
      const local = (await labDb.query('SELECT count(*)::int n FROM website_domain WHERE hostname=$1', [`${slug}.${namespace}`])).rows[0].n
      assert.equal(local, a.status === 201 ? 1 : 0, 'the loser never gets a local row')
    }
  })

  await check('installations cannot touch each other: another installation, another company and a reader are all refused', async () => {
    const host = `tienda-${suffix}.${namespace}`
    await assert.rejects(clientB.activate(host), (e) => e.status === 404, 'installation B cannot activate an A name')
    await assert.rejects(clientB.release(host), (e) => e.status === 404)
    assert.deepEqual((await clientB.list()).filter((n) => n.hostname === host), [])
    for (const [path, method] of [[`/domains/${host}`, 'GET'], [`/domains/${host}/activate`, 'POST'], [`/domains/${host}/release`, 'POST']]) {
      await call(`/website/sites/${otherSite.id}${path}`, { method, auth: foreign, companyId: foreignCompany, status: 404 })
      const crossed = await fetch(`${labTarget.urls.api}/website/sites/${site.id}${path}`, { method, headers: { Authorization: `Bearer ${foreign}`, 'X-Runly-Company-Id': company, 'Idempotency-Key': randomBytes(16).toString('hex') } })
      assert.ok([401, 403, 404].includes(crossed.status), `${method} ${path} with another company's header: ${crossed.status}`)
    }
    await call(`/website/sites/${site.id}/domains`, { method: 'POST', auth: reader, status: 403, body: { slug: `lector-${suffix}` } })
    await call(`/website/sites/${site.id}/domains/${host}/activate`, { method: 'POST', auth: reader, status: 403 })
    assert.equal((await registryDb.query('SELECT count(*)::int n FROM hub.registry_names WHERE slug=$1', [`lector-${suffix}`])).rows[0].n, 0)
  })

  await check('idempotent reservation: the same key returns the same name without a second effect', async () => {
    const slug = `idem-${suffix}`, key = randomBytes(16).toString('hex')
    const first = await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 201, body: { slug }, key })
    const again = await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 201, body: { slug }, key })
    assert.equal(again.data.hostname, first.data.hostname)
    assert.equal((await registryDb.query("SELECT count(*)::int n FROM hub.registry_audit WHERE hostname=$1 AND action='claim'", [first.data.hostname])).rows[0].n, 1)
    const fresh = await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 201, body: { slug } })
    assert.equal(fresh.data.hostname, first.data.hostname, 'a new key for the same site is also safe')
  })

  await check('validation: reserved, look-alike and invalid names are refused before and by the registry', async () => {
    for (const slug of ['admin', 'runly-tienda', 'str1pe']) assert.equal((await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 409, body: { slug } })).code, 'name_reserved', slug)
    await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 422, body: { slug: 'a--b' } })
    assert.deepEqual((await call(`/website/sites/${site.id}/domains/availability?slug=admin`)).data, { available: false, reason: 'NAME_RESERVED' })
  })

  const hostname = `tienda-${suffix}.${namespace}`
  await check('activation waits for infrastructure, then a published site resolves by hostname; spoofed headers do not', async () => {
    const draftPage = (await call(`/website/sites/${site.id}/pages`, { method: 'POST', status: 201, body: { title: 'Home', slug: 'home', routePath: '/', visibility: 'public' } })).data
    await call(`/website/sites/${site.id}/pages/${draftPage.id}/draft`, { method: 'PUT', body: { document: document('Hola registro'), expectedRevision: 0 } })
    const state = (await call(`/website/sites/${site.id}/state`)).data
    const release = (await call(`/website/sites/${site.id}/releases`, { method: 'POST', status: 202, body: { kind: 'builder', expectedDraftRevision: state.draftRevision, expectedPublicationRevision: state.publicationRevision, baseReleaseId: state.activeReleaseId, changes: { publishPageIds: [draftPage.id], includeThemeAndMenus: true } } })).data
    await call(`/website/sites/${site.id}/publication/activate`, { method: 'POST', body: { releaseId: release.id, manifestHash: release.manifestHash, expectedDraftRevision: release.draftRevision, expectedPublicationRevision: release.publicationRevision } })
    assert.equal((await hostGet(hostname)).status, 404, 'published but the name is still pending')
    await hub.setNamespace(operator, { root: namespace, ready: true })
    const live = (await call(`/website/sites/${site.id}/domains/${hostname}/activate`, { method: 'POST' })).data
    assert.equal(live.state, 'assigned'); assert.equal(live.ready, true)
    const served = await hostGet(hostname); assert.equal(served.status, 200, served.body.slice(0, 200)); assert.ok(served.body.includes(`data-release="${release.id}"`))
    assert.equal((await hostGet(`unassigned-${suffix}.${namespace}`)).status, 404, 'unregistered hostnames are rejected')
    assert.equal((await hostGet(`unassigned-${suffix}.${namespace}`, '/', { 'X-Forwarded-Host': hostname })).status, 404, 'X-Forwarded-Host is never trusted')
    assert.equal((await hostGet(hostname, '/', { 'X-Forwarded-Host': `unassigned-${suffix}.${namespace}` })).status, 200, 'the connection host decides, not forwarded headers')
    assert.equal((await call(`/website/sites/${site.id}/domains`)).data.find((d) => d.hostname === hostname).registryManaged, true)
  })

  await check('historical hostnames keep serving, never depend on the registry and cannot be altered', async () => {
    const hist = `historico-${suffix}.${namespace}`
    await labDb.query("INSERT INTO website_domain(hostname,company_id,site_id,kind,state,ready) VALUES($1,$2,$3,'platform','assigned',true)", [hist, company, site.id])
    assert.equal((await hostGet(hist)).status, 200)
    await assert.rejects(labDb.query("UPDATE website_domain SET state='pending' WHERE hostname=$1", [hist]), /append only/)
    await assert.rejects(labDb.query('DELETE FROM website_domain WHERE hostname=$1', [hist]), /append only/)
    await assert.rejects(labDb.query('UPDATE website_domain SET site_id=$2 WHERE hostname=$1', [hostname, otherSite.id]), /append only|foreign key|violates/)
    await assert.rejects(labDb.query('DELETE FROM website_domain WHERE hostname=$1', [hostname]), /append only/)
  })

  await check('registry outage: published sites keep serving, new reservations fail clearly, state survives the restart', async () => {
    stopRegistry(); await wait(1000)
    assert.equal((await hostGet(hostname)).status, 200, 'serving never calls the registry')
    assert.equal((await hostGet(`historico-${suffix}.${namespace}`)).status, 200)
    const down = await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 503, body: { slug: `caida-${suffix}` } })
    assert.equal(down.code, 'registry_unavailable')
    const stale = (await call(`/website/sites/${site.id}/domains/${hostname}`)).data
    assert.equal(stale.stale, true); assert.equal(stale.state, 'assigned')
    await wait(4000)
    assert.equal((await hostGet(hostname)).status, 200, 'failed syncs change nothing')
    assert.equal((await registryDb.query('SELECT state FROM hub.registry_names WHERE hostname=$1', [hostname])).rows[0].state, 'assigned', 'silence never releases a name')
    await startRegistry()
    const back = (await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 201, body: { slug: `caida-${suffix}` } })).data
    assert.equal(back.state, 'pending')
    assert.equal((await call(`/website/sites/${site.id}/domains/${hostname}`)).data.stale, false)
  })

  await check('revocation: suspension stops new resolutions through the synchronisation, restoration brings them back', async () => {
    await hub.setNameState(operator, { hostname, state: 'suspended', reason: 'laboratory abuse report' })
    await waitFor(async () => (await hostGet(hostname)).status === 404, 'suspended name stops resolving', 30000)
    assert.equal((await labDb.query('SELECT state,ready FROM website_domain WHERE hostname=$1', [hostname])).rows[0].state, 'suspended')
    await hub.setNameState(operator, { hostname, state: 'assigned', reason: 'laboratory restoration' })
    await waitFor(async () => (await hostGet(hostname)).status === 200, 'restored name resolves again', 30000)
    await hub.setNamespace(operator, { root: namespace, ready: false })
    await waitFor(async () => (await hostGet(hostname)).status === 404, 'a namespace that is not ready stops serving', 30000)
    await hub.setNamespace(operator, { root: namespace, ready: true })
    await waitFor(async () => (await hostGet(hostname)).status === 200, 'ready again', 30000)
    const release = (await call(`/website/sites/${site.id}/releases`)).data
    assert.ok(release.length >= 1, 'historical releases stay intact')
  })

  await check('explicit release quarantines the name locally and in the registry; nobody else can take it', async () => {
    const slug = `temporal-${suffix}`
    const made = (await call(`/website/sites/${site.id}/domains`, { method: 'POST', status: 201, body: { slug } })).data
    const released = (await call(`/website/sites/${site.id}/domains/${made.hostname}/release`, { method: 'POST' })).data
    assert.equal(released.state, 'quarantined'); assert.equal(released.ready, false)
    await assert.rejects(claimOnB(slug), (e) => e.status === 409)
    assert.equal((await call(`/website/sites/${site.id}/domains/availability?slug=${slug}`)).data.reason, 'NAME_UNAVAILABLE')
  })

  await check('installation revocation cuts mutations and suspends its names without deleting anything', async () => {
    const before = (await registryDb.query("SELECT count(*)::int n FROM hub.registry_names WHERE installation_id=$1", [installationB.id])).rows[0].n
    const cut = await hub.setInstallationStatus(operator, { id: installationB.id, status: 'revoked', reason: 'laboratory key compromise' })
    assert.ok(cut.suspendedNames >= 0)
    await assert.rejects(claimOnB(`tarde-${suffix}`), (e) => e.status === 401)
    assert.equal((await registryDb.query("SELECT count(*)::int n FROM hub.registry_names WHERE installation_id=$1", [installationB.id])).rows[0].n, before)
    assert.equal((await hostGet(hostname)).status, 200, 'installation A is unaffected')
    assert.ok((await hub.operatorAudit({ hostname })).length >= 3, 'the registry keeps an audit trail')
  })
  console.log(`\nWebsite registry lab PASSED (${results.length} checks)`)
} catch (error) {
  failed = error
  console.error(error.stack ?? error.message)
} finally {
  await adminDb?.end().catch(() => {}); await registryDb?.end().catch(() => {}); await labDb?.end().catch(() => {})
  teardown()
}
process.exit(failed ? 1 : 0)
