import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createPurchasesRouter } from '../../routes/purchases/index.js'
import { PURCHASE_PRESETS, isPurchasesNavVisible } from '../purchases-service.js'
import { buildStageMap, contextFromBundle, orderReceiptState } from '../purchase-policies.js'
import { caseClosureCheck } from '../purchase-case-closure.js'

const COMPANY = '11111111-1111-7111-8111-111111111111'
const PROFILE = '22222222-2222-7222-8222-222222222222'
const STAMP = new Date('2026-10-01T10:00:00.000Z')
const goods = (id, quantity, receivedQuantity = 0, ownerId = 'o1') => ({ id, ownerType: 'PURCHASE_ORDER', ownerId, itemKind: 'GOODS', quantity, receivedQuantity })
const service = (id, ownerId = 'o1') => ({ id, ownerType: 'PURCHASE_ORDER', ownerId, itemKind: 'SERVICE', quantity: 1, receivedQuantity: 0 })
const workflowOf = (preset, capabilities = {}) => ({ ...PURCHASE_PRESETS[preset], capabilities: { ...PURCHASE_PRESETS[preset].capabilities, ...capabilities } })

// ── Reception ───────────────────────────────────────────────────────────────

test('estado de recepción por orden: servicios, pendiente, parcial, completa, cancelada y con faltantes', () => {
  const state = (status, lines) => orderReceiptState({ status }, lines).state
  assert.equal(state('ISSUED', [service('l1')]), 'NOT_APPLICABLE')
  assert.equal(state('DRAFT', [goods('l1', 2)]), 'NOT_ISSUED')
  assert.equal(state('ISSUED', [goods('l1', 2)]), 'PENDING')
  assert.equal(state('PARTIALLY_RECEIVED', [goods('l1', 2, 1)]), 'PARTIAL')
  assert.equal(state('RECEIVED', [goods('l1', 2, 2), service('l2')]), 'COMPLETE')
  assert.equal(state('CANCELLED', [goods('l1', 2)]), 'CANCELLED')
  const short = orderReceiptState({ status: 'CLOSED' }, [goods('l1', 3, 1)])
  assert.equal(short.state, 'CLOSED_SHORT')
  assert.deepEqual(short.pendingLines.map(line => line.pending), [2])
  assert.equal(short.label, 'Cerrada con faltantes')
})

test('una orden solo de servicios o sin emitir no bloquea la recepción del expediente', () => {
  const servicesOnly = contextFromBundle({ orders: [{ id: 'o1', status: 'ISSUED', total: 10 }], lines: [service('l1')] })
  assert.equal(servicesOnly.receivedAll, true)
  assert.equal(servicesOnly.servicesOnly, true)
  const waiting = contextFromBundle({ orders: [{ id: 'o1', status: 'ISSUED', total: 10 }, { id: 'o2', status: 'ISSUED', total: 5 }], lines: [goods('l1', 1, 0, 'o1'), service('l2', 'o2')] })
  assert.equal(waiting.receivedAll, false)
  const map = buildStageMap(PURCHASE_PRESETS.INVENTORY, { case: { status: 'IN_PROGRESS' }, orders: [{ id: 'o1', status: 'ISSUED' }], lines: [service('l1')] })
  assert.equal(map.find(stage => stage.type === 'RECEIPT').state, 'skipped')
  const draft = buildStageMap(PURCHASE_PRESETS.INVENTORY, { case: { status: 'OPEN' }, orders: [{ id: 'o1', status: 'DRAFT' }], lines: [goods('l1', 1)] })
  assert.notEqual(draft.find(stage => stage.type === 'RECEIPT').state, 'skipped')
})

// ── Case closure ────────────────────────────────────────────────────────────

test('cierre del expediente: listo solo con documentos finales y sin obligaciones pendientes', () => {
  const basic = workflowOf('BASIC')
  const open = caseClosureCheck(basic, { case: { status: 'IN_PROGRESS' }, orders: [{ id: 'o1', number: 'OC-1', status: 'ISSUED' }], invoices: [{ id: 'i1', status: 'PENDING' }] })
  assert.equal(open.ready, false)
  assert.equal(open.automatic, true)
  assert.match(open.openDocuments[0].reason, /OC-1 sigue abierta/)

  const done = caseClosureCheck(basic, { case: { status: 'IN_PROGRESS' }, orders: [{ id: 'o1', status: 'CLOSED' }], invoices: [{ id: 'i1', status: 'PENDING' }] })
  assert.deepEqual([done.ready, done.outcome], [true, 'CLOSED'])

  // With payments on, a registered invoice still waits for its payment.
  const payable = caseClosureCheck(workflowOf('BASIC', { payments: true }), { orders: [{ id: 'o1', status: 'CLOSED' }], invoices: [{ id: 'i1', status: 'PENDING' }] })
  assert.equal(payable.ready, false)

  const cancelled = caseClosureCheck(basic, { orders: [{ id: 'o1', status: 'CANCELLED' }] })
  assert.deepEqual([cancelled.ready, cancelled.outcome], [true, 'CANCELLED'])

  // BASIC requires an invoice: a closed order alone is not enough.
  const noInvoice = caseClosureCheck(basic, { orders: [{ id: 'o1', status: 'CLOSED' }] })
  assert.equal(noInvoice.ready, false)
  assert.ok(noInvoice.blockers.length > 0)

  assert.equal(caseClosureCheck(workflowOf('COMPLETE'), {}).automatic, false)
})

