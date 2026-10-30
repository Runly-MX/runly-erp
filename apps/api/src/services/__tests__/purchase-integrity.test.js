import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createPurchasesRouter } from '../../routes/purchases/index.js'
import { PURCHASE_PRESETS } from '../purchases-service.js'
import { assertFresh, guardedUpdate } from '../purchases-shared.js'

const COMPANY = '11111111-1111-7111-8111-111111111111'
const OTHER = '99999999-9999-7999-8999-999999999999'
const PROFILE = '22222222-2222-7222-8222-222222222222'
const STAMP = new Date('2026-10-01T10:00:00.000Z')

function appWith(prisma) {
  const requirePermission = () => async (c, next) => {
    c.set('companyId', COMPANY)
    c.set('userId', PROFILE)
    c.set('userContext', { profile: { id: PROFILE }, isAdmin: true, permissionSet: new Set() })
    await next()
  }
  const app = new Hono()
  app.route('/', createPurchasesRouter({ prisma, requirePermission }))
  return app
}

const json = (app, method, path, payload) => app.request(path, {
  method, headers: { 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}),
})

// Any model answers "nothing"; `tables` overrides specific methods.
function fakePrisma(preset, tables = {}, capabilities = {}) {
  const values = PURCHASE_PRESETS[preset]
  const workflow = { id: 'w1', companyId: COMPANY, preset, isDefault: true, enabled: true, ...values, capabilities: { ...values.capabilities, ...capabilities } }
  const base = {
    purchaseWorkflow: { findFirst: async () => workflow },
    auditLog: { create: async ({ data }) => data },
  }
  const empty = { findMany: async () => [], findFirst: async () => null, count: async () => 0, updateMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 0 }) }
  const prisma = new Proxy({ ...base, ...tables }, {
    get(target, key) {
      if (key in target) return target[key]
      if (key === '$transaction') return callback => callback(prisma)
      if (typeof key === 'string' && !key.startsWith('$')) return empty
      return undefined
    },
  })
  return prisma
}

test('assertFresh y guardedUpdate rechazan versiones viejas', async () => {
  const doc = { id: 'o1', companyId: COMPANY, status: 'DRAFT', updatedAt: STAMP }
  assert.doesNotThrow(() => assertFresh(doc, STAMP.toISOString()))
  assert.doesNotThrow(() => assertFresh(doc, undefined))
  assert.throws(() => assertFresh(doc, '2026-10-01T10:00:01.000Z'), error => error.code === 'STALE_DOCUMENT' && error.status === 409)

  let where = null
  const tx = { purchaseOrder: { updateMany: async args => { where = args.where; return { count: 0 } } } }
  await assert.rejects(guardedUpdate(tx, 'purchaseOrder', doc, { status: 'ISSUED' }), error => error.code === 'STALE_DOCUMENT')
  assert.deepEqual(where, { id: 'o1', companyId: COMPANY, status: 'DRAFT', updatedAt: { gte: STAMP, lt: new Date(STAMP.getTime() + 1) } })
})

test('un pago concurrente no se pierde: el segundo escritor recibe 409 STALE_DOCUMENT', async () => {
  const invoice = { id: 'i1', companyId: COMPANY, caseId: 'c1', status: 'PENDING', total: 100, paidAmount: 0, updatedAt: STAMP }
  let writes = 0
  const prisma = fakePrisma('BASIC', {
    // The case already has an issued order, so the BASIC policy allows paying.
    purchaseOrder: { findMany: async () => [{ id: 'o1', status: 'ISSUED', total: 100 }] },
    purchaseInvoice: {
      findFirst: async () => invoice,
      findMany: async () => [invoice],
      // Someone else already wrote: the guarded update matches no row.
      updateMany: async () => { writes += 1; return { count: 0 } },
    },
  }, { payments: true })
  const response = await json(appWith(prisma), 'POST', '/purchases/invoices/i1/transition', { action: 'pay', amount: 40 })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'STALE_DOCUMENT')
  assert.equal(writes, 1)
})

