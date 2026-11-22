// Paid tickets at the box office (spec section 5, D2). A PENDING_PAYMENT order is charged
// in Caja; confirmation reads the POS sale on the server (same company, PAID, not refunded,
// not linked to another order, currency, products, quantities and unit prices equal to
// the order's snapshot, no discounts) and only then issues the tickets, in one
// transaction. A browser saying "paid" proves nothing.
import { requestHash } from '../bookings/bookings-command-service.js'
import { listPaidSalesWithProducts, readPosSale } from '../pos/pos-sale-read.js'
import { TicketingError, newSecret, notFound, orderEvent, qrText, serializeOrder } from './ticketing-core.js'
import { createTicketingTx } from './ticketing-tx.js'
import { createTicketingVault } from './ticketing-vault.js'

// Pure: why this sale cannot pay this order (null when it can).
export function saleMismatch(totals, sale) {
  if (!sale) return 'No se encontró esa venta de Caja.'
  if (sale.status !== 'PAID') return 'La venta de Caja todavía no está pagada.'
  if (Number(sale.refundedAmount) > 0 || sale.refunds.length) return 'La venta de Caja tiene devoluciones.'
  if (Number(sale.discountAmount) > 0) return 'La venta de Caja tiene descuentos; cóbrala sin descuento.'
  if (totals.currency && sale.currency && totals.currency !== sale.currency) return `La venta está en ${sale.currency} y los boletos en ${totals.currency}.`
  const live = sale.lines.filter((l) => !l.voided)
  for (const item of (totals.items ?? []).filter((i) => i.priceMode !== 'free')) {
    const lines = live.filter((l) => l.productId === item.catalogProductId)
    const quantity = lines.reduce((sum, l) => sum + l.quantity, 0)
    if (quantity !== item.quantity) return `La venta tiene ${quantity} de «${item.productName}» y la orden ${item.quantity}.`
    if (lines.some((l) => l.unitPrice !== item.unitPrice)) return `El precio de «${item.productName}» en la venta no es ${item.unitPrice}.`
    if (lines.some((l) => Number(l.discountAmount) > 0)) return `«${item.productName}» tiene descuento en la venta.`
  }
  if (Number(sale.paidAmount) < Number(totals.amount ?? 0)) return 'Lo pagado en la venta no cubre los boletos.'
  return null
}