test('INVENTORY: un expediente con bienes cerrados con faltantes puede cerrar; con bienes pendientes no', () => {
  const inventory = workflowOf('INVENTORY')
  const bundle = (orderStatus, received) => ({
    orders: [{ id: 'o1', status: orderStatus }], invoices: [{ id: 'i1', status: 'PENDING' }], lines: [goods('l1', 2, received)],
  })
  assert.equal(caseClosureCheck(inventory, bundle('CLOSED', 1)).ready, true)
  assert.equal(caseClosureCheck(inventory, bundle('RECEIVED', 2)).ready, false)
})

// ── Routes ──────────────────────────────────────────────────────────────────

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

const post = (app, path, payload) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

// Models answer "nothing" unless overridden; writes are recorded per model.
function fakePrisma(workflow, tables = {}) {
  const writes = []
  const empty = name => ({
    findUnique: async () => null,
    findMany: async () => [], findFirst: async () => null, count: async () => 0,
    updateMany: async args => { writes.push({ model: name, op: 'updateMany', ...args }); return { count: 1 } },
    update: async args => { writes.push({ model: name, op: 'update', ...args }); return { id: args.where.id, ...args.data } },
    create: async ({ data }) => { writes.push({ model: name, op: 'create', data }); return data },
    createMany: async ({ data }) => { writes.push({ model: name, op: 'createMany', data }); return { count: data.length } },
    deleteMany: async args => { writes.push({ model: name, op: 'deleteMany', ...args }); return { count: 0 } },
  })
  const base = { purchaseWorkflow: { findFirst: async () => ({ id: 'w1', isDefault: true, enabled: true, ...workflow }) } }
  const prisma = new Proxy({ ...base }, {
    get(target, key) {
      if (key === 'writes') return writes
      if (key === '$transaction') return callback => callback(prisma)
      if (key === '$queryRaw') return tables.$queryRaw ?? (async () => [])
      if (typeof key !== 'string' || key.startsWith('$')) return undefined
      if (!(key in target)) target[key] = { ...empty(key), ...(tables[key] ?? {}) }
      return target[key]
    },
  })
  return prisma
}

const issuedOrder = { id: 'o1', companyId: COMPANY, caseId: 'c1', status: 'ISSUED', total: 100, updatedAt: STAMP }

test('cerrar una orden con bienes pendientes exige cierre con faltantes y motivo', async () => {
  const prisma = fakePrisma(workflowOf('INVENTORY'), {
    purchaseOrder: { findFirst: async () => issuedOrder },
    purchaseLine: { findMany: async () => [goods('l1', 2, 0)] },
  })
  const app = appWith(prisma)
  const blocked = await post(app, '/purchases/orders/o1/transition', { action: 'close' })
  assert.equal(blocked.status, 409)
  const body = await blocked.json()
  assert.equal(body.code, 'RECEIPT_PENDING')
  assert.match(body.error, /1 concepto\(s\) de bienes pendientes/)
  const noReason = await post(app, '/purchases/orders/o1/transition', { action: 'close', closeShort: true })
  assert.equal(noReason.status, 400)
  const ok = await post(app, '/purchases/orders/o1/transition', { action: 'close', closeShort: true, comment: 'El proveedor no surtirá el resto' })
  assert.equal(ok.status, 200)
  const audit = prisma.writes.find(write => write.model === 'auditLog' && write.data.action === 'purchase.order.close')
  assert.deepEqual(audit.data.metadata.closedShort, [{ lineId: 'l1', pending: 2 }])
})

test('sin capacidad de recepciones, cerrar la orden no exige recepción', async () => {
  const prisma = fakePrisma(workflowOf('BASIC'), {
    purchaseOrder: { findFirst: async () => issuedOrder },
    purchaseLine: { findMany: async () => [goods('l1', 2, 0)] },
  })
  assert.equal((await post(appWith(prisma), '/purchases/orders/o1/transition', { action: 'close' })).status, 200)
})

test('BASIC: cerrar la última orden abierta cierra el expediente automáticamente y lo audita', async () => {
  let closed = false
  const prisma = fakePrisma(workflowOf('BASIC'), {
    $queryRaw: async () => [{ status: 'IN_PROGRESS' }],
    purchaseOrder: {
      findFirst: async () => (closed ? { ...issuedOrder, status: 'CLOSED' } : issuedOrder),
      findMany: async () => [{ ...issuedOrder, status: closed ? 'CLOSED' : 'ISSUED' }],
      updateMany: async () => { closed = true; return { count: 1 } },
    },
    purchaseInvoice: { findMany: async () => [{ id: 'i1', status: 'PENDING' }] },
    purchaseCase: { findFirst: async () => ({ id: 'c1', companyId: COMPANY, status: 'IN_PROGRESS' }) },
  })
  const response = await post(appWith(prisma), '/purchases/orders/o1/transition', { action: 'close' })
  assert.equal(response.status, 200)
  const caseWrite = prisma.writes.find(write => write.model === 'purchaseCase' && write.data?.status === 'CLOSED')
  assert.ok(caseWrite, 'case closed')
  assert.deepEqual(caseWrite.where.status, { in: ['OPEN', 'IN_PROGRESS'] })
  const audit = prisma.writes.find(write => write.model === 'auditLog' && write.data.action === 'purchase.case.auto_closed')
  assert.deepEqual(audit.data.metadata.trigger, { entityType: 'purchase_order', entityId: 'o1', action: 'close' })
})

