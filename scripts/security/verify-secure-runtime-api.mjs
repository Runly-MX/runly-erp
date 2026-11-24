#!/usr/bin/env node
// F1B Stage 3: the integrated gateway in the REAL API (flag on), on a
// disposable Supabase, with the separate supervisor running jobs in Docker.
//   node scripts/security/verify-secure-runtime-api.mjs [--keep]
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { appendFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootSecurityStack, checks } from './lib/disposable-stack.mjs'
import { createSupervisor } from '../../apps/supervisor/src/supervisor.js'
import { unusedPort } from '../fixtures/studio/supabase-stack.mjs'

const KEY = 'custom.ref_solicitudes'
const base = await mkdtemp(resolve('.tmp-secure-runtime-api-'))
const modulesDir = join(base, 'modules'), stateDir = join(base, 'supervisor')
await cp(resolve('apps/api/src/secure-runtime/fixtures/solicitudes'), join(modulesDir, KEY), { recursive: true })
const secret = randomBytes(32).toString('hex')
const gatewayPort = await unusedPort(), supervisorPort = await unusedPort()
Object.assign(process.env, {
  RUNLY_SECURE_RUNTIME: 'experimental', RUNLY_SECURE_RUNTIME_MODULES_DIR: modulesDir,
  RUNLY_SECURE_RUNTIME_FRAME_ANCESTORS: 'http://127.0.0.1:5173', RUNLY_GATEWAY_BIND: `0.0.0.0:${gatewayPort}`,
  RUNLY_SUPERVISOR_URL: `http://127.0.0.1:${supervisorPort}`, RUNLY_SUPERVISOR_SECRET: secret,
})
const supervisor = await createSupervisor({ secret, modulesDir, stateDir, gatewayPort, gatewayHost: 'host.docker.internal' })
await supervisor.listen(supervisorPort)
const s = await bootSecurityStack({
  // Operator approval of the reviewed declarative package (module-trust.mjs), before the API starts.
  beforeApi: async ({ dbUrl }) => { await promisify(execFile)(process.execPath, ['scripts/security/module-trust.mjs', 'approve', KEY, '--reviewed'], { env: { ...process.env, DIRECT_URL: dbUrl, RUNLY_MODULES_DIR: modulesDir } }) },
}).catch(async (error) => { await supervisor.close(); await rm(base, { recursive: true, force: true }); throw error })
const { check, report } = checks()
try {
  const adminRole = await s.adminRole()
  const A = await s.createCompany('Empresa A'), B = await s.createCompany('Empresa B')
  const adminA = await s.createUser('admin-a@example.com', 'Prueba-Rt-1', [[A, adminRole]])
  const both = await s.createUser('ambas@example.com', 'Prueba-Rt-2', [[A, adminRole], [B, adminRole]])
  const owner = await s.createUser('owner@example.com', 'Prueba-Rt-3', [[B, adminRole]])
  await s.q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('platform_owner_profile_id',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1`, [owner.id])
  const tA = await s.login(adminA), tBoth = await s.login(both), tOwner = await s.login(owner)
  const call = (token, companyId, operation, args, headers = {}) => fetch(`${s.urls.api}/secure-runtime/v1/modules/${KEY}/call`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': companyId, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ operation, args }) }).then(async (r) => ({ status: r.status, body: await r.json() }))
  const grant = (token, companyId, capabilities) => s.client(token, companyId)('PUT', `/secure-runtime/v1/modules/${KEY}/grants`, { capabilities })
  const all = ['records.read', 'records.write', 'relations.resolve', 'files.describe', 'files.attach', 'notifications.publish', 'events.emit']

  await check('deny by default: no capability before the owner grants it', async () => {
    const r = await call(tA, A, 'records.list', { entity: 'solicitud' })
    assert.equal(r.status, 403); assert.equal(r.body.error, 'CAPABILITY_DENIED')
  })
  await check('a company admin cannot grant capabilities; the platform owner can', async () => {
    assert.equal((await grant(tA, A, all)).status, 403)
    assert.equal((await grant(tOwner, B, all)).status, 200)
  })
  let created
  await check('company A creates and approves through the API; tenant and user come from the session', async () => {
    const r = await call(tA, A, 'records.create', { entity: 'solicitud', data: { titulo: 'Laptops', monto: 9000, solicitante: adminA.id } })
    assert.equal(r.status, 200, JSON.stringify(r.body)); created = r.body.data
    assert.equal((await call(tA, A, 'records.create', { entity: 'solicitud', companyId: B, data: { titulo: 'x', solicitante: adminA.id } })).body.error, 'INVALID_ARGS')
    await call(tA, A, 'records.transition', { entity: 'solicitud', id: created.id, action: 'enviar' })
    assert.equal((await call(tA, A, 'records.transition', { entity: 'solicitud', id: created.id, action: 'aprobar' })).body.data.record.data.estado, 'aprobada')
    assert.equal((await s.q(`SELECT count(*)::int AS n FROM notification WHERE user_id=$1 AND company_id=$2 AND source_type=$3`, [adminA.id, A, KEY])).rows[0].n, 1)
  })
  await check('two companies, and a user who switches company mid-session, never cross data', async () => {
    assert.equal((await call(tBoth, B, 'records.list', { entity: 'solicitud' })).body.data.length, 0)
    assert.equal((await call(tBoth, A, 'records.list', { entity: 'solicitud' })).body.data.length, 1)
    assert.equal((await call(tBoth, B, 'records.get', { entity: 'solicitud', id: created.id })).body.error, 'NOT_FOUND')
    assert.equal((await call(tA, B, 'records.list', { entity: 'solicitud' })).status >= 400, true, 'not a member of B')
  })
  await check('idempotent writes: the same Idempotency-Key does not duplicate', async () => {
    const key = 'stage3-idem-0001'
    const one = await call(tA, A, 'records.create', { entity: 'solicitud', data: { titulo: 'Sillas', solicitante: adminA.id } }, { 'Idempotency-Key': key })
    const two = await call(tA, A, 'records.create', { entity: 'solicitud', data: { titulo: 'Sillas', solicitante: adminA.id } }, { 'Idempotency-Key': key })
    assert.equal(one.body.data.id, two.body.data.id)
  })
  await check('backend extension runs through the separate supervisor in an isolated container', async () => {
    const r = await s.client(tA, A)('POST', `/secure-runtime/v1/modules/${KEY}/extensions/resumen/run`, {})
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.data.total, 2); assert.equal(r.body.data.montoAprobado, 9000)
    const rb = await s.client(tBoth, B)('POST', `/secure-runtime/v1/modules/${KEY}/extensions/resumen/run`, {})
    assert.equal(rb.body.data.total, 0)
  })
  await check('frame route serves the component with sandbox CSP and no credentials', async () => {
    const res = await fetch(`${s.urls.api}/secure-runtime/v1/frames/${KEY}/panel`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-security-policy'), /sandbox allow-scripts/)
    assert.match(res.headers.get('content-security-policy'), /connect-src 'none'/)
  })
  await check('revocation is immediate for calls and extensions', async () => {
    assert.equal((await grant(tOwner, B, [])).status, 200)
    assert.equal((await call(tA, A, 'records.list', { entity: 'solicitud' })).body.error, 'CAPABILITY_DENIED')
    const r = await s.client(tA, A)('POST', `/secure-runtime/v1/modules/${KEY}/extensions/resumen/run`, {})
    assert.ok(r.status >= 400)
    assert.equal((await grant(tOwner, B, all)).status, 200)
  })
  await check('a tampered package stops being available (no fallback)', async () => {
    await appendFile(join(modulesDir, KEY, 'module.json'), '\n')
    const r = await call(tA, A, 'records.list', { entity: 'solicitud' })
    assert.equal(r.status, 404); assert.equal(r.body.error, 'MODULE_NOT_AVAILABLE')
  })
  await check('errors are normalized and leak no internals', async () => {
    const r = await call(tA, A, 'records.nonexistent', {})
    assert.deepEqual(Object.keys(r.body).sort(), ['error', 'message'])
    assert.ok(!/stack|prisma|postgres|at \w+ \(/i.test(JSON.stringify(r.body)))
  })
} finally {
  report()
  await s.close()
  await supervisor.close()
  await rm(base, { recursive: true, force: true })
}
