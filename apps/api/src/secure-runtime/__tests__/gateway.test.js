import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createHostSigner } from '../protocol.js'
import { createCapabilityGateway } from '../gateway/gateway.js'
import { createMemoryStore } from '../gateway/stores.js'
import { loadDeclarativeModule } from '../declarative/schema.js'
import { toBlueprints } from '../declarative/runtime.js'

const RAW = JSON.parse(readFileSync(new URL('../fixtures/solicitudes/module.json', import.meta.url), 'utf8'))
const DEF = loadDeclarativeModule(RAW)
const P = DEF.permissions
const A = randomUUID(), B = randomUUID(), userA = randomUUID(), userB = randomUUID(), approverA = randomUUID()
const contactA = randomUUID(), contactB = randomUUID(), fileA = randomUUID(), fileB = randomUUID()
const ALL = Object.values(P)

function setup({ limits, store: custom } = {}) {
  let clock = 1_000_000
  const signer = createHostSigner({ now: () => clock })
  const store = custom ?? createMemoryStore({
    contacts: [{ id: contactA, companyId: A, name: 'Proveedor A' }, { id: contactB, companyId: B, name: 'Proveedor B' }],
    members: [{ companyId: A, userId: userA }, { companyId: A, userId: approverA }, { companyId: B, userId: userB }],
  })
  const files = { describe: async ({ companyId, ids }) => [{ id: fileA, companyId: A, mimeType: 'application/pdf' }, { id: fileB, companyId: B, mimeType: 'image/png' }].filter((f) => f.companyId === companyId && ids.includes(f.id)) }
  const gateway = createCapabilityGateway({ signer, store, services: { files }, limits, now: () => clock })
  gateway.register(DEF, { approvedCapabilities: DEF.capabilities, packageHash: 'hash-1' })
  const token = (companyId, profileId, perms = ALL, caps = DEF.capabilities) => gateway.issueCallToken({ moduleKey: DEF.key, companyId, profileId, permissionSet: new Set(perms), capabilities: caps })
  const call = (tok, operation, args, extra = {}) => gateway.call({ operation, token: tok, nonce: randomUUID().replaceAll('-', ''), idempotencyKey: randomUUID().replaceAll('-', ''), args, ...extra })
  return { gateway, store, signer, token, call, tick: (ms) => { clock += ms } }
}
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code || assert.fail(`expected ${code}, got ${e.code}: ${e.message}`))
const newRequest = (call, tok, extra = {}) => call(tok, 'records.create', { entity: 'solicitud', data: { titulo: 'Laptops', monto: 25000, proveedor: contactA, solicitante: userA, ...extra } })

test('the fixture loads; dangerous or malformed definitions are rejected', () => {
  assert.equal(DEF.entities[0].key, 'solicitud')
  const clone = () => structuredClone(RAW)
  const bad = [
    (d) => { d.entities[0].validations[0].rule = { op: 'eval', args: [{ value: 'process.exit()' }] } },
    (d) => { d.entities[0].validations[0].rule = { op: 'gt', args: [{ field: 'constructor' }, { value: 1 }] } },
    (d) => { let n = { value: true }; for (let i = 0; i < 12; i++) n = { op: 'not', args: [n] }; d.entities[0].validations[0].rule = n },
    (d) => { d.entities[0].fields[0].onLoad = 'alert(1)' },
    (d) => { d.extensions.backend[0].handler = '../../etc/passwd' },
    (d) => { d.extensions.backend[0].capabilities = ['records.read', 'secrets.get'] },
    (d) => { d.entities[0].states.transitions[1].permission = 'root' },
  ]
  for (const mutate of bad) { const d = clone(); mutate(d); assert.throws(() => loadDeclarativeModule(d), (e) => e.code === 'DECLARATIVE_DEFINITION_INVALID') }
})