test('una versión esperada distinta se rechaza antes de escribir', async () => {
  const order = { id: 'o1', companyId: COMPANY, caseId: 'c1', status: 'DRAFT', total: 10, updatedAt: STAMP }
  let wrote = false
  const prisma = fakePrisma('BASIC', { purchaseOrder: { findFirst: async () => order, findMany: async () => [order], updateMany: async () => { wrote = true; return { count: 1 } } } })
  const response = await json(appWith(prisma), 'PATCH', '/purchases/orders/o1', { notes: 'x', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'STALE_DOCUMENT')
  assert.equal(wrote, false)
})

test('el motivo de cancelación queda en la auditoría', async () => {
  const order = { id: 'o1', companyId: COMPANY, caseId: null, status: 'DRAFT', total: 10, updatedAt: STAMP }
  const audits = []
  const prisma = fakePrisma('BASIC', {
    purchaseOrder: { findFirst: async () => order, updateMany: async () => ({ count: 1 }) },
    auditLog: { create: async ({ data }) => { audits.push(data); return data } },
  })
  const response = await json(appWith(prisma), 'POST', '/purchases/orders/o1/transition', { action: 'cancel', comment: 'Proveedor sin existencias' })
  assert.equal(response.status, 200)
  assert.deepEqual(audits.at(-1).metadata, { comment: 'Proveedor sin existencias' })
})

test('una aprobación ya resuelta por otra persona no se decide dos veces', async () => {
  const approval = { id: 'a1', companyId: COMPANY, caseId: 'c1', ownerType: 'PURCHASE_ORDER', ownerId: 'o1', status: 'PENDING' }
  const prisma = fakePrisma('COMPLETE', {
    purchaseApproval: { findFirst: async () => approval, updateMany: async ({ where }) => ({ count: where.status === 'PENDING' ? 0 : 1 }) },
  })
  const response = await json(appWith(prisma), 'POST', '/purchases/approvals/a1/decide', { decision: 'APPROVED' })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'INVALID_TRANSITION')
})

test('el detalle de una orden se lee aunque la capacidad esté apagada', async () => {
  const order = { id: 'o1', companyId: COMPANY, caseId: null, status: 'CLOSED', total: 10, issueDate: STAMP, updatedAt: STAMP }
  const prisma = fakePrisma('SIMPLE', { purchaseOrder: { findFirst: async () => order, findMany: async () => [] } })
  const app = appWith(prisma)
  const response = await app.request('/purchases/orders/o1')
  assert.equal(response.status, 200)
  const { data } = await response.json()
  assert.equal(data.id, 'o1')
  assert.equal(data.capabilityEnabled, false)
  const write = await json(app, 'POST', '/purchases/orders/o1/transition', { action: 'cancel' })
  assert.equal(write.status, 409)
  assert.equal((await write.json()).code, 'CAPABILITY_DISABLED')
})

function relationPrisma(relations, { items = [] } = {}) {
  const calls = { deleted: [], detached: [], audits: [] }
  const rows = [...relations]
  const matches = (row, where) => row.companyId === where.companyId
    && (!where.id || (where.id.in ? where.id.in.includes(row.id) : row.id === where.id))
    && (where.sourceRelationId === undefined || row.sourceRelationId === where.sourceRelationId)
  const prisma = fakePrisma('BASIC', {
    entityRelation: {
      findFirst: async ({ where }) => rows.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => rows.filter(row => matches(row, where)),
      deleteMany: async ({ where }) => {
        const hit = rows.filter(row => matches(row, where))
        for (const row of hit) { calls.deleted.push(row.id); rows.splice(rows.indexOf(row), 1) }
        return { count: hit.length }
      },
      updateMany: async ({ where, data }) => {
        const hit = rows.filter(row => matches(row, where))
        for (const row of hit) { Object.assign(row, data); calls.detached.push(row.id) }
        return { count: hit.length }
      },
    },
    invItem: { findMany: async () => items },
    auditLog: { create: async ({ data }) => { calls.audits.push(data); return data } },
  })
  return { prisma, calls }
}

const orderItem = { id: 'r-order', companyId: COMPANY, sourceModule: 'runly.purchases', sourceType: 'purchase_order', sourceId: 'o1', targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: 'item1', relationType: 'PURCHASED_IN', origin: 'MANUAL', sourceRelationId: null }
const inherited = { id: 'r-inh', companyId: COMPANY, sourceModule: 'runly.purchases', sourceType: 'purchase_invoice', sourceId: 'i1', targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: 'item1', relationType: 'INVOICED_ITEM', origin: 'INHERITED', sourceRelationId: 'r-order' }
const contains = { id: 'r-case', companyId: COMPANY, sourceModule: 'runly.purchases', sourceType: 'purchase_case', sourceId: 'c1', targetModule: 'runly.purchases', targetType: 'purchase_order', targetId: 'o1', relationType: 'CONTAINS', origin: 'AUTOMATIC', sourceRelationId: null }

