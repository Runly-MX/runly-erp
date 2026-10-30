// runly.purchases: audited corrections of registered orders and invoices, and
// goods receipt reversals. History reads need only the read permission and
// work with the capability off; writes need their own permission (granted to
// no role by default) and the capability.
import { Hono } from 'hono'
import { actorId, body, companyOf, createHandler } from './route-helpers.js'

const PERMS = {
  orders: { read: 'purchases.order.read', correct: 'purchases.order.correct' },
  invoices: { read: 'purchases.invoice.read', correct: 'purchases.invoice.correct' },
}

export function createPurchasesCorrectionsRouter({ requirePermission, services }) {
  const router = new Hono()
  const handle = createHandler('[purchases:corrections]')
  const { corrections, receiptReversals } = services

  for (const kind of ['orders', 'invoices']) {
    router.get(`/purchases/${kind}/:id/revisions`, requirePermission(PERMS[kind].read), c =>
      handle(c, async () => ({ data: await corrections.revisions(kind, companyOf(c), c.req.param('id')) })))

    router.post(`/purchases/${kind}/:id/corrections`, requirePermission(PERMS[kind].correct), c =>
      handle(c, async () => ({ data: await corrections.correct(kind, companyOf(c), actorId(c), c.req.param('id'), await body(c)) }), 201))
  }

  router.get('/purchases/receipts/:id/reversal-preview', requirePermission('purchases.receipt.read'), c =>
    handle(c, async () => ({ data: await receiptReversals.preview(companyOf(c), c.req.param('id')) })))

  // 201 for a new reversal, 200 when the idempotency key replays an existing one.
  router.post('/purchases/receipts/:id/reverse', requirePermission('purchases.receipt.reverse'), c => {
    let status = 201
    return handle(c, async () => {
      const result = await receiptReversals.reverse(companyOf(c), actorId(c), c.req.param('id'), await body(c))
      if (result.replayed) status = 200
      return { data: result }
    }, () => status)
  })

  return router
}
