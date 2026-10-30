// runly.purchases: orders, invoices and receipts.
import { Hono } from 'hono'
import { actorId, assertPermission, body, canReadOf, companyOf, createHandler } from './route-helpers.js'
import { KINDS } from '../../services/purchases-shared.js'
import { hasCapability } from '../../services/purchases-service.js'

const PERMS = {
  orders: { read: 'purchases.order.read', create: 'purchases.order.create', update: 'purchases.order.update' },
  invoices: { read: 'purchases.invoice.read', create: 'purchases.invoice.create', update: 'purchases.invoice.update' },
}

// Extra permission needed by specific transition actions.
export const ACTION_PERMISSION = {
  approve: 'purchases.approval.decide',
  reject: 'purchases.approval.decide',
  pay: 'purchases.payment.manage',
}

// A list response plus `capabilityEnabled`, so the client can show history
// read-only instead of hiding it when the company turns a capability off.
export async function listWithCapability({ workflow, listing }, companyId, kind, gate, query) {
  const current = await workflow.ensureWorkflow(companyId)
  return { ...(await listing.list(kind, companyId, query)), capabilityEnabled: hasCapability(current.capabilities, gate) }
}

export function createPurchasesDocumentsRouter({ requirePermission, services }) {
  const router = new Hono()
  const handle = createHandler('[purchases:documents]')
  const { workflow, listing, documents, receipts } = services
  const readableList = (c, kind, gate) => listWithCapability({ workflow, listing }, companyOf(c), kind, gate, c.req.query())

  for (const kind of ['orders', 'invoices']) {
    const perms = PERMS[kind]
    const gate = KINDS[kind].capability
    const base = `/purchases/${kind}`

    // Reads stay open when the capability is off (historical documents keep
    // their evidence); every write asserts the capability in the service.
    router.get(base, requirePermission(perms.read), c =>
      handle(c, () => readableList(c, kind, gate)))

    router.post(base, requirePermission(perms.create), c =>
      handle(c, async () => ({ data: await documents.create(kind, companyOf(c), actorId(c), await body(c)) }), 201))

    router.get(`${base}/:id`, requirePermission(perms.read), c =>
      handle(c, async () => ({ data: await documents.get(kind, companyOf(c), c.req.param('id'), canReadOf(c)) })))

    router.patch(`${base}/:id`, requirePermission(perms.update), c =>
      handle(c, async () => ({ data: await documents.update(kind, companyOf(c), actorId(c), c.req.param('id'), await body(c)) })))

    router.post(`${base}/:id/transition`, requirePermission(perms.update), c =>
      handle(c, async () => {
        const { action, ...payload } = await body(c)
        if (ACTION_PERMISSION[action]) assertPermission(c, ACTION_PERMISSION[action])
        return { data: await documents.transition(kind, companyOf(c), actorId(c), c.req.param('id'), String(action ?? ''), payload) }
      }))
  }

  router.get('/purchases/receipts', requirePermission('purchases.receipt.read'), c =>
    handle(c, () => readableList(c, 'receipts', 'receipts')))

  router.post('/purchases/receipts', requirePermission('purchases.receipt.create'), c =>
    handle(c, async () => ({ data: await receipts.create(companyOf(c), actorId(c), await body(c)) }), 201))

  router.get('/purchases/receipts/:id', requirePermission('purchases.receipt.read'), c =>
    handle(c, async () => ({ data: await receipts.get(companyOf(c), c.req.param('id'), canReadOf(c)) })))

  return router
}
