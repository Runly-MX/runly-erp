// Website orders: the record of what a published site sold through its cart (spec 2026-11-24-website-commerce-accounts-design.md).
// Website-owned tables only. Prices come from the server-side catalog (never the client); a payment counts only after Stripe confirms it
// with the site's own key. Customer links are soft: the signed-in account when there is one, otherwise the contact matched by paid email.
import Stripe from 'stripe'
import { decryptPassword } from './smtp-service.js'
import { WebsiteServiceError } from '../routes/website/service-helpers.js'

const fail = (message, status, code) => new WebsiteServiceError(message, status, code)
const money = (value) => Math.round(Number(value) * 100) / 100
const SELECT = { id: true, orderNumber: true, status: true, currency: true, subtotalAmount: true, totalAmount: true, customerEmail: true, customerName: true, contactId: true, externalAccountId: true, paidAt: true, createdAt: true }

export const publicOrder = (order) => ({
  id: order.id, number: order.orderNumber, status: order.status, currency: order.currency,
  subtotal: Number(order.subtotalAmount), total: Number(order.totalAmount),
  customer: { email: order.customerEmail ?? null, name: order.customerName ?? null, contactId: order.contactId ?? null, accountId: order.externalAccountId ?? null },
  paidAt: order.paidAt ?? null, createdAt: order.createdAt,
  ...(order.lines ? { lines: order.lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, name: l.name, unitPrice: Number(l.unitPrice), quantity: l.quantity, currency: l.currency })) } : {}),
})