test('declarative views map to native Runly UI blueprints', () => {
  const bp = toBlueprints(DEF, DEF.entities[0])
  assert.deepEqual(bp.table.columns.map((c) => c.key), ['titulo', 'monto', 'proveedor', 'estado'])
  assert.equal(bp.form.sections[0].fields.find((f) => f.key === 'proveedor').relation.target, 'runly.contacts:contact')
  assert.deepEqual(bp.detail.actions.map((a) => a.key), ['enviar', 'aprobar', 'rechazar'])
})

test('two companies: records, relations and files never cross tenants', async () => {
  const { token, call } = setup()
  const tA = token(A, userA), tB = token(B, userB)
  const created = (await newRequest(call, tA)).data
  assert.equal(created.data.estado, 'borrador')
  assert.equal((await call(tB, 'records.list', { entity: 'solicitud' })).data.length, 0)
  await rejects(call(tB, 'records.get', { entity: 'solicitud', id: created.id }), 'NOT_FOUND')
  await rejects(call(tB, 'records.update', { entity: 'solicitud', id: created.id, data: { titulo: 'Robado' } }), 'NOT_FOUND')
  assert.deepEqual((await call(tA, 'relations.resolve', { entity: 'solicitud', field: 'proveedor', ids: [contactA, contactB] })).data, [{ id: contactA, label: 'Proveedor A' }])
  assert.deepEqual((await call(tA, 'files.describe', { ids: [fileA, fileB] })).data.map((f) => f.id), [fileA])
  await rejects(call(tA, 'files.attach', { entity: 'solicitud', id: created.id, fileId: fileB }), 'NOT_FOUND')
  assert.equal((await call(tA, 'files.attach', { entity: 'solicitud', id: created.id, fileId: fileA })).data.attachments[0].fileId, fileA)
})

test('the module cannot choose tenant, identity, permissions or capabilities', async () => {
  const { token, call, signer } = setup()
  const tA = token(A, userA)
  await rejects(call(tA, 'records.list', { entity: 'solicitud', companyId: B }), 'INVALID_ARGS')
  await rejects(newRequest(call, tA, { estado: 'aprobada' }), 'STATE_READ_ONLY')
  const [payload, sig] = tA.split('.')
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), cid: B })).toString('base64url')
  await rejects(call(`${forged}.${sig}`, 'records.list', { entity: 'solicitud' }), 'CONTEXT_INVALID')
  const otherHost = createHostSigner()
  await rejects(call(otherHost.issue({ mod: DEF.key, pkg: 'hash-1', gv: 1, cid: A, uid: userA, perms: Object.values(P), caps: DEF.capabilities }), 'records.list', { entity: 'solicitud' }), 'CONTEXT_INVALID')
  await rejects(call(token(A, userA, ALL, ['records.read']), 'records.create', { entity: 'solicitud', data: { titulo: 'X', solicitante: userA } }), 'CAPABILITY_DENIED')
  await rejects(call(signer.issue({ mod: DEF.key, pkg: 'hash-2', gv: 1, cid: A, uid: userA, perms: ALL, caps: DEF.capabilities }), 'records.list', { entity: 'solicitud' }), 'MODULE_REVOKED')
})

test('replay, idempotency and expiry', async () => {
  const { token, call, store, tick } = setup()
  const tA = token(A, userA)
  await call(tA, 'records.list', { entity: 'solicitud' }, { nonce: 'n'.repeat(20) })
  await rejects(call(tA, 'records.list', { entity: 'solicitud' }, { nonce: 'n'.repeat(20) }), 'REPLAYED_CALL')
  const key = 'idem-key-0001'
  const first = await newRequest((t, op, args) => call(t, op, args, { idempotencyKey: key }), tA)
  const second = await newRequest((t, op, args) => call(t, op, args, { idempotencyKey: key }), tA)
  assert.equal(first.data.id, second.data.id)
  assert.equal(store.records.size, 1)
  await rejects(call(tA, 'records.create', { entity: 'solicitud', data: { titulo: 'Sin clave', solicitante: userA } }, { idempotencyKey: null }), 'IDEMPOTENCY_KEY_REQUIRED')
  tick(61_000)
  await rejects(call(tA, 'records.list', { entity: 'solicitud' }), 'CONTEXT_EXPIRED')
})

