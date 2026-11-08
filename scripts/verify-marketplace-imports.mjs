// ERP E3a verification: Marketplace imports of a Studio template and an automation on a disposable
// Supabase installation (real PostgreSQL, Auth and private Storage; current migrations + seed of this
// working tree). The catalog is the REAL E2 consumer reading through file:// a feed captured from the
// real H4 Developer Hub lab (scripts/fixtures/marketplace/h4-lab, signed with a lab TEST key) and
// feeds re-signed with the public test-vector key for the negative cases. Both test keys are injected
// as trust; no production key, feed or database is used. Never reads .env.
//   node scripts/verify-marketplace-imports.mjs
import assert from 'node:assert/strict'
import { createHash, createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Hono } from 'hono'
import prismaPackage from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { createStudioService } from '../apps/api/src/routes/studio/studio-service.js'
import { createStudioTemplatesService } from '../apps/api/src/routes/studio/studio-templates-service.js'
import { createFilesService } from '../apps/api/src/services/files-service.js'
import { createStudioInterchange } from '../apps/api/src/routes/studio/interchange/service.js'
import { createStudioInterchangeRouter } from '../apps/api/src/routes/studio/interchange/router.js'
import { createAutomationsRouter } from '../apps/api/src/routes/automations-routes.js'
import { createSystemAutomationsService } from '../apps/api/src/services/system-automations-service.js'
import { WEBHOOK_EVENT } from '../apps/api/src/services/automation-webhooks-service.js'
import { createResourceCatalogService, RESOURCE_CONFIG_KEYS } from '../apps/api/src/services/catalog/resource-catalog-service.js'
import { resourceReleaseBytes, resourceSnapshotBytes, resourceSnapshotDigest } from '../apps/api/src/services/catalog/catalog-resource-contract.js'
import { keyIdOf } from '../apps/api/src/services/catalog/catalog-v2-contract.js'
import { createMarketplaceImportGate } from '../apps/api/src/services/marketplace/marketplace-import-gate.js'
import { createRunlyClient } from '../packages/sdk/src/index.js'

const require = createRequire(new URL('../apps/api/package.json', import.meta.url)), { serve } = require('@hono/node-server'), { createClient } = require('@supabase/supabase-js')
const checks = [], ok = (message) => { checks.push(message); console.log(`PASS ${message}`) }
const unpack = (r) => r.data ?? r
const LAB = resolve('scripts/fixtures/marketplace/h4-lab'), CORPUS = resolve('packages/studio-interchange/corpus/studio')
const sha = (b) => createHash('sha256').update(b).digest('hex'), b64 = (b) => Buffer.from(b).toString('base64'), iso = (t) => new Date(t).toISOString()
const rejects = async (promise, { status, code } = {}) => {
  try { await promise } catch (error) {
    if (status) assert.equal(error.status, status, `expected HTTP ${status}, got ${error.status} ${error.message}`)
    if (code) assert.equal(error.details?.code, code, `expected ${code}, got ${error.details?.code} ${error.message}`)
    return error
  }
  assert.fail(`expected a rejection${code ? ` ${code}` : ''}`)
}

// ---- Feeds ----
const published = JSON.parse(await readFile(join(LAB, 'published/index.json'), 'utf8'))
const withdrawnRevoked = JSON.parse(await readFile(join(LAB, 'withdrawn-revoked/index.json'), 'utf8'))
const LAB_KEY = published.signed.trust.keys[0].publicKey
const vectors = JSON.parse(await readFile('apps/api/src/services/catalog/__tests__/fixtures/resource-feed-v1.vectors.json', 'utf8'))
const vectorKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), createHash('sha256').update('runly-resource-feed-v1 TEST VECTORS ONLY - not a production key').digest()]), format: 'der', type: 'pkcs8' })
const VECTOR = vectors.testKey
const stranger = generateKeyPairSync('ed25519')
const strangerId = keyIdOf(stranger.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))
const studioLab = published.signed.entries.find((e) => e.type === 'studio_template'), automationLab = published.signed.entries.find((e) => e.type === 'automation')
const ref = (e) => ({ resourceKey: e.resourceKey, version: e.version, releaseId: e.releaseId })

