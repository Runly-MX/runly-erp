import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createHostSigner } from '../protocol.js'
import { createCapabilityGateway } from '../gateway/gateway.js'
import { createMemoryStore } from '../gateway/stores.js'
import { loadDeclarativeModule } from '../declarative/schema.js'

const RAW = JSON.parse(readFileSync(new URL('../fixtures/solicitudes/module.json', import.meta.url), 'utf8'))
RAW.permissions.delete = 'ref_solicitudes.solicitud.delete'
RAW.entities[0].fields.push({ key: 'colaborador', type: 'relation', label: 'Colaborador', target: 'external:hr_employee' }, { key: 'activo', type: 'relation', label: 'Activo', target: 'external:inventory_item' })
const DEF = loadDeclarativeModule(RAW)
const A = randomUUID(), B = randomUUID(), userA = randomUUID(), userB = randomUUID()
const ALL = Object.values(DEF.permissions)
const emp = { A: randomUUID(), B: randomUUID(), gone: randomUUID() }

// A relation provider that applies the rules the real catalog applies: company scope,
// the user's own permission, module enabled, deleted rows hidden, only id/label/subtitle out.
function fakeRelations({ allowed = new Set(['hr_employee', 'inventory_item', 'contact']), enabled = true } = {}) {
  const rows = [
    { type: 'hr_employee', companyId: A, id: emp.A, title: 'Ana', subtitle: 'Jefa', salary: 99999 },
    { type: 'hr_employee', companyId: B, id: emp.B, title: 'Beto', subtitle: null },
    { type: 'hr_employee', companyId: A, id: emp.gone, title: 'Baja', deleted: true },
  ]
  const guard = ({ type, profileId }) => {
    if (!enabled) throw Object.assign(new Error('off'), { code: 'RELATION_TARGET_UNAVAILABLE' })
    if (!allowed.has(type) || profileId !== userA) throw Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' })
  }
  const out = (r) => ({ id: r.id, label: r.title, subtitle: r.subtitle ?? null })
  return {
    resolve: async (i) => { guard(i); return rows.filter((r) => r.type === i.type && r.companyId === i.companyId && !r.deleted && i.ids.includes(r.id)).map(out) },
    search: async (i) => { guard(i); return rows.filter((r) => r.type === i.type && r.companyId === i.companyId && !r.deleted && r.title.toLowerCase().includes(i.q.toLowerCase())).slice(0, i.limit).map(out) },
  }
}

function setup({ relations = fakeRelations(), activity = null } = {}) {
  const signer = createHostSigner()
  const store = createMemoryStore({ members: [{ companyId: A, userId: userA }] })
  const gateway = createCapabilityGateway({ signer, store, services: { relations, activity } })
  gateway.register(DEF, { approvedCapabilities: DEF.capabilities, packageHash: 'rev-1' })
  const token = (cid, uid, perms = ALL) => gateway.issueCallToken({ moduleKey: DEF.key, companyId: cid, profileId: uid, permissionSet: new Set(perms), capabilities: DEF.capabilities })
  const call = (tok, operation, args) => gateway.call({ operation, token: tok, nonce: randomUUID().replaceAll('-', ''), idempotencyKey: randomUUID().replaceAll('-', ''), args })
  return { gateway, store, token, call }
}
const create = async (call, tok) => (await call(tok, 'records.create', { entity: 'solicitud', data: { titulo: 'Laptops', monto: 100, solicitante: userA } })).data

test('soft delete hides the record, keeps the row, restores, and needs its own permission', async () => {
  const { call, token, store } = setup()
  const tok = token(A, userA)
  const rec = await create(call, tok)
  await assert.rejects(call(token(A, userA, ALL.filter((p) => !p.endsWith('.delete'))), 'records.delete', { entity: 'solicitud', id: rec.id }), (e) => e.code === 'PERMISSION_DENIED')
  assert.deepEqual((await call(tok, 'records.delete', { entity: 'solicitud', id: rec.id, expectedVersion: rec.version })).data, { id: rec.id, deleted: true })
  await assert.rejects(call(tok, 'records.get', { entity: 'solicitud', id: rec.id }), (e) => e.code === 'NOT_FOUND')
  assert.equal((await call(tok, 'records.list', { entity: 'solicitud' })).data.length, 0)
  assert.ok(store.records.has(rec.id), 'the row is never removed')
  await assert.rejects(call(tok, 'records.delete', { entity: 'solicitud', id: rec.id }), (e) => e.code === 'NOT_FOUND')
  const restored = (await call(tok, 'records.restore', { entity: 'solicitud', id: rec.id })).data
  assert.equal(restored.id, rec.id)
  assert.equal((await call(tok, 'records.list', { entity: 'solicitud' })).data.length, 1)
  await assert.rejects(call(tok, 'records.restore', { entity: 'solicitud', id: rec.id }), (e) => e.code === 'NOT_FOUND')
})

