import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createWebsiteOrdersService } from '../website-orders-service.js'
import { createPublicCheckoutRouter } from '../../routes/website/checkout-routes.js'
import { createPublicOrdersRouter, createWebsiteOrdersAdminRouter } from '../../routes/website/orders-routes.js'

const companyId = '00000000-0000-4000-8000-000000000001', siteId = '00000000-0000-4000-8000-000000000002', otherSite = '00000000-0000-4000-8000-000000000009'
const productId = '00000000-0000-4000-8000-0000000000a1'

// In-memory stand-in for the Prisma surface the orders service uses.
function fakePrisma({ stripeKey = 'enc', products = [{ id: productId, name: 'Tenis', price: 120, currency: 'MXN' }] } = {}) {
  const state = { orders: [], lines: [], contacts: [], audits: [], accounts: [{ id: 'acc-1', companyId, contactId: null }] }
  let sequence = 0
  const match = (order, where = {}) => Object.entries(where).every(([key, value]) => (value && typeof value === 'object' && 'lt' in value ? order[key] < value.lt : value && typeof value === 'object' && 'not' in value ? order[key] !== value.not : order[key] === value))
  const withLines = (order, select) => (select?.lines ? { ...order, lines: state.lines.filter((l) => l.orderId === order.id) } : { ...order })
  const tx = {
    $queryRaw: async (strings) => (String(strings[0]).includes('catalog_product') ? products : String(strings[0]).includes('stripe_secret_key') ? [{ stripe_secret_key: stripeKey, stripe_success_message: null, company_id: companyId }] : []),
    websiteOrder: {
      aggregate: async ({ where }) => ({ _max: { orderNumber: Math.max(0, ...state.orders.filter((o) => o.siteId === where.siteId).map((o) => o.orderNumber)) || null } }),
      create: async ({ data, select }) => {
        const { lines, ...rest } = data
        const order = { id: `order-${++sequence}`, status: 'pending', stripeSessionId: null, customerEmail: null, customerName: null, contactId: null, externalAccountId: null, paidAt: null, createdAt: new Date(), subtotalAmount: 0, ...rest }
        state.orders.push(order)
        for (const line of lines?.create ?? []) state.lines.push({ ...line, orderId: order.id })
        return withLines(order, select)
      },
      update: async ({ where, data }) => Object.assign(state.orders.find((o) => o.id === where.id), data),
      updateMany: async ({ where, data }) => { const rows = state.orders.filter((o) => match(o, where)); rows.forEach((o) => Object.assign(o, data)); return { count: rows.length } },
      findFirst: async ({ where, select }) => { const order = state.orders.find((o) => match(o, where)); return order ? withLines(order, select) : null },
      findMany: async ({ where, take, select }) => state.orders.filter((o) => match(o, where)).sort((a, b) => b.orderNumber - a.orderNumber).slice(0, take).map((o) => withLines(o, select)),
    },
    websiteSite: { findFirst: async ({ where }) => (where.id === siteId ? { companyId, stripeSecretKey: stripeKey } : null) },
    contact: {
      findFirst: async ({ where }) => state.contacts.find((c) => c.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null,
      create: async ({ data }) => { const row = { id: `contact-${state.contacts.length + 1}`, ...data }; state.contacts.push(row); return row },
    },
    externalAccount: { findFirst: async ({ where }) => state.accounts.find((a) => a.id === where.id) ?? null },
    auditLog: { create: async ({ data }) => { state.audits.push(data) } },
  }
  return { state, prisma: { ...tx, $transaction: async (run) => run(tx) } }
}

function fakeStripe({ paid = true, email = 'ana@example.test', fail = false } = {}) {
  const calls = { created: [], retrieved: [] }
  class Stripe {
    checkout = {
      sessions: {
        create: async (args) => { if (fail) throw new Error('boom'); calls.created.push(args); return { id: `cs_test_${calls.created.length}00000000`, url: 'https://checkout.stripe.test/pay' } },
        retrieve: async (id) => { calls.retrieved.push(id); return { id, payment_status: paid ? 'paid' : 'unpaid', customer_details: { email, name: 'Ana Pérez' } } },
      },
    }
  }
  return { Stripe, calls }
}

const build = (options = {}, stripeOptions = {}) => {
  const db = fakePrisma(options), stripe = fakeStripe(stripeOptions)
  const orders = createWebsiteOrdersService({ prisma: db.prisma, StripeImpl: stripe.Stripe, decryptPasswordImpl: (v) => v })
  return { ...db, stripe, orders }
}
const checkoutApp = (ctx, identity = null) => { const app = new Hono(); app.route('/', createPublicCheckoutRouter({ prisma: ctx.prisma, StripeImpl: ctx.stripe.Stripe, decryptPasswordImpl: (v) => v, orders: ctx.orders, identity })); app.route('/', createPublicOrdersRouter({ orders: ctx.orders, identity })); return app }
const pay = (app, body = { items: [{ productId, qty: 2, price: 1, currency: 'USD' }] }) => app.request('/checkout', { method: 'POST', headers: { 'X-Site-Id': siteId, 'Content-Type': 'application/json', Origin: 'https://shop.example.test' }, body: JSON.stringify(body) })

test('checkout stores a pending order with server prices before the payment page', async () => {
  const ctx = build(), res = await pay(checkoutApp(ctx))
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.deepEqual([json.url, json.orderNumber], ['https://checkout.stripe.test/pay', 1])
  const [order] = ctx.state.orders
  assert.deepEqual([order.status, order.currency, Number(order.totalAmount), order.stripeSessionId], ['pending', 'mxn', 240, 'cs_test_100000000'])
  assert.deepEqual(ctx.state.lines.map((l) => [l.productId, l.name, Number(l.unitPrice), l.quantity]), [[productId, 'Tenis', 120, 2]], 'client price and currency are ignored')
  assert.equal(ctx.stripe.calls.created[0].client_reference_id, order.id)
})

test('order numbers are sequential per site and a failed payment page cancels the order', async () => {
  const ctx = build()
  await pay(checkoutApp(ctx)); await pay(checkoutApp(ctx))
  assert.deepEqual(ctx.state.orders.map((o) => o.orderNumber), [1, 2])
  const broken = build({}, { fail: true })
  const res = await pay(checkoutApp(broken))
  assert.equal(res.status, 500)
  assert.deepEqual(broken.state.orders.map((o) => o.status), ['cancelled'])
})

test('mixed currencies and an empty cart create no order', async () => {
  const ctx = build({ products: [{ id: productId, name: 'A', price: 1, currency: 'MXN' }, { id: '00000000-0000-4000-8000-0000000000a2', name: 'B', price: 1, currency: 'USD' }] })
  const res = await pay(checkoutApp(ctx), { items: [{ productId, qty: 1 }, { productId: '00000000-0000-4000-8000-0000000000a2', qty: 1 }] })
  assert.equal(res.status, 400)
  assert.equal((await pay(checkoutApp(ctx), { items: [] })).status, 400)
  assert.equal(ctx.state.orders.length, 0)
})

test('confirm marks the order paid once, links one customer contact and is idempotent', async () => {
  const ctx = build(), app = checkoutApp(ctx)
  await pay(app)
  const confirm = () => app.request('/checkout/confirm?session_id=cs_test_100000000', { headers: { 'X-Site-Id': siteId } })
  const [first, second] = [await confirm(), await confirm()]
  assert.deepEqual([first.status, second.status], [200, 200])
  assert.deepEqual((await first.json()).data, { number: 1, status: 'paid', total: 240, currency: 'mxn' })
  assert.equal(ctx.state.contacts.length, 1)
  assert.deepEqual([ctx.state.contacts[0].email, ctx.state.contacts[0].tags], ['ana@example.test', ['cliente-web']])
  assert.equal(ctx.state.orders[0].contactId, 'contact-1')
  assert.equal(ctx.state.audits.filter((a) => a.action === 'website.order.paid').length, 1)
  assert.equal(first.headers.get('cache-control'), 'no-store')
})

test('an existing contact with the paid email is linked, never duplicated or overwritten', async () => {
  const ctx = build(); ctx.state.contacts.push({ id: 'contact-existing', email: 'ANA@example.test', name: 'Ana' })
  const app = checkoutApp(ctx); await pay(app)
  await app.request('/checkout/confirm?session_id=cs_test_100000000', { headers: { 'X-Site-Id': siteId } })
  assert.equal(ctx.state.contacts.length, 1)
  assert.equal(ctx.state.orders[0].contactId, 'contact-existing')
})

test('an unpaid session stays pending; unknown, malformed and foreign sessions are 404', async () => {
  const ctx = build({}, { paid: false }), app = checkoutApp(ctx)
  await pay(app)
  assert.equal((await app.request('/checkout/confirm?session_id=cs_test_100000000', { headers: { 'X-Site-Id': siteId } })).status, 409)
  assert.equal(ctx.state.orders[0].status, 'pending')
  for (const [session, site] of [['cs_test_unknown0000', siteId], ['not-a-session', siteId], ['cs_test_100000000', otherSite], [undefined, siteId]]) {
    const res = await app.request(`/checkout/confirm${session ? `?session_id=${session}` : ''}`, { headers: { 'X-Site-Id': site } })
    assert.equal(res.status, 404, String(session))
  }
  assert.equal((await app.request('/checkout/confirm?session_id=cs_test_100000000')).status, 400)
})

test('a signed-in account is linked to its order and sees only its own orders', async () => {
  const ctx = build()
  const identity = {
    findRealm: async () => ({ id: 'realm-1' }),
    sessionFromToken: async ({ token }) => (token === 'good' ? { account: { id: 'acc-1' } } : token === 'other' ? { account: { id: 'acc-2' } } : null),
  }
  const app = checkoutApp(ctx, identity)
  const buy = (cookie) => app.request('/checkout', { method: 'POST', headers: { 'X-Site-Id': siteId, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ items: [{ productId, qty: 1 }] }) })
  await buy('rx_session=good'); await buy(null); await buy('rx_session=forged')
  assert.deepEqual(ctx.state.orders.map((o) => o.externalAccountId), ['acc-1', null, null])
  const mine = async (cookie) => app.request('/orders/mine', { headers: { 'X-Site-Id': siteId, ...(cookie ? { Cookie: cookie } : {}) } })
  const own = await mine('rx_session=good')
  assert.equal(own.status, 200)
  const body = (await own.json()).data
  assert.deepEqual(body.map((o) => o.number), [1])
  assert.equal(body[0].customer, undefined, 'the customer view never repeats personal data')
  assert.deepEqual((await (await mine('rx_session=other')).json()).data, [])
  assert.equal((await mine(null)).status, 401)
  assert.equal((await mine('rx_session=forged')).status, 401)
})