let clock = Date.parse(published.signed.generatedAt) + 3_600_000, lastSigned = null, feedDir
async function serveFeed(envelope, packages) {
  await rm(feedDir, { recursive: true, force: true }); await mkdir(join(feedDir, 'packages'), { recursive: true })
  await writeFile(join(feedDir, 'index.json'), JSON.stringify(envelope))
  for (const [hash, bytes] of Object.entries(packages)) await writeFile(join(feedDir, 'packages', hash), bytes)
}
const labPackages = async () => Object.fromEntries(await Promise.all(published.signed.entries.map(async (e) => [e.sha256, await readFile(join(LAB, 'published', e.packageUrl))])))
// A new snapshot chained after `lastSigned`, signed with the vector test key; each item is one release.
function vectorFeed(items) {
  const template = vectors.snapshot1.envelope.signed
  const entries = items.map((item) => {
    const base = template.entries.find((e) => e.type === item.type)
    const entry = { ...base, resourceKey: item.resourceKey, version: '1.0.0', releaseId: randomUUID(), sha256: item.sha256 ?? sha(item.bytes), size: item.size ?? item.bytes.length, title: item.title ?? item.resourceKey, description: 'Paquete de prueba de E3a.', publishedAt: iso(clock - 60_000),
      compatibility: { runly: { min: item.runlyMin ?? '0.1.0', max: null }, format: { name: item.type === 'automation' ? 'automation' : 'studio', version: 1 } }, keyId: item.untrusted ? strangerId : VECTOR.keyId }
    entry.packageUrl = `packages/${entry.sha256}`
    entry.signature = b64(sign(null, resourceReleaseBytes(entry), item.untrusted ? stranger.privateKey : vectorKey))
    return entry
  })
  const signed = { ...template, sequence: lastSigned.sequence + 1, previous: { sequence: lastSigned.sequence, sha256: resourceSnapshotDigest(lastSigned) }, generatedAt: iso(clock), validUntil: iso(clock + 6 * 86_400_000), entries, revocations: [] }
  return { ...vectors.snapshot1.envelope, signed, signatures: [{ keyId: VECTOR.keyId, signature: b64(sign(null, resourceSnapshotBytes(signed), vectorKey)) }] }
}