test('per-operation permissions, transition rules, automation effects and audit', async () => {
  const { token, call, store } = setup()
  const requester = token(A, userA, [P.read, P.create, P.update])
  const approver = token(A, approverA, ALL)
  const created = (await newRequest(call, requester)).data
  await rejects(call(requester, 'records.transition', { entity: 'solicitud', id: created.id, action: 'aprobar' }), 'PERMISSION_DENIED')
  await rejects(call(approver, 'records.transition', { entity: 'solicitud', id: created.id, action: 'aprobar' }), 'TRANSITION_NOT_ALLOWED')
  await call(requester, 'records.transition', { entity: 'solicitud', id: created.id, action: 'enviar' })
  const approved = (await call(approver, 'records.transition', { entity: 'solicitud', id: created.id, action: 'aprobar' })).data
  assert.equal(approved.record.data.estado, 'aprobada')
  assert.equal(approved.record.data.resolucion, 'Aprobada: Laptops')
  assert.deepEqual(store.notifications, [{ companyId: A, userId: userA, title: 'Tu solicitud fue aprobada', body: null }])
  assert.equal(store.events[0].event, 'ref_solicitudes.solicitud.aprobada')
  await rejects(call(token(A, userA, [P.read]), 'records.create', { entity: 'solicitud', data: { titulo: 'X', solicitante: userA } }), 'PERMISSION_DENIED')
  await rejects(call(approver, 'notifications.publish', { to: [userB], title: 'Hola' }), 'PERMISSION_DENIED')
  await rejects(call(approver, 'events.emit', { event: 'otro.evento' }), 'INVALID_ARGS')
  await rejects(newRequest(call, requester, { monto: 2_000_000 }), 'FIELD_INVALID')
  assert.ok(store.audits.some((a) => a.action === 'runtime.records.transition' && a.companyId === A))
  assert.ok(store.audits.some((a) => a.action === 'runtime.denied.records.transition'))
})

test('revocation, quotas and timeouts', async () => {
  const s = setup({ limits: { callsPerMinute: 5 } })
  const tA = s.token(A, userA)
  for (let i = 0; i < 5; i++) await s.call(tA, 'records.list', { entity: 'solicitud' })
  await rejects(s.call(tA, 'records.list', { entity: 'solicitud' }), 'QUOTA_EXCEEDED')
  assert.equal((await s.call(s.token(B, userB), 'records.list', { entity: 'solicitud' })).data.length, 0, 'the quota is per company')
  const issuedBefore = s.token(B, userB)
  s.gateway.revoke(DEF.key)
  await rejects(s.call(issuedBefore, 'records.list', { entity: 'solicitud' }), 'MODULE_REVOKED')
  assert.throws(() => s.token(B, userB), (e) => e.code === 'MODULE_REVOKED')
  const slowStore = { ...createMemoryStore(), listRecords: () => new Promise((resolve) => setTimeout(() => resolve([]), 200)), audit: async () => {} }
  const slow = setup({ limits: { timeoutMs: 50 }, store: slowStore })
  await rejects(slow.call(slow.token(A, userA), 'records.list', { entity: 'solicitud' }), 'CAPABILITY_TIMEOUT')
})

test('the owner approval narrows capabilities even when the module declares them', async () => {
  const { gateway, call } = setup()
  gateway.register(DEF, { approvedCapabilities: ['records.read'], packageHash: 'hash-1' })
  const tok = gateway.issueCallToken({ moduleKey: DEF.key, companyId: A, profileId: userA, permissionSet: new Set(ALL), capabilities: DEF.capabilities })
  assert.equal((await call(tok, 'records.list', { entity: 'solicitud' })).data.length, 0)
  await rejects(call(tok, 'records.create', { entity: 'solicitud', data: { titulo: 'X', solicitante: userA } }), 'CAPABILITY_DENIED')
})