test('delete and restore do not cross companies, and a stale version is a conflict', async () => {
  const { call, token } = setup()
  const rec = await create(call, token(A, userA))
  await assert.rejects(call(token(B, userB), 'records.delete', { entity: 'solicitud', id: rec.id }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(call(token(A, userA), 'records.delete', { entity: 'solicitud', id: rec.id, expectedVersion: 999 }), (e) => e.code === 'VERSION_CONFLICT')
  await call(token(A, userA), 'records.delete', { entity: 'solicitud', id: rec.id })
  await assert.rejects(call(token(B, userB), 'records.restore', { entity: 'solicitud', id: rec.id }), (e) => e.code === 'NOT_FOUND')
})

test('external relations: one contract, company scope, deleted rows and visible fields', async () => {
  const { call, token } = setup()
  const tok = token(A, userA)
  const resolved = (await call(tok, 'relations.resolve', { entity: 'solicitud', field: 'colaborador', ids: [emp.A, emp.B, emp.gone] })).data
  assert.deepEqual(resolved, [{ id: emp.A, label: 'Ana', subtitle: 'Jefa' }], 'other company and deleted rows do not resolve; only id, label and subtitle leave')
  const found = (await call(tok, 'relations.search', { entity: 'solicitud', field: 'colaborador', q: 'a', limit: 5 })).data
  assert.deepEqual(found.map((r) => r.id), [emp.A])
  await assert.rejects(call(tok, 'relations.search', { entity: 'solicitud', field: 'titulo', q: '' }), (e) => e.code === 'INVALID_ARGS')
  await assert.rejects(call(tok, 'relations.search', { entity: 'solicitud', field: 'colaborador', q: 'a', limit: 500 }), (e) => e.code === 'INVALID_ARGS')
  await assert.rejects(call(token(A, userA, ALL.filter((p) => !p.endsWith('.read'))), 'relations.resolve', { entity: 'solicitud', field: 'colaborador', ids: [emp.A] }), (e) => e.code === 'PERMISSION_DENIED')
})

test('a target the user cannot see, or a disabled target module, is refused', async () => {
  const denied = setup({ relations: fakeRelations({ allowed: new Set(['contact']) }) })
  await assert.rejects(denied.call(denied.token(A, userA), 'relations.resolve', { entity: 'solicitud', field: 'activo', ids: [randomUUID()] }), (e) => e.status >= 400)
  const off = setup({ relations: fakeRelations({ enabled: false }) })
  await assert.rejects(off.call(off.token(A, userA), 'relations.search', { entity: 'solicitud', field: 'colaborador', q: '' }), (e) => e.status >= 400)
})

test('audit records identity, result, revision and correlation, and the module cannot forge it', async () => {
  const published = []
  const { call, token, store } = setup({ activity: { publish: async (i) => { published.push(i) } } })
  const tok = token(A, userA)
  const evil = 'MODULE-CONTROLLED-TEXT-0123456789'
  const rec = (await call(tok, 'records.create', { entity: 'solicitud', data: { titulo: evil, monto: 1, solicitante: userA } })).data
  await assert.rejects(call(token(A, userA, []), 'records.update', { entity: 'solicitud', id: rec.id, data: { titulo: 'z' } }), (e) => e.code === 'PERMISSION_DENIED' && /^[0-9a-f-]{36}$/.test(e.correlationId))
  const ok = store.audits.find((a) => a.action === 'runtime.records.create')
  const denied = store.audits.find((a) => a.action === 'runtime.denied.records.update')
  for (const a of [ok, denied]) {
    assert.equal(a.companyId, A); assert.equal(a.actorId, userA); assert.equal(a.moduleKey, DEF.key)
    assert.equal(a.details.moduleRevision, 'rev-1'); assert.ok(Date.parse(a.details.at)); assert.match(a.details.correlationId, /^[0-9a-f-]{36}$/)
  }
  assert.equal(ok.details.result, 'ok'); assert.equal(denied.details.result, 'denied'); assert.equal(denied.details.reason, 'PERMISSION_DENIED')
  assert.ok(!JSON.stringify(store.audits).includes(evil), 'record data never enters the audit')
  assert.ok(!/token|secret|nonce/i.test(JSON.stringify(store.audits)))
  assert.deepEqual(published.map((p) => p.type), [`module.${DEF.key}.solicitud.create`])
  assert.equal(published[0].actorId, userA); assert.equal(published[0].companyId, A)
  assert.ok(!JSON.stringify(published).includes(evil), 'activity text is composed by the host')
})

test('a failing activity feed never fails the operation and is itself audited', async () => {
  const { call, token, store } = setup({ activity: { publish: async () => { throw new Error('boom') } } })
  await create(call, token(A, userA))
  assert.ok(store.audits.some((a) => a.action === 'runtime.activity_failed'))
})