// ---- Stack ----
const stack = await createStudioStack({ apiImage: 'runly-studio-combined:api' })
let prisma, server, interchange, passed = false
try {
  if (Object.values(stack.ports).some((p) => p === 4010 || p === 5173)) throw new Error('SHARED_PORT_FORBIDDEN')
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await stack.verifyTarget()
  const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
  const env = { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl }
  await command(process.execPath, [createRequire(resolve('package.json')).resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env, log: join(stack.directory, 'migrate.log') })
  await command(process.execPath, [resolve('prisma/seed.js')], { env, log: join(stack.directory, 'seed.log') })
  const q = async (sql, params) => (await stack.pool.query(sql, params)).rows
  assert.ok((await q("SELECT 1 FROM _prisma_migrations WHERE migration_name='20261229100000_marketplace_imports' AND finished_at IS NOT NULL")).length)
  const { users, companies, admin } = await seedStudioScenario(stack)
  for (const c of companies) await q(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key IN ('automations.access','automations.read','automations.manage') ON CONFLICT DO NOTHING`, [c.roleId])
  await q(`UPDATE runly_module SET enabled=true,status='INSTALLED' WHERE key='runly.automations'`)
  const bucket = await admin.storage.createBucket('runly-files', { public: false }); assert.ok(!bucket.error || bucket.error.statusCode === '409')
  prisma = new prismaPackage.PrismaClient({ adapter: new PrismaPg(stack.pool) })
  const faults = { uploads: 0 }
  const storage = { ...admin, storage: { from: (name) => {
    const original = admin.storage.from(name)
    return { ...original,
      upload: async (...args) => { faults.uploads++; if (faults.failUploadAt === faults.uploads) return { error: Error('Synthetic Storage interruption') }; return original.upload(...args) },
      remove: async (...args) => (faults.failRemove ? { error: Error('Synthetic cleanup outage') } : original.remove(...args)),
      download: (...args) => original.download(...args) }
  } } }
  const files = createFilesService({ prisma, supabaseAdmin: storage })
  const designs = createStudioService({ prisma, filesService: files })
  const templates = createStudioTemplatesService({ prisma, filesService: files, supabaseAdmin: storage, designService: designs })
  feedDir = join(stack.directory, 'feed')
  await q(`INSERT INTO instance_config(key,value,updated_at) VALUES ($1,$2,now())`, [RESOURCE_CONFIG_KEYS.url, pathToFileURL(join(feedDir, 'index.json')).href])
  const trust = { resource: [LAB_KEY, VECTOR.publicKey] }
  const makeCatalog = () => createResourceCatalogService({ prisma, trust, now: () => clock })
  const gate = createMarketplaceImportGate({ catalog: makeCatalog(), now: () => clock })
  interchange = createStudioInterchange({ prisma, filesService: files, supabaseAdmin: storage, designs, templates, verifySource: gate.recheck })

  const app = new Hono()
  app.use('*', async (c, next) => {
    const { data, error } = await admin.auth.getUser(c.req.header('Authorization')?.replace(/^Bearer /, ''))
    if (error || !data.user) return c.json({ error: 'Unauthorized' }, 401)
    const profile = await prisma.userProfile.findUnique({ where: { authUserId: data.user.id } })
    const companyId = c.req.header('X-Runly-Company-Id')
    const permissions = await q('SELECT p.key FROM membership m JOIN role_permission rp ON rp.role_id=m.role_id JOIN permission p ON p.id=rp.permission_id WHERE m.company_id=$1 AND m.user_id=$2', [companyId, profile.id])
    c.set('authUserId', data.user.id); c.set('userId', profile.id); c.set('userContext', { profile }); c.set('companyId', companyId)
    c.set('tenantContext', { isAdmin: false, permissionSet: new Set(permissions.map((p) => p.key)) }); await next()
  })
  // The same SQL guard the API uses for membership + permission.
  const requirePermission = (key) => async (c, next) => {
    const [row] = await q('SELECT public.runly_member_active($1::uuid,$2::uuid,$3) AS ok', [c.get('companyId'), c.get('userId'), key])
    if (!row.ok) return c.json({ error: 'Sin permiso.' }, 403)
    await next()
  }
  app.route('/', createStudioInterchangeRouter({ prisma, filesService: files, supabaseAdmin: storage, service: designs, templates, requirePermission, marketplace: gate, interchange, onInternalError: (e) => console.error(e) }))
  app.route('/', createAutomationsRouter({ prisma, requirePermission, marketplace: gate }))
  server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }); await new Promise((r) => server.once('listening', r))
  const url = `http://127.0.0.1:${server.address().port}`
  const tokens = []
  for (const user of users) {
    const auth = createClient(stack.urls.kong, stack.secret.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const session = await auth.auth.signInWithPassword({ email: user.email, password: user.password }); assert.ok(!session.error)
    tokens.push(session.data.session.access_token)
  }
  const as = (actor, company = 0) => { const client = createRunlyClient({ baseUrl: url, getActiveCompanyId: () => companies[company].id }); return { studio: client.studio, auto: client.modules, token: tokens[actor] } }
  const owner = as(0), foreign = as(3, 1), peer = as(2), denied = as(1), ownerInB = as(0, 1)
  const count = async (table, where = 'true', params = []) => Number((await q(`SELECT count(*) n FROM ${table} WHERE ${where}`, params))[0].n)
  const grants = (companyId) => q("SELECT service_key FROM module_service_grant WHERE module_key='system.automations' AND company_id=$1 ORDER BY 1", [companyId])

  // ================= Catalog: real H4 feed =================
  await serveFeed(published, await labPackages()); lastSigned = published.signed
  const studioList = unpack(await owner.studio.marketplaceTemplates({}, owner.token))
  assert.equal(studioList.catalog.sequence, 2)
  const listed = studioList.items.find((i) => i.resourceKey === studioLab.resourceKey)
  assert.ok(listed.eligible && listed.trust === 'resource' && listed.releaseId === studioLab.releaseId)
  assert.deepEqual(unpack(await owner.auto.marketplaceAutomations({}, owner.token)).items.map((i) => i.resourceKey), [automationLab.resourceKey])
  assert.equal((await createResourceCatalogService({ prisma, trust, now: () => clock }).status()).sequence, 2)
  await rejects(denied.studio.marketplaceTemplates({}, denied.token), { status: 403 })
  await rejects(denied.auto.marketplaceAutomations({}, denied.token), { status: 403 })
  ok('Real H4 lab feed (seq 2) verified by the E2 consumer with an injected test key; state persists across a service restart; members without permission get 403')

  // ================= Studio =================
  const inspected = unpack(await owner.studio.inspectMarketplaceTemplate(ref(studioLab), owner.token))
  assert.equal(inspected.diagnostics.ok, true); assert.deepEqual(inspected.package.blockingErrors ?? [], []); assert.equal(inspected.source.sha256, studioLab.sha256)
  assert.equal(await count('studio_interchange_job'), 0, 'inspect saves nothing')
  const filesBefore = await count('file_asset')
  const job = unpack(await owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'personal', name: 'Menú importado' }, owner.token))
  assert.equal(job.state, 'ready'); assert.equal(await count('file_asset'), filesBefore, 'staging exposes no FileAsset')
  const [row] = await q('SELECT source FROM studio_interchange_job WHERE id=$1', [job.id])
  for (const [k, v] of Object.entries({ kind: 'marketplace', resourceKey: studioLab.resourceKey, version: '1.0.0', releaseId: studioLab.releaseId, sha256: studioLab.sha256, publisher: studioLab.publisher, catalogSequence: 2, importedBy: users[0].id, companyId: companies[0].id })) assert.equal(row.source[k], v, k)
  await rejects(owner.studio.confirmPackageImport(job.id, { digest: '0'.repeat(64), acceptWarnings: true }, owner.token), { status: 409 })
  await rejects(peer.studio.confirmPackageImport(job.id, { digest: job.digest, acceptWarnings: true }, peer.token), { status: 404 })
  await rejects(ownerInB.studio.confirmPackageImport(job.id, { digest: job.digest, acceptWarnings: true }, ownerInB.token), { status: 404 })
  const confirmed = unpack(await owner.studio.confirmPackageImport(job.id, { digest: job.digest, acceptWarnings: true }, owner.token))
  assert.deepEqual(unpack(await owner.studio.confirmPackageImport(job.id, { digest: job.digest, acceptWarnings: true }, owner.token)), confirmed)
  const template = await templates.get(companies[0].id, users[0].id, confirmed.id)
  assert.equal(template.scope, 'personal'); assert.equal(template.name, 'Menú importado')
  const again = unpack(await owner.studio.confirmPackageImport(unpack(await owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'personal', name: 'Menú importado' }, owner.token)).id, { digest: job.digest, acceptWarnings: true }, owner.token))
  assert.notEqual(again.id, confirmed.id); assert.equal((await templates.get(companies[0].id, users[0].id, confirmed.id)).revision, template.revision)
  const inB = unpack(await foreign.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'company', name: 'Menú B' }, foreign.token))
  const inBResult = unpack(await foreign.studio.confirmPackageImport(inB.id, { digest: inB.digest, acceptWarnings: true }, foreign.token))
  await templates.get(companies[1].id, users[3].id, inBResult.id)
  await rejects(templates.get(companies[0].id, users[0].id, inBResult.id))
  ok('Studio: server-side download + E1b inspection, no persistence on inspect, provenance on the job, digest/actor/company bound confirm, idempotent double confirm, every import a new copy, two companies isolated')

  await q("DELETE FROM role_permission WHERE role_id=$1 AND permission_id IN (SELECT id FROM permission WHERE key='studio.templates.publish')", [companies[0].roleId])
  await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'company', name: 'Sin permiso' }, owner.token), { status: 403 })
  await q("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key='studio.templates.publish'", [companies[0].roleId])
  const quota = [unpack(await owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'design', name: 'Cuota 1' }, owner.token)), unpack(await owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'design', name: 'Cuota 2' }, owner.token))]
  await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'design', name: 'Cuota 3' }, owner.token), { status: 429 })
  for (const j of quota) await owner.studio.cancelPackageImport(j.id, owner.token)
  ok('Studio: target permission checked before download (studio.templates.publish), staging quota enforced')

  const storedFiles = await count('file_asset')
  faults.uploads = 0; faults.failUploadAt = 1; faults.failRemove = true
  await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'design', name: 'Interrumpida' }, owner.token))
  faults.failUploadAt = null; faults.failRemove = false
  assert.equal(await count('file_asset'), storedFiles)
  await interchange.recover(companies[0].id, users[0].id)
  assert.equal(await count('studio_interchange_job', "state='cleanup'"), 0)
  ok('Studio: Storage interruption during a Marketplace preparation leaves no FileAsset and is recovered by the existing compensation')

  // ================= Automations (real H4 file) =================
  const autoBefore = { imports: await count('marketplace_automation_import'), automations: await count('system_automation'), grants: (await grants(companies[0].id)).length }
  const report = unpack(await owner.auto.inspectMarketplaceAutomation(ref(automationLab), owner.token))
  assert.equal(report.blocked, false); assert.deepEqual(report.report.services, ['runly.notifications:notifications.send']); assert.equal(report.report.trigger, 'webhook'); assert.equal(report.report.importsPaused, true)
  assert.equal(report.definition.enabled, undefined, 'no enabled flag in the stored definition')
  assert.deepEqual({ imports: await count('marketplace_automation_import'), automations: await count('system_automation'), grants: (await grants(companies[0].id)).length }, autoBefore, 'inspect saves nothing')
  const prep = unpack(await owner.auto.prepareMarketplaceAutomationImport(ref(automationLab), owner.token))
  assert.equal(prep.state, 'prepared'); assert.deepEqual(prep.consentRequired.services, ['runly.notifications:notifications.send'])
  assert.equal((await grants(companies[0].id)).length, 0, 'preparing grants nothing')
  const consent = { definitionDigest: prep.definitionDigest, services: prep.services, acceptRisks: true }
  await rejects(owner.auto.confirmMarketplaceAutomationImport(prep.id, { ...consent, services: [] }, owner.token), { status: 409, code: 'AUTOMATION_IMPORT_CONSENT_MISMATCH' })
  await rejects(owner.auto.confirmMarketplaceAutomationImport(prep.id, { ...consent, acceptRisks: false }, owner.token), { status: 400 })
  await rejects(owner.auto.confirmMarketplaceAutomationImport(prep.id, { ...consent, definitionDigest: 'a'.repeat(64) }, owner.token), { status: 409, code: 'AUTOMATION_IMPORT_DIGEST_MISMATCH' })
  await rejects(peer.auto.confirmMarketplaceAutomationImport(prep.id, consent, peer.token), { status: 404 })
  await rejects(ownerInB.auto.confirmMarketplaceAutomationImport(prep.id, consent, ownerInB.token), { status: 404 })
  await rejects(denied.auto.confirmMarketplaceAutomationImport(prep.id, consent, denied.token), { status: 403 })
  assert.equal(await count('system_automation'), autoBefore.automations); assert.equal((await grants(companies[0].id)).length, 0)
  const imported = unpack(await owner.auto.confirmMarketplaceAutomationImport(prep.id, consent, owner.token))
  assert.deepEqual(unpack(await owner.auto.confirmMarketplaceAutomationImport(prep.id, consent, owner.token)), imported)
  const [auto] = await q('SELECT * FROM system_automation WHERE id=$1', [imported.id])
  assert.equal(auto.enabled, false); assert.equal(auto.webhook_token, null); assert.equal(auto.created_by_id, users[0].id); assert.equal(auto.company_id, companies[0].id); assert.match(auto.key, /^aviso_de_pago_[a-f0-9]{6}$/)
  assert.deepEqual((await grants(companies[0].id)).map((g) => g.service_key), ['runly.notifications:notifications.send'])
  assert.equal((await grants(companies[1].id)).length, 0)
  const [audit] = await q("SELECT * FROM audit_log WHERE action='automation.marketplace.imported' AND entity_id=$1", [imported.id])
  assert.equal(audit.metadata.marketplace.releaseId, automationLab.releaseId); assert.equal(audit.metadata.marketplace.sha256, automationLab.sha256); assert.deepEqual(audit.metadata.consent.services, consent.services)
  ok('Automation: inspect + prepare save/grant nothing; consent bound to digest, exact services, actor and company; confirm creates a paused automation without webhook token, grants only the consented service, audits release + sha256; repeat is idempotent')

  const system = createSystemAutomationsService({ prisma })
  await system.runEvent({ companyId: companies[0].id, event: WEBHOOK_EVENT, payload: { automationKey: auto.key, data: {} }, eventId: randomUUID() })
  assert.equal((await system.listSchedules()).length, 0)
  assert.equal(await count('automation_run', 'company_id=$1', [companies[0].id]), 0); assert.equal(await count('automation_job', 'company_id=$1', [companies[0].id]), 0)
  const second = unpack(await owner.auto.prepareMarketplaceAutomationImport(ref(automationLab), owner.token))
  await rejects(owner.auto.confirmMarketplaceAutomationImport(second.id, { ...consent, key: auto.key }, owner.token), { status: 409, code: 'AUTOMATION_KEY_TAKEN' })
  assert.equal(await count('system_automation'), autoBefore.automations + 1)
  const copy = unpack(await owner.auto.confirmMarketplaceAutomationImport(second.id, consent, owner.token))
  assert.notEqual(copy.key, auto.key); assert.equal((await q('SELECT enabled FROM system_automation WHERE id=$1', [copy.id]))[0].enabled, false)
  ok('Automation: no run, job, schedule or webhook delivery for the paused import; an existing key is never overwritten, a second import is a new paused copy')

  // ================= Hub unreachable at confirmation: never confirm on an older copy =================
  {
    const pendingStudio = unpack(await owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'personal', name: 'Sin conexión' }, owner.token))
    const pendingAuto = unpack(await owner.auto.prepareMarketplaceAutomationImport(ref(automationLab), owner.token))
    const counts = async () => [await count('studio_template'), await count('system_automation'), await count('file_asset')]
    const before = await counts()
    await rm(join(feedDir, 'index.json'))
    await rejects(owner.studio.confirmPackageImport(pendingStudio.id, { digest: pendingStudio.digest, acceptWarnings: true }, owner.token), { status: 503, code: 'RESOURCE_FEED_UNVERIFIED' })
    await rejects(owner.auto.confirmMarketplaceAutomationImport(pendingAuto.id, { definitionDigest: pendingAuto.definitionDigest, services: pendingAuto.services, acceptRisks: true }, owner.token), { status: 503, code: 'RESOURCE_FEED_UNVERIFIED' })
    assert.deepEqual(await counts(), before, 'nothing is created while the feed cannot be verified')
    assert.equal((await q('SELECT state FROM studio_interchange_job WHERE id=$1', [pendingStudio.id]))[0].state, 'ready', 'the preparation stays recoverable')
    assert.equal((await q('SELECT state FROM marketplace_automation_import WHERE id=$1', [pendingAuto.id]))[0].state, 'prepared')
    await serveFeed(published, await labPackages())
    assert.ok(unpack(await owner.studio.confirmPackageImport(pendingStudio.id, { digest: pendingStudio.digest, acceptWarnings: true }, owner.token)).id)
    assert.equal(unpack(await owner.auto.confirmMarketplaceAutomationImport(pendingAuto.id, { definitionDigest: pendingAuto.definitionDigest, services: pendingAuto.services, acceptRisks: true }, owner.token)).enabled, false)
    ok('Hub unreachable at confirmation: Studio and automation confirmations refuse with a retryable 503, create nothing and keep the preparation; after restoring the feed the same confirmations succeed')
  }

  // ================= Revocation after preparation (real H4 seq 4) =================
  const pendingStudio = unpack(await owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'personal', name: 'Antes de retirar' }, owner.token))
  const pendingAuto = unpack(await owner.auto.prepareMarketplaceAutomationImport(ref(automationLab), owner.token))
  const filesNow = await count('file_asset'), templatesNow = await count('studio_template'), automationsNow = await count('system_automation')
  await serveFeed(withdrawnRevoked, await labPackages()); lastSigned = withdrawnRevoked.signed
  await rejects(owner.studio.confirmPackageImport(pendingStudio.id, { digest: pendingStudio.digest, acceptWarnings: true }, owner.token), { status: 409, code: 'RESOURCE_WITHDRAWN' })
  assert.equal((await q('SELECT state FROM studio_interchange_job WHERE id=$1', [pendingStudio.id]))[0].state, 'cancelled')
  await rejects(owner.auto.confirmMarketplaceAutomationImport(pendingAuto.id, { definitionDigest: pendingAuto.definitionDigest, services: pendingAuto.services, acceptRisks: true }, owner.token), { status: 409, code: 'RESOURCE_REVOKED' })
  assert.equal((await q('SELECT state FROM marketplace_automation_import WHERE id=$1', [pendingAuto.id]))[0].state, 'cancelled')
  assert.deepEqual([await count('file_asset'), await count('studio_template'), await count('system_automation')], [filesNow, templatesNow, automationsNow])
  await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'personal', name: 'Retirada' }, owner.token), { status: 409, code: 'RESOURCE_WITHDRAWN' })
  ok('Withdrawal (Studio) and revocation (automation) published after preparation block the confirm, discard the preparation and create nothing')

  // ================= Rollback, expiry =================
  await serveFeed(published, await labPackages())
  const rolledBack = await makeCatalog().refresh()
  assert.equal(rolledBack.alert, 'RESOURCE_FEED_ROLLBACK'); assert.equal(rolledBack.sequence, 4)
  await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...ref(studioLab), target: 'personal', name: 'Rollback' }, owner.token), { status: 409, code: 'RESOURCE_WITHDRAWN' })
  assert.equal(unpack(await owner.studio.marketplaceTemplates({}, owner.token)).catalog.sequence, 4)
  clock = Date.parse(withdrawnRevoked.signed.validUntil) + 60_000
  await rejects(owner.auto.inspectMarketplaceAutomation(ref(automationLab), owner.token), { status: 409, code: 'RESOURCE_REVOKED' })
  const expired = unpack(await owner.studio.marketplaceTemplates({}, owner.token))
  assert.equal(expired.catalog.sequence, 4); assert.equal(expired.catalog.installable, false); assert.equal(expired.catalog.reason, 'RESOURCE_FEED_EXPIRED')
  ok('A rolled-back feed (seq 2 after seq 4) is refused and the last verified copy stays; an expired feed offers nothing for import')

  // ================= Negative feeds (vector test key) =================
  const valid = await readFile(join(CORPUS, 'valid.runlystudio')), unknownFont = await readFile(join(CORPUS, 'unknown-font.runlystudio')), forbidden = await readFile(join(CORPUS, 'forbidden-license.runlystudio'))
  const automationFile = (automation) => Buffer.from(JSON.stringify({ format: 'runly.automation', version: 1, automation }))
  const personal = automationFile({ label: 'Aviso a clientes', trigger: { type: 'webhook', fields: [] }, steps: [
    { service: 'runly.notifications:notifications.send', args: { userIds: { from: 'value', value: [users[2].id] }, title: { from: 'template', template: 'Pago' } } },
    { service: 'runly.notifications:email.send', args: { to: { from: 'value', value: 'cliente@externo.example' }, subject: { from: 'template', template: 'Gracias' }, body: { from: 'template', template: 'Hola' } } },
  ] })
  const http = automationFile({ label: 'Llamar a un sistema', trigger: { type: 'webhook', fields: [] }, steps: [{ type: 'http', method: 'POST', url: 'https://api.externo.example/hook', body: {} }] })
  const newer = Buffer.from(JSON.stringify({ format: 'runly.automation', version: 2, automation: { label: 'Futura', trigger: { type: 'webhook', fields: [] }, steps: [] } }))
  const big = Buffer.alloc(250 * 1024, 0x20)
  const items = [
    { type: 'studio_template', resourceKey: 'studio.fuente-desconocida', bytes: unknownFont },
    { type: 'studio_template', resourceKey: 'studio.licencia-prohibida', bytes: forbidden },
    { type: 'studio_template', resourceKey: 'studio.alterada', bytes: valid, served: Buffer.concat([valid, Buffer.from('x')]), sha256: sha(Buffer.concat([valid, Buffer.from('y')])), size: valid.length + 1 },
    { type: 'studio_template', resourceKey: 'studio.no-confiable', bytes: valid, untrusted: true },
    { type: 'studio_template', resourceKey: 'studio.runly-futuro', bytes: valid, runlyMin: '99.0.0' },
    { type: 'automation', resourceKey: 'automation.datos-personales', bytes: personal },
    { type: 'automation', resourceKey: 'automation.host-prohibido', bytes: http },
    { type: 'automation', resourceKey: 'automation.version-nueva', bytes: newer },
    { type: 'automation', resourceKey: 'automation.grande', bytes: big, served: big, sha256: sha(Buffer.from('pequeña')), size: 1000 },
  ]
  clock += 3_600_000
  const negative = vectorFeed(items)
  await serveFeed(negative, Object.fromEntries(items.map((item) => [item.sha256 ?? sha(item.bytes), item.served ?? item.bytes]))); lastSigned = negative.signed
  const at = (key) => ref(negative.signed.entries.find((e) => e.resourceKey === key))
  assert.equal(unpack(await owner.studio.marketplaceTemplates({}, owner.token)).catalog.sequence, negative.signed.sequence)
  const fontError = await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...at('studio.fuente-desconocida'), target: 'personal', name: 'x' }, owner.token), { status: 422, code: 'STUDIO_PACKAGE_BLOCKED' })
  assert.equal(fontError.details.details.diagnostics.errors[0].code, 'font_unavailable')
  const licenseError = await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...at('studio.licencia-prohibida'), target: 'personal', name: 'x' }, owner.token), { status: 422, code: 'STUDIO_PACKAGE_BLOCKED' })
  assert.equal(licenseError.details.details.diagnostics.errors[0].code, 'license_forbidden')
  assert.equal(unpack(await owner.studio.inspectMarketplaceTemplate(at('studio.fuente-desconocida'), owner.token)).diagnostics.ok, false)
  await rejects(owner.studio.prepareMarketplaceTemplateImport({ ...at('studio.alterada'), target: 'personal', name: 'x' }, owner.token), { status: 502, code: 'RESOURCE_PACKAGE_MISMATCH' })
  await rejects(owner.studio.inspectMarketplaceTemplate(at('studio.no-confiable'), owner.token), { status: 409, code: 'RESOURCE_KEY_UNTRUSTED' })
  await rejects(owner.studio.inspectMarketplaceTemplate(at('studio.runly-futuro'), owner.token), { status: 409, code: 'RESOURCE_RUNLY_VERSION' })
  await rejects(owner.studio.inspectMarketplaceTemplate({ ...at('studio.fuente-desconocida'), releaseId: randomUUID() }, owner.token), { status: 409, code: 'MARKETPLACE_RELEASE_MISMATCH' })
  await rejects(owner.auto.inspectMarketplaceAutomation(at('studio.fuente-desconocida'), owner.token), { status: 409, code: 'MARKETPLACE_TYPE_MISMATCH' })
  ok('Studio blocks: unknown font, non-redistributable license (structured E1b diagnostics), altered bytes, untrusted release key, incompatible Runly version, wrong release id or type')

  const personalPrep = unpack(await owner.auto.prepareMarketplaceAutomationImport(at('automation.datos-personales'), owner.token))
  assert.equal(personalPrep.report.removed.people, 1); assert.equal(personalPrep.report.removed.externalEmails, 1); assert.equal(personalPrep.report.fileRisk.externalEmailCount, 1)
  assert.ok(!JSON.stringify(personalPrep.definition).includes(users[2].id) && !JSON.stringify(personalPrep.definition).includes('cliente@externo.example'))
  assert.ok(personalPrep.report.needsConfiguration.length >= 1)
  const personalDone = unpack(await owner.auto.confirmMarketplaceAutomationImport(personalPrep.id, { definitionDigest: personalPrep.definitionDigest, services: personalPrep.services, acceptRisks: true }, owner.token))
  const [stored] = await q('SELECT enabled, definition FROM system_automation WHERE id=$1', [personalDone.id])
  assert.equal(stored.enabled, false); assert.ok(!JSON.stringify(stored.definition).includes(users[2].id) && !JSON.stringify(stored.definition).includes('cliente@externo.example'))
  const hostError = await rejects(owner.auto.prepareMarketplaceAutomationImport(at('automation.host-prohibido'), owner.token), { status: 422, code: 'AUTOMATION_IMPORT_BLOCKED' })
  assert.equal(hostError.details.details.report.errors[0].code, 'AUTOMATION_HTTP_HOST_NOT_ALLOWED')
  await q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('automation_http_hosts','["api.externo.example"]',now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`)
  const hostPrep = unpack(await owner.auto.prepareMarketplaceAutomationImport(at('automation.host-prohibido'), owner.token))
  await q(`UPDATE instance_config SET value='[]' WHERE key='automation_http_hosts'`)
  await rejects(owner.auto.confirmMarketplaceAutomationImport(hostPrep.id, { definitionDigest: hostPrep.definitionDigest, services: hostPrep.services, acceptRisks: true }, owner.token), { status: 409, code: 'AUTOMATION_IMPORT_BLOCKED' })
  const newerError = await rejects(owner.auto.prepareMarketplaceAutomationImport(at('automation.version-nueva'), owner.token), { status: 422, code: 'AUTOMATION_IMPORT_BLOCKED' })
  assert.equal(newerError.details.details.report.errors[0].code, 'file_version_newer')
  await rejects(owner.auto.inspectMarketplaceAutomation(at('automation.grande'), owner.token), { status: 502, code: 'RESOURCE_PACKAGE_MISMATCH' })
  assert.equal((await q('SELECT count(*) n FROM system_automation WHERE enabled')).at(0).n, '0')
  ok('Automation: people and external recipients removed before storage and reported, stays paused; HTTP host outside the allowlist blocks at prepare and again at confirm; newer file version and a >200 KiB file are refused')

  // ================= Trust state persists =================
  await q(`INSERT INTO instance_config(key,value,updated_at) VALUES ($1,$2,now())`, [RESOURCE_CONFIG_KEYS.revokedKeyIds, JSON.stringify([VECTOR.keyId])])
  const restarted = makeCatalog()
  assert.equal((await restarted.status()).verified, false)
  await rejects(owner.studio.inspectMarketplaceTemplate(at('studio.fuente-desconocida'), owner.token), { status: 503, code: 'RESOURCE_FEED_UNAVAILABLE' })
  ok('A key revoked locally is persisted in the instance and, after a restart, the copy it signed is no longer trusted for import')

  assert.equal((await q("SELECT has_table_privilege('authenticated','marketplace_automation_import','SELECT') ok"))[0].ok, false)
  passed = true
} finally {
  interchange?.close(); server?.closeAllConnections?.()
  if (server) await new Promise((r) => server.close(r))
  await prisma?.$disconnect().catch(() => {})
  await stack.close()
  await mkdir(resolve('.artifacts/marketplace'), { recursive: true })
  await writeFile(resolve('.artifacts/marketplace/e3a-result.json'), JSON.stringify({ passed, checks }, null, 2))
  console.log(`${passed ? 'PASSED' : 'FAILED'} ${checks.length} checks`)
}