test('la vista previa de impacto lista dependientes y relaciones protegidas', async () => {
  const { prisma } = relationPrisma([orderItem, inherited, contains], { items: [{ id: 'item1', name: 'Laptop', assetTag: 'A-1' }] })
  const app = appWith(prisma)
  const impact = (await (await app.request('/purchases/relations/r-order/impact')).json()).data
  assert.equal(impact.protected, false)
  assert.deepEqual(impact.dependents.map(row => [row.id, row.label]), [['r-inh', 'A-1']])
  assert.deepEqual(impact.dependentsModes, ['keep', 'remove'])
  const caseImpact = (await (await app.request('/purchases/relations/r-case/impact')).json()).data
  assert.equal(caseImpact.protected, true)
})

test('desvincular nunca borra dependientes en silencio y respeta las relaciones protegidas', async () => {
  const child = { ...inherited }
  const { prisma, calls } = relationPrisma([{ ...orderItem }, child, contains])
  const app = appWith(prisma)

  const blocked = await app.request('/purchases/relations/r-order', { method: 'DELETE' })
  assert.equal(blocked.status, 409)
  assert.equal((await blocked.json()).code, 'RELATION_HAS_DEPENDENTS')
  assert.deepEqual(calls.deleted, [])

  const structural = await app.request('/purchases/relations/r-case', { method: 'DELETE' })
  assert.equal(structural.status, 409)
  assert.equal((await structural.json()).code, 'RELATION_PROTECTED')

  const kept = await app.request('/purchases/relations/r-order?dependents=keep&reason=Equipo%20equivocado', { method: 'DELETE' })
  assert.equal(kept.status, 200)
  assert.deepEqual(calls.deleted, ['r-order'])
  assert.deepEqual(calls.detached, ['r-inh'])
  assert.equal(child.sourceRelationId, null)
  const audit = calls.audits.at(-1)
  assert.equal(audit.action, 'purchase.relation.deleted')
  assert.deepEqual(audit.metadata, { reason: 'Equipo equivocado', dependents: 'keep', dependentIds: ['r-inh'] })
})

test('desvincular con remove quita también los dependientes', async () => {
  const { prisma, calls } = relationPrisma([{ ...orderItem }, { ...inherited }])
  const response = await appWith(prisma).request('/purchases/relations/r-order?dependents=remove', { method: 'DELETE' })
  assert.equal(response.status, 200)
  assert.deepEqual(calls.deleted.sort(), ['r-inh', 'r-order'])
})

test('no se puede ver ni quitar una relación de otra empresa', async () => {
  const { prisma, calls } = relationPrisma([{ ...orderItem, companyId: OTHER }])
  const app = appWith(prisma)
  assert.equal((await app.request('/purchases/relations/r-order/impact')).status, 404)
  assert.equal((await app.request('/purchases/relations/r-order?dependents=remove', { method: 'DELETE' })).status, 404)
  assert.deepEqual(calls.deleted, [])
})

test('vínculos migrados, automáticos y manuales se quitan con motivo y quedan auditados', async () => {
  for (const origin of ['MIGRATED', 'AUTOMATIC', 'MANUAL']) {
    const { prisma, calls } = relationPrisma([{ ...orderItem, relationType: origin === 'MIGRATED' ? 'ACQUIRED_IN' : 'PURCHASED_IN', origin }])
    const app = appWith(prisma)
    const impact = (await (await app.request('/purchases/relations/r-order/impact')).json()).data
    assert.equal(impact.protected, false, origin)
    assert.equal(impact.relation.origin, origin)
    const response = await app.request('/purchases/relations/r-order?reason=Correcci%C3%B3n', { method: 'DELETE' })
    assert.equal(response.status, 200, origin)
    assert.equal(calls.audits.at(-1).before.origin, origin)
    assert.equal(calls.audits.at(-1).metadata.reason, 'Corrección')
  }
})
