// Website orders: public confirmation and customer view (site host), and the admin side (/website/sites/:siteId/orders*).
import { Hono } from 'hono'
import { readSessionCookie } from '../../services/external-identity/index.js'
import { requireWebsitePermission, websiteErrorHandler } from '../../services/website-authorization-service.js'
import { WEBSITE_REALM } from './accounts-routes.js'

const noStore = (c) => { c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff') }

/** The signed-in account of a site (cookie), or null. Never throws: a guest checkout is valid. */
export async function accountOfRequest({ c, identity, siteId }) {
  const token = readSessionCookie(c)
  if (!token) return null
  const realm = await identity.findRealm({ moduleKey: WEBSITE_REALM, ownerId: siteId }).catch(() => null)
  if (!realm) return null
  const found = await identity.sessionFromToken({ realm, token }).catch(() => null)
  return found?.account ?? null
}

export function createPublicOrdersRouter({ orders, identity }) {
  const app = new Hono()
  app.use('*', async (c, next) => { noStore(c); await next() })
  // The thanks page asks here, with the Stripe session id of the return URL. Stripe, not the URL, decides whether it was paid.
  app.get('/checkout/confirm', async (c) => {
    const siteId = c.req.header('X-Site-Id')
    if (!siteId) return c.json({ error: 'Falta siteId' }, 400)
    try {
      const order = await orders.confirm({ siteId, sessionId: c.req.query('session_id') })
      return c.json({ data: { number: order.orderNumber, status: order.status, total: Number(order.totalAmount), currency: order.currency } })
    } catch (error) { return websiteErrorHandler(error, c) }
  })
  app.get('/orders/mine', async (c) => {
    const siteId = c.req.header('X-Site-Id')
    if (!siteId) return c.json({ error: 'Falta siteId' }, 400)
    const account = await accountOfRequest({ c, identity, siteId })
    if (!account) return c.json({ error: 'Inicia sesión para continuar.', code: 'UNAUTHENTICATED' }, 401)
    try { return c.json({ data: await orders.mine({ siteId, accountId: account.id }) }) } catch (error) { return websiteErrorHandler(error, c) }
  })
  return app
}

export function createWebsiteOrdersAdminRouter({ orders, requirePermission }) {
  const app = new Hono()
  const read = requireWebsitePermission(requirePermission, 'website.orders.read')
  const manage = requireWebsitePermission(requirePermission, 'website.orders.manage')
  app.use('*', async (c, next) => { noStore(c); await next() })
  const scope = (c) => ({ companyId: c.get('companyId'), siteId: c.req.param('siteId') })
  app.get('/sites/:siteId/orders', read, async (c) => {
    try { return c.json({ data: await orders.list({ ...scope(c), status: c.req.query('status') || undefined, limit: c.req.query('limit'), cursor: c.req.query('cursor') }) }) } catch (error) { return websiteErrorHandler(error, c) }
  })
  app.get('/sites/:siteId/orders/:orderId', read, async (c) => {
    try { return c.json({ data: await orders.get({ ...scope(c), orderId: c.req.param('orderId') }) }) } catch (error) { return websiteErrorHandler(error, c) }
  })
  app.post('/sites/:siteId/orders/:orderId/verify', manage, async (c) => {
    try {
      const order = await orders.verify({ ...scope(c), orderId: c.req.param('orderId'), actorId: c.get('userId') ?? null })
      return c.json({ data: { id: order.id, number: order.orderNumber, status: order.status } })
    } catch (error) { return websiteErrorHandler(error, c) }
  })
  return app
}