test('admin: list, detail and verify are scoped to the site and company', async () => {
  const ctx = build(), app = checkoutApp(ctx)
  await pay(app); await pay(app)
  const adminApp = new Hono()
  adminApp.use('*', async (c, next) => { c.set('companyId', c.req.header('X-Company') ?? companyId); await next() })
  adminApp.route('/', createWebsiteOrdersAdminRouter({ orders: ctx.orders, requirePermission: () => async (c, next) => next() }))
  const list = await (await adminApp.request(`/sites/${siteId}/orders?status=pending`)).json()
  assert.deepEqual(list.data.items.map((o) => o.number), [2, 1])
  const page = await (await adminApp.request(`/sites/${siteId}/orders?limit=1`)).json()
  assert.deepEqual([page.data.items.length, page.data.next], [1, 2])
  assert.equal((await (await adminApp.request(`/sites/${siteId}/orders?limit=1&cursor=2`)).json()).data.items[0].number, 1)
  assert.equal((await adminApp.request(`/sites/${siteId}/orders?status=hacked`)).status, 422)
  const detail = await (await adminApp.request(`/sites/${siteId}/orders/${ctx.state.orders[0].id}`)).json()
  assert.deepEqual([detail.data.lines[0].name, detail.data.lines[0].quantity], ['Tenis', 2])
  assert.equal((await adminApp.request(`/sites/${siteId}/orders/${ctx.state.orders[0].id}`, { headers: { 'X-Company': '00000000-0000-4000-8000-0000000000ff' } })).status, 404)
  const verified = await adminApp.request(`/sites/${siteId}/orders/${ctx.state.orders[0].id}/verify`, { method: 'POST' })
  assert.deepEqual([verified.status, (await verified.json()).data.status], [200, 'paid'])
  assert.ok(ctx.state.audits.some((a) => a.action === 'website.order.verify'))
})

