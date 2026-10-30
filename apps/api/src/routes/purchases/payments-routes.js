// runly.purchases: individual invoice payments and reversals. Reads need the
// invoice read permission and work with the payments capability off
// (history); writes need their own permission and the capability.
import { Hono } from 'hono'
import { actorId, body, companyOf, createHandler } from './route-helpers.js'

export function createPurchasesPaymentsRouter({ requirePermission, services }) {
  const router = new Hono()
  const handle = createHandler('[purchases:payments]')
  const { payments } = services

  router.get('/purchases/invoices/:id/payments', requirePermission('purchases.invoice.read'), c =>
    handle(c, async () => ({ data: await payments.list(companyOf(c), c.req.param('id')) })))

  router.get('/purchases/invoices/:id/balance', requirePermission('purchases.invoice.read'), c =>
    handle(c, async () => ({ data: (await payments.list(companyOf(c), c.req.param('id'))).summary })))

  // 201 for a new movement, 200 when the idempotency key replays an existing one.
  router.post('/purchases/invoices/:id/payments', requirePermission('purchases.payment.manage'), async c => {
    let status = 201
    return handle(c, async () => {
      const result = await payments.record(companyOf(c), actorId(c), c.req.param('id'), await body(c))
      if (result.replayed) status = 200
      return { data: result }
    }, () => status)
  })

  router.get('/purchases/payments/:id', requirePermission('purchases.invoice.read'), c =>
    handle(c, async () => ({ data: await payments.get(companyOf(c), c.req.param('id')) })))

  router.post('/purchases/payments/:id/reverse', requirePermission('purchases.payment.reverse'), async c => {
    let status = 201
    return handle(c, async () => {
      const result = await payments.reverse(companyOf(c), actorId(c), c.req.param('id'), await body(c))
      if (result.replayed) status = 200
      return { data: result }
    }, () => status)
  })

  return router
}