test('COMPLETE: no se cierra automático; el cierre manual con documentos abiertos responde 409', async () => {
  const prisma = fakePrisma(workflowOf('COMPLETE'), {
    purchaseCase: { findFirst: async () => ({ id: 'c1', companyId: COMPANY, status: 'IN_PROGRESS' }) },
    purchaseRequest: { findMany: async () => [{ id: 'r1', status: 'ORDERED' }] },
    purchaseApproval: { findMany: async () => [{ id: 'a1', status: 'APPROVED' }] },
    purchaseOrder: { findMany: async () => [{ id: 'o1', number: 'OC-7', status: 'ISSUED', total: 10 }] },
    purchaseInvoice: { findMany: async () => [{ id: 'i1', status: 'PAID', total: 10 }] },
    purchaseLine: { findMany: async () => [service('l1')] },
  })
  const response = await post(appWith(prisma), '/purchases/cases/c1/transition', { action: 'close' })
  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.code, 'CASE_HAS_OPEN_DOCUMENTS')
  assert.deepEqual(body.reasons, ['Orden OC-7 sigue abierta (ciérrala o cancélala)'])
})

test('reabrir un expediente solo cambia el expediente, nunca sus documentos', async () => {
  const prisma = fakePrisma(workflowOf('COMPLETE'), {
    purchaseCase: { findFirst: async () => ({ id: 'c1', companyId: COMPANY, status: 'CLOSED', closedAt: STAMP }) },
  })
  const response = await post(appWith(prisma), '/purchases/cases/c1/transition', { action: 'reopen' })
  assert.equal(response.status, 200)
  const models = [...new Set(prisma.writes.map(write => write.model))].sort()
  assert.deepEqual(models, ['auditLog', 'purchaseCase'])
})

test('no se vincula un equipo ni se factura contra una orden cancelada', async () => {
  const cancelled = { ...issuedOrder, status: 'CANCELLED' }
  const prisma = fakePrisma(workflowOf('BASIC'), {
    purchaseOrder: { findFirst: async () => cancelled, findMany: async () => [cancelled] },
    invItem: { findFirst: async () => ({ id: 'item1' }) },
  })
  const app = appWith(prisma)
  const link = await post(app, '/purchases/relations', { sourceType: 'purchase_order', sourceId: 'o1', targetType: 'inventory_item', targetId: 'item1' })
  assert.equal(link.status, 409)
  assert.equal((await link.json()).code, 'DOCUMENT_CANCELLED')
  const invoice = await post(app, '/purchases/invoices', { orderIds: ['o1'], lines: [] })
  assert.equal(invoice.status, 409)
  assert.equal((await invoice.json()).code, 'DOCUMENT_CANCELLED')
})

test('"Cambiar" quita solo el vínculo vigente y conserva el de la orden cancelada', async () => {
  const relations = [
    { id: 'r-old', sourceId: 'o-cancelada', targetId: 'item1' },
    { id: 'r-live', sourceId: 'o-vigente', targetId: 'item1' },
  ]
  const prisma = fakePrisma(workflowOf('BASIC'), {
    purchaseOrder: {
      findFirst: async () => ({ ...issuedOrder, id: 'o-nueva' }),
      findMany: async ({ where }) => where.id.in.filter(id => id !== 'o-cancelada').map(id => ({ id })),
    },
    invItem: { findFirst: async () => ({ id: 'item1' }) },
    entityRelation: {
      findFirst: async () => null,
      findMany: async () => relations,
      create: async ({ data }) => ({ id: 'r-new', ...data }),
    },
  })
  const response = await post(appWith(prisma), '/purchases/relations', { sourceType: 'purchase_order', sourceId: 'o-nueva', targetType: 'inventory_item', targetId: 'item1', replace: true })
  assert.equal(response.status, 201)
  const removed = prisma.writes.find(write => write.model === 'entityRelation' && write.op === 'deleteMany')
  assert.deepEqual(removed.where.id, { in: ['r-live'] })
})

test('la navegación conserva secciones apagadas con historial', () => {
  const simple = PURCHASE_PRESETS.SIMPLE.capabilities
  assert.equal(isPurchasesNavVisible('/purchases/orders', simple), false)
  assert.equal(isPurchasesNavVisible('/purchases/orders', simple, { orders: true }), true)
  assert.equal(isPurchasesNavVisible('/purchases/approvals', simple, { orders: true }), false)
})