export function createWebsiteOrdersService({ prisma, StripeImpl = Stripe, decryptPasswordImpl = decryptPassword }) {
  async function place({ companyId, siteId, lines, accountId = null }) {
    if (!lines?.length) throw fail('El carrito está vacío.', 400, 'validation_failed')
    const currencies = new Set(lines.map((l) => l.currency))
    if (currencies.size !== 1) throw fail('Todos los productos del carrito deben usar la misma moneda', 400, 'validation_failed')
    const currency = [...currencies][0].toLowerCase()
    const subtotal = money(lines.reduce((sum, l) => sum + l.price * l.qty, 0))
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${siteId}::text, 2))::text`
      const last = await tx.websiteOrder.aggregate({ where: { siteId }, _max: { orderNumber: true } })
      return tx.websiteOrder.create({
        data: {
          companyId, siteId, orderNumber: (last._max.orderNumber ?? 0) + 1, currency, subtotalAmount: subtotal, totalAmount: subtotal, externalAccountId: accountId,
          lines: { create: lines.map((l) => ({ companyId, productId: l.productId, variantId: l.variantId ?? null, name: String(l.name).slice(0, 200), unitPrice: money(l.price), quantity: l.qty, currency: currency })) },
        },
        select: { ...SELECT, lines: true },
      })
    })
  }
  const attachSession = (orderId, stripeSessionId) => prisma.websiteOrder.update({ where: { id: orderId }, data: { stripeSessionId } })
  const cancel = (orderId) => prisma.websiteOrder.updateMany({ where: { id: orderId, status: 'pending' }, data: { status: 'cancelled' } })

  async function stripeFor(siteId) {
    const site = await prisma.websiteSite.findFirst({ where: { id: siteId, enabled: true }, select: { companyId: true, stripeSecretKey: true } })
    if (!site) throw fail('Recurso no encontrado.', 404, 'order_not_found')
    if (!site.stripeSecretKey) throw fail('Stripe no configurado para este sitio', 400, 'stripe_not_configured')
    return { companyId: site.companyId, stripe: new StripeImpl(decryptPasswordImpl(site.stripeSecretKey), { apiVersion: '2024-12-18.acacia' }) }
  }

  // The customer record of a paid order: a contact that already has that email is linked, never overwritten.
  async function contactFor(tx, { companyId, accountId, email, name }) {
    if (accountId) {
      const account = await tx.externalAccount.findFirst({ where: { id: accountId, companyId }, select: { contactId: true } })
      if (account?.contactId) return account.contactId
    }
    if (!email) return null
    const found = await tx.contact.findFirst({ where: { companyId, enabled: true, email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
    if (found) return found.id
    const created = await tx.contact.create({ data: { companyId, type: 'customer', name: name || email, email, tags: ['cliente-web'] }, select: { id: true } })
    return created.id
  }

  // Asks Stripe, with the site key, whether the session was paid. Idempotent: a paid order is returned as is.
  async function settle(order) {
    if (order.status === 'paid') return order
    if (order.status !== 'pending' || !order.stripeSessionId) throw fail('El pedido no admite confirmación.', 409, 'payment_unconfirmed')
    const { stripe } = await stripeFor(order.siteId)
    let session
    try { session = await stripe.checkout.sessions.retrieve(order.stripeSessionId) } catch { throw fail('No se pudo consultar el pago. Inténtalo de nuevo.', 409, 'payment_unconfirmed') }
    if (session?.payment_status !== 'paid') throw fail('El pago aún no está confirmado.', 409, 'payment_unconfirmed')
    const email = session.customer_details?.email ?? session.customer_email ?? null, name = session.customer_details?.name ?? null
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.websiteOrder.updateMany({ where: { id: order.id, status: 'pending' }, data: { status: 'paid', paidAt: new Date(), customerEmail: email, customerName: name } })
      const current = await tx.websiteOrder.findFirst({ where: { id: order.id }, select: { ...SELECT, siteId: true, companyId: true, stripeSessionId: true, lines: true } })
      if (claimed.count === 1) {
        const contactId = await contactFor(tx, { companyId: current.companyId, accountId: current.externalAccountId, email, name })
        if (contactId) await tx.websiteOrder.update({ where: { id: order.id }, data: { contactId } })
        await tx.auditLog.create({ data: { actorId: null, companyId: current.companyId, moduleKey: 'runly.website', entityType: 'website.order', entityId: order.id, action: 'website.order.paid', metadata: { siteId: current.siteId, number: current.orderNumber, total: Number(current.totalAmount), currency: current.currency } } })
        current.contactId = contactId ?? current.contactId
      }
      return current
    })
  }

  async function confirm({ siteId, sessionId }) {
    if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) throw fail('Recurso no encontrado.', 404, 'order_not_found')
    const order = await prisma.websiteOrder.findFirst({ where: { siteId, stripeSessionId: sessionId }, select: { ...SELECT, siteId: true, companyId: true, stripeSessionId: true, lines: true } })
    if (!order) throw fail('Recurso no encontrado.', 404, 'order_not_found')
    return settle(order)
  }

  async function verify({ companyId, siteId, orderId, actorId = null }) {
    const order = await prisma.websiteOrder.findFirst({ where: { id: orderId, companyId, siteId }, select: { ...SELECT, siteId: true, companyId: true, stripeSessionId: true, lines: true } })
    if (!order) throw fail('Recurso no encontrado.', 404, 'order_not_found')
    const settled = await settle(order)
    await prisma.auditLog.create({ data: { actorId, companyId, moduleKey: 'runly.website', entityType: 'website.order', entityId: orderId, action: 'website.order.verify', metadata: { siteId, status: settled.status } } })
    return settled
  }

  async function list({ companyId, siteId, status, limit = 25, cursor }) {
    const take = Math.min(Math.max(Number(limit) || 25, 1), 100)
    if (status && !['pending', 'paid', 'cancelled'].includes(status)) throw fail('Estado no válido.', 422, 'validation_failed')
    const before = Number.isSafeInteger(Number(cursor)) && Number(cursor) > 0 ? { orderNumber: { lt: Number(cursor) } } : {}
    const rows = await prisma.websiteOrder.findMany({ where: { companyId, siteId, ...(status ? { status } : {}), ...before }, orderBy: [{ orderNumber: 'desc' }], take: take + 1, select: SELECT })
    const items = rows.slice(0, take)
    return { items: items.map(publicOrder), next: rows.length > take ? items.at(-1).orderNumber : null }
  }

  async function get({ companyId, siteId, orderId }) {
    const order = await prisma.websiteOrder.findFirst({ where: { id: orderId, companyId, siteId }, select: { ...SELECT, lines: true } })
    if (!order) throw fail('Recurso no encontrado.', 404, 'order_not_found')
    return publicOrder(order)
  }

  async function mine({ siteId, accountId, limit = 50 }) {
    const rows = await prisma.websiteOrder.findMany({ where: { siteId, externalAccountId: accountId, status: { not: 'cancelled' } }, orderBy: [{ orderNumber: 'desc' }], take: Math.min(Math.max(Number(limit) || 50, 1), 100), select: { ...SELECT, lines: true } })
    return rows.map((row) => { const order = publicOrder(row); return { ...order, customer: undefined } })
  }

  return { place, attachSession, cancel, confirm, verify, list, get, mine }
}