export function createTicketingPaymentService({ prisma, now = () => Date.now(), env = process.env, vault = createTicketingVault({ env }) }) {
  const { inTx, claim, settle, history, emit, ticketsOf, orderView, enqueueDelivery } = createTicketingTx({ prisma })

  async function confirmPayment({ companyId, actorId, orderId, posOrderId, idempotencyKey = null }) {
    return inTx(async (tx) => {
      const claimed = await claim(tx, { companyId, scope: `user:${actorId}`, operation: 'confirm', key: idempotencyKey, hash: requestHash('confirm', { orderId, posOrderId }) })
      if (claimed?.replay) return { order: await orderView(tx, companyId, claimed.replay), credentials: [], replayed: true }
      const order = (await tx.$queryRaw`SELECT * FROM ticket_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
      if (!order) throw notFound('Orden')
      // A retry after a lost response: already confirmed with this very sale.
      if (order.status === 'CONFIRMED' && order.pos_order_id === posOrderId) return { order: await orderView(tx, companyId, order.id), credentials: [], replayed: true }
      if (order.status === 'EXPIRED') throw new TicketingError('El apartado venció antes de confirmar el pago; devuelve el cobro en Caja y crea otra orden.', 409, 'HOLD_EXPIRED')
      if (order.status !== 'PENDING_PAYMENT') throw new TicketingError('Esta orden ya no espera un pago.', 409, 'INVALID_TRANSITION')
      const sale = await readPosSale(tx, { companyId, orderId: posOrderId, lock: true })
      if (!sale) throw notFound('Venta de Caja')
      const linked = (await tx.$queryRaw`SELECT reference FROM ticket_order WHERE pos_order_id = ${posOrderId}::uuid AND id <> ${order.id}::uuid`)[0]
      if (linked) throw new TicketingError(`Esa venta ya pagó la orden ${linked.reference}.`, 409, 'SALE_ALREADY_USED')
      const problem = saleMismatch(order.totals, sale)
      if (problem) throw new TicketingError(problem, sale.status === 'PAID' ? 422 : 409, sale.status === 'PAID' ? 'SALE_MISMATCH' : 'PAYMENT_NOT_CONFIRMED')

      const credentials = []
      for (const ticket of (await ticketsOf(tx, order.id)).filter((t) => t.status === 'PENDING_PAYMENT')) {
        const issue = newSecret()
        await tx.$executeRaw`
          UPDATE ticket SET status = 'ISSUED', credential_hash = ${issue.hash}, credential_version = 1, issued_at = ${new Date(now())}, version = version + 1, updated_at = now()
           WHERE id = ${ticket.id}::uuid`
        credentials.push({ ticketId: ticket.id, code: ticket.code, credentialVersion: 1, qr: qrText(ticket.id, issue.secret) })
        await vault.store(tx, { companyId, ticketId: ticket.id, version: 1, secret: issue.secret })
      }
      const updated = (await tx.$queryRaw`
        UPDATE ticket_order SET status = 'CONFIRMED', pos_order_id = ${posOrderId}::uuid, paid_at = ${new Date(now())}, hold_expires_at = NULL, version = version + 1, updated_at = now()
         WHERE id = ${order.id}::uuid RETURNING *`)[0]
      await settle(tx, claimed, order.id)
      await enqueueDelivery(tx, { companyId, order: updated, tickets: await ticketsOf(tx, order.id), kind: 'issued' })
      await history(tx, { companyId, entity: 'order', entityId: order.id, action: 'confirm_payment', actorId, before: { status: order.status }, after: { status: 'CONFIRMED', posOrderId, posOrderNumber: sale.orderNumber, paidAmount: sale.paidAmount, currency: sale.currency } })
      await emit(tx, companyId, 'ticketing.order.confirmed', orderEvent(updated))
      return { order: serializeOrder(updated, await ticketsOf(tx, order.id)), credentials, replayed: false }
    })
  }

  // Paid sales that could settle this order (Caja interrupted before confirming).
  async function paymentCandidates({ companyId, orderId }) {
    const order = (await prisma.$queryRaw`SELECT * FROM ticket_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid`)[0]
    if (!order) throw notFound('Orden')
    if (order.status !== 'PENDING_PAYMENT') return []
    const productIds = (order.totals?.items ?? []).filter((i) => i.catalogProductId).map((i) => i.catalogProductId)
    const used = (await prisma.$queryRaw`SELECT pos_order_id FROM ticket_order WHERE company_id = ${companyId}::uuid AND pos_order_id IS NOT NULL`).map((r) => r.pos_order_id)
    const sales = await listPaidSalesWithProducts(prisma, { companyId, productIds, since: new Date(new Date(order.created_at).getTime() - 3600000), exclude: used })
    const out = []
    for (const s of sales) {
      const problem = saleMismatch(order.totals, await readPosSale(prisma, { companyId, orderId: s.id }))
      out.push({ posOrderId: s.id, orderNumber: s.order_number, totalAmount: Number(s.total_amount).toFixed(2), paidAt: s.paid_at, customerName: s.customer_name, matches: !problem, problem })
    }
    return out
  }

  // What Caja loads for "?boletos=": catalog products and quantities to charge, no
  // personal data beyond the buyer's name shown to the cashier.
  async function saleView({ companyId, orderId }) {
    const row = (await prisma.$queryRaw`
      SELECT o.*, e.title AS event_title, b.starts_at FROM ticket_order o
        JOIN ticket_event e ON e.id = o.event_id AND e.company_id = o.company_id
        JOIN ticket_session s ON s.id = o.session_id AND s.company_id = o.company_id
        JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = o.company_id
       WHERE o.id = ${orderId}::uuid AND o.company_id = ${companyId}::uuid`)[0]
    if (!row) throw notFound('Orden')
    return {
      id: row.id, reference: row.reference, status: row.status, holdExpiresAt: row.hold_expires_at, buyerName: row.buyer_name,
      eventTitle: row.event_title, startsAt: row.starts_at, currency: row.totals?.currency ?? null, amount: row.totals?.amount ?? '0.00',
      items: (row.totals?.items ?? []).filter((i) => i.priceMode !== 'free').map((i) => ({ productId: i.catalogProductId, name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
    }
  }

  return { confirmPayment, paymentCandidates, saleView, view: (companyId, orderId) => orderView(prisma, companyId, orderId) }
}