test('a site without Stripe cannot confirm and the order service refuses empty carts', async () => {
  const ctx = build({ stripeKey: null })
  await assert.rejects(ctx.orders.place({ companyId, siteId, lines: [] }), { code: 'validation_failed' })
  const order = await ctx.orders.place({ companyId, siteId, lines: [{ productId, name: 'x', price: 1, qty: 1, currency: 'MXN' }] })
  await ctx.orders.attachSession(order.id, 'cs_test_abcdefghi')
  await assert.rejects(ctx.orders.confirm({ siteId, sessionId: 'cs_test_abcdefghi' }), { code: 'stripe_not_configured' })
})

test('install request: accountsMode is optional, limited to keep|enable and never defaulted into the receipt hash', async () => {
  const { installRequestSchema } = await import('../marketplace/website-import-service.js')
  const base = { ref: { resourceKey: 'acme.tienda', version: '1.0.0', releaseId: '00000000-0000-4000-8000-000000000003' }, pageIds: ['/'], expectedRevision: 1, includeTheme: true, acceptWarnings: true }
  const plain = installRequestSchema.safeParse(base)
  assert.equal(plain.success, true, JSON.stringify(plain.error?.issues))
  assert.equal(Object.hasOwn(plain.data, 'accountsMode'), false)
  assert.equal(installRequestSchema.parse({ ...base, accountsMode: 'enable' }).accountsMode, 'enable')
  assert.equal(installRequestSchema.safeParse({ ...base, accountsMode: 'always' }).success, false)
})
