// runly.ticketing F6C on a real disposable PostgreSQL: paid tickets confirmed against
// real POS sales (opened session, cash payment, refunds through the POS router and SDK),
// partial cancellation (engine reducePartyTx), refund-before-void, managed booking spaces,
// event team and cashier access.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createRunlyClient } from '../../../../../../packages/sdk/src/index.js'
import { createBookingsCommandService } from '../../bookings/bookings-command-service.js'
import { createBookingsRouter } from '../../bookings/bookings-routes.js'
import { createPosRouter } from '../../pos/pos-routes.js'
import { createTicketingRouter } from '../ticketing-routes.js'
import { createTicketingCommandService } from '../ticketing-command-service.js'
import { createTicketingPaymentService } from '../ticketing-payment-service.js'

const url = process.env.TICKETING_TEST_DATABASE_URL || process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const H = 3600000
const POS_GRANTS = 'pos.caja.operate,pos.caja.close,pos.orders.cancel,pos.refunds.create,pos.discounts.apply'

describe('runly.ticketing box office (F6C) on real PostgreSQL', { skip: !url }, () => {
  let db, engine, cmd, pay, n = 0
  const tag = () => `tb-${Date.now()}-${++n}`
  const key = () => `tb-key-${crypto.randomUUID()}`
  const at = (hours) => new Date(Date.now() + hours * H).toISOString()
  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 30 }) })
    engine = createBookingsCommandService({ prisma: db })
    cmd = createTicketingCommandService({ prisma: db, engine })
    pay = createTicketingPaymentService({ prisma: db })
  })
  after(async () => { await db?.$disconnect() })

  const http = (app) => async (method, path, body, headers = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  function context(companyId, userId, grants, isAdmin = false) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', companyId); c.set('userId', userId); c.set('userContext', { isAdmin, permissionSet: new Set(grants), profile: { id: userId } }); return next() })
    const any = (keys) => async (c, next) => (keys.some((k) => c.get('userContext').permissionSet.has(k)) || c.get('userContext').isAdmin ? next() : c.json({ error: 'Sin permiso' }, 403))
    return { app, deps: { prisma: db, requirePermission: (k) => any([k]), requireAnyPermission: any } }
  }
  const ticketing = (companyId, userId, grants = ['ticketing.access', 'ticketing.events.manage']) => {
    const { app, deps } = context(companyId, userId, grants)
    app.route('', createTicketingRouter({ ...deps, engine, commands: cmd, payments: pay }))
    return http(app)
  }

  async function fixture() {
    const company = await db.company.create({ data: { name: `Teatro ${tag()}`, slug: tag() } })
    const actor = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Taquilla', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: company.id, userId: actor.id } })
    await db.posSettings.create({ data: { companyId: company.id, currency: 'MXN', defaultTaxRate: 0, pricesIncludeTax: true } })
    const outlet = await db.posOutlet.create({ data: { companyId: company.id, name: 'Taquilla', mode: 'RETAIL' } })
    const terminal = await db.posTerminal.create({ data: { companyId: company.id, outletId: outlet.id, name: 'Caja 1' } })
    const cash = await db.posPaymentMethod.create({ data: { companyId: company.id, name: 'Efectivo', code: 'cash', kind: 'CASH' } })
    const product = await db.catalogProduct.create({ data: { companyId: company.id, name: 'Boleto VIP', slug: tag(), price: 250, currency: 'MXN', trackStock: false } })
    const { app, deps } = context(company.id, actor.id, POS_GRANTS.split(','))
    app.route('', createPosRouter(deps))
    const pos = createRunlyClient({ baseUrl: 'https://example.test', getActiveCompanyId: () => company.id, fetch: async (u, o) => app.request(new URL(u).pathname + new URL(u).search, o) }).commerce
    const session = (await pos.openSession({ outletId: outlet.id, terminalId: terminal.id, openingCashAmount: '0.00' }, 'token', { idempotencyKey: key() })).data
    const api = ticketing(company.id, actor.id)
    const event = (await api('POST', '/ticketing/events', { title: 'Obra', slug: tag(), timezone: 'America/Mexico_City' })).body.data
    const fn = (await api('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: at(48), capacity: 10 })).body.data
    const vip = (await api('POST', `/ticketing/events/${event.id}/types`, { name: 'VIP', priceMode: 'pos', catalogProductId: product.id })).body.data
    const general = (await api('POST', `/ticketing/events/${event.id}/types`, { name: 'General' })).body.data
    return { company, actor, outlet, terminal, cash, product, pos, session, api, event, fn, vip, general }
  }
  async function sale(f, quantity, { paid = true, discount = null } = {}) {
    const o = (await f.pos.createOrder({ outletId: f.outlet.id, terminalId: f.terminal.id, sessionId: f.session.id, experience: 'RETAIL', fulfillmentType: 'TAKEAWAY' }, 'token', { idempotencyKey: key() })).data
    let order = (await f.pos.addLine(o.id, { expectedVersion: o.version, productId: f.product.id, quantity: String(quantity) }, 'token', { idempotencyKey: key() })).data
    if (discount) order = (await f.pos.discount(order.id, order.lines[0].id, { expectedVersion: order.version, amount: discount, reason: 'Cortesía' }, 'token', { idempotencyKey: key() })).data
    if (!paid) return order
    return (await f.pos.addPayment(order.id, { expectedVersion: order.version, paymentMethodId: f.cash.id, sessionId: f.session.id, amount: order.remainingAmount, tenderedAmount: order.remainingAmount }, 'token', { idempotencyKey: key() })).data.order
  }
  async function refund(f, posOrder, quantity) {
    const current = (await f.pos.getOrder(posOrder.id, 'token')).data
    const input = { expectedVersion: current.version, lines: [{ orderLineId: current.lines[0].id, quantity: String(quantity), restock: false }] }
    const quote = (await f.pos.refundPreview(current.id, input, 'token')).data
    return f.pos.refund(current.id, { ...input, sessionId: f.session.id, reason: 'Devolución de boletos', payments: quote.payments.filter((p) => Number(p.amount) > 0).map(({ paymentId, amount }) => ({ paymentId, amount })) }, 'token', { idempotencyKey: key() })
  }
  const hold = (f, quantity, typeId = f.vip.id) => cmd.reserve({ companyId: f.company.id, actorId: f.actor.id, input: { sessionId: f.fn.id, channel: 'box_office', items: [{ typeId, quantity }], buyer: { name: 'Comprador' } } })
  const seats = async (f) => (await db.$queryRaw`SELECT seats_taken FROM booking_session WHERE id = ${f.fn.bookingSessionId}::uuid`)[0].seats_taken
  const confirm = (f, orderId, posOrderId, idempotencyKey = key()) => f.api('POST', `/ticketing/orders/${orderId}/confirm-payment`, { posOrderId }, { 'Idempotency-Key': idempotencyKey })
  const valid = async (f, qr) => (await cmd.verifyCredential({ companyId: f.company.id, text: qr })).valid

  it('a paid order is held with a price snapshot and issues nothing until Caja is paid', async () => {
    const f = await fixture()
    const held = await hold(f, 2)
    assert.equal(held.order.status, 'PENDING_PAYMENT')
    assert.deepEqual([held.order.totals.currency, held.order.totals.amount, held.order.totals.items[0].unitPrice], ['MXN', '500.00', '250.00'])
    assert.equal(held.credentials.length, 0)
    const view = (await f.api('GET', `/ticketing/orders/${held.order.id}/sale`)).body.data
    assert.deepEqual(view.items, [{ productId: f.product.id, name: 'Boleto VIP', quantity: 2, unitPrice: '250.00' }])
    assert.equal((await confirm(f, held.order.id, crypto.randomUUID())).status, 404)
    const unpaid = await sale(f, 2, { paid: false })
    const r = await confirm(f, held.order.id, unpaid.id)
    assert.deepEqual([r.status, r.body.code], [409, 'PAYMENT_NOT_CONFIRMED'])
    const short = await sale(f, 1)
    const m = await confirm(f, held.order.id, short.id)
    assert.deepEqual([m.status, m.body.code], [422, 'SALE_MISMATCH'], JSON.stringify(m.body))
    const discounted = await sale(f, 2, { discount: '10.00' })
    assert.equal((await confirm(f, held.order.id, discounted.id)).body.code, 'SALE_MISMATCH')
    assert.equal((await db.ticket.count({ where: { orderId: held.order.id, status: 'ISSUED' } })), 0)
  })

  it('a real paid POS sale confirms once: concurrent retries, another order and another company are refused', async () => {
    const f = await fixture()
    const held = await hold(f, 2)
    const paid = await sale(f, 2)
    const candidates = (await f.api('GET', `/ticketing/orders/${held.order.id}/payment-candidates`)).body.data
    assert.ok(candidates.some((c) => c.posOrderId === paid.id && c.matches))
    const k = key()
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => confirm(f, held.order.id, paid.id, i < 3 ? k : key())))
    assert.ok(results.every((r) => r.status === 200), results.map((r) => r.status).join())
    const issuing = results.filter((r) => r.body.credentials.length)
    assert.equal(issuing.length, 1, 'exactly one confirmation issued credentials')
    assert.equal(issuing[0].body.credentials.length, 2)
    assert.equal(issuing[0].body.data.status, 'CONFIRMED')
    for (const c of issuing[0].body.credentials) assert.ok(await valid(f, c.qr))
    assert.equal(await seats(f), 2, 'confirming never takes seats again')
    assert.equal(await db.ticketHistory.count({ where: { entityId: held.order.id, action: 'confirm_payment' } }), 1)
    assert.equal(await db.domainEventOutbox.count({ where: { companyId: f.company.id, event: 'ticketing.order.confirmed' } }), 1)
    const other = await hold(f, 2)
    const reuse = await confirm(f, other.order.id, paid.id)
    assert.deepEqual([reuse.status, reuse.body.code], [409, 'SALE_ALREADY_USED'])
    const g = await fixture()
    const theirs = await hold(g, 2)
    assert.equal((await confirm(g, theirs.order.id, paid.id)).status, 404, 'a sale of another company does not exist here')
    assert.equal((await g.api('GET', `/ticketing/orders/${held.order.id}`)).status, 404)
  })

  it('an expired hold cannot be paid afterwards; the cashier refunds instead', async () => {
    let clock = Date.now()
    const timed = createTicketingPaymentService({ prisma: db, now: () => clock })
    const expiring = createTicketingCommandService({ prisma: db, engine, now: () => clock })
    const f = await fixture()
    const held = await hold(f, 1)
    const paid = await sale(f, 1)
    clock += 20 * 60000
    assert.equal((await expiring.expireHolds({ companyId: f.company.id })).expired, 1)
    await assert.rejects(timed.confirmPayment({ companyId: f.company.id, actorId: f.actor.id, orderId: held.order.id, posOrderId: paid.id }), (e) => e.code === 'HOLD_EXPIRED')
    assert.equal(await seats(f), 0)
  })

  it('partial cancellation frees only those seats; refund comes before voiding paid tickets', async () => {
    const f = await fixture()
    const free = await cmd.reserve({ companyId: f.company.id, actorId: f.actor.id, input: { sessionId: f.fn.id, channel: 'box_office', items: [{ typeId: f.general.id, quantity: 4 }] } })
    const [a, b, c, d] = free.order.tickets
    const part = await f.api('POST', `/ticketing/orders/${free.order.id}/cancel`, { ticketIds: [a.id, b.id], reason: 'Dos no vienen' }, { 'Idempotency-Key': key() })
    assert.equal(part.status, 200, JSON.stringify(part.body))
    assert.equal(part.body.data.status, 'CONFIRMED')
    assert.equal(await seats(f), 2)
    assert.equal((await db.booking.findUnique({ where: { id: free.order.bookingId } })).partySize, 2)
    const qr = (id) => free.credentials.find((x) => x.ticketId === id).qr
    assert.deepEqual([await valid(f, qr(a.id)), await valid(f, qr(c.id)), await valid(f, qr(d.id))], [false, true, true])
    assert.equal((await db.$queryRaw`SELECT issued FROM ticket_quota WHERE ticket_type_id = ${f.general.id}::uuid AND session_id = ${f.fn.id}::uuid`)[0].issued, 2)
    const rest = await f.api('POST', `/ticketing/orders/${free.order.id}/cancel`, {}, { 'Idempotency-Key': key() })
    assert.deepEqual([rest.body.data.status, await seats(f)], ['CANCELLED', 0])
    assert.equal((await db.booking.findUnique({ where: { id: free.order.bookingId } })).status, 'CANCELLED')

    const held = await hold(f, 2)
    assert.equal((await f.api('POST', `/ticketing/orders/${held.order.id}/cancel`, { ticketIds: [held.order.tickets[0].id] })).body.code, 'PARTIAL_UNPAID')
    const paid = await sale(f, 2)
    const confirmed = (await confirm(f, held.order.id, paid.id)).body
    const [t1, t2] = confirmed.data.tickets
    const blocked = await f.api('POST', `/ticketing/orders/${held.order.id}/cancel`, { ticketIds: [t1.id] })
    assert.deepEqual([blocked.status, blocked.body.code], [409, 'REFUND_REQUIRED'])
    assert.equal(await valid(f, confirmed.credentials[0].qr), true, 'nothing voided without the refund')
    await refund(f, paid, 1)
    const one = await f.api('POST', `/ticketing/orders/${held.order.id}/cancel`, { ticketIds: [t1.id] }, { 'Idempotency-Key': key() })
    assert.deepEqual([one.status, one.body.data.status, await seats(f)], [200, 'CONFIRMED', 1])
    assert.equal((await f.api('POST', `/ticketing/orders/${held.order.id}/cancel`, { ticketIds: [t2.id] })).body.code, 'REFUND_REQUIRED', 'one refund voids one ticket')
    await refund(f, paid, 1)
    const last = await f.api('POST', `/ticketing/orders/${held.order.id}/cancel`, { ticketIds: [t2.id] }, { 'Idempotency-Key': key() })
    assert.deepEqual([last.body.data.status, await seats(f)], ['REFUNDED', 0])
    assert.ok((await db.ticket.findMany({ where: { orderId: held.order.id } })).every((t) => t.status === 'CANCELLED' && t.posRefundId))
    assert.equal(await db.domainEventOutbox.count({ where: { companyId: f.company.id, event: 'ticketing.order.refunded' } }), 1)
  })

  it('the event space is read-only in Reservaciones and points to its event', async () => {
    const f = await fixture()
    const { app, deps } = context(f.company.id, f.actor.id, ['bookings.access'], true)
    app.route('', createBookingsRouter({ ...deps, env: { BOOKINGS_LINK_SECRET: 'x' } }))
    const bookings = http(app)
    const space = (await bookings('GET', `/bookings/spaces/${f.event.spaceId}`)).body.data
    assert.deepEqual([space.ownerModule, space.ownerId], ['runly.ticketing', f.event.id])
    assert.ok((await bookings('GET', '/bookings/spaces')).body.data.some((s) => s.id === f.event.spaceId && s.ownerModule === 'runly.ticketing'))
    for (const [method, path, body] of [
      ['PATCH', `/bookings/spaces/${f.event.spaceId}`, { name: 'Otro' }],
      ['POST', `/bookings/spaces/${f.event.spaceId}/sessions`, { serviceId: crypto.randomUUID(), startsAt: at(30) }],
      ['PUT', `/bookings/spaces/${f.event.spaceId}/members/${f.actor.id}`, { role: 'viewer' }],
    ]) {
      const r = await bookings(method, path, body)
      assert.deepEqual([r.status, r.body.code], [409, 'MANAGED_SPACE'], `${method} ${path}`)
    }
    const order = await hold(f, 1, f.general.id)
    assert.equal((await bookings('POST', `/bookings/reservations/${order.order.bookingId}/cancel`, {})).body.code, 'MANAGED_SPACE')
  })

  it('event team: roles from the event, last admin kept; cashiers only load and confirm sales', async () => {
    const f = await fixture()
    const agent = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Agente', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: f.company.id, userId: agent.id } })
    assert.equal((await f.api('PUT', `/ticketing/events/${f.event.id}/members/${agent.id}`, { role: 'agent' })).status, 200)
    const members = (await f.api('GET', `/ticketing/events/${f.event.id}/members`)).body.data
    assert.deepEqual(members.map((m) => m.role).sort(), ['admin', 'agent'])
    assert.equal((await f.api('DELETE', `/ticketing/events/${f.event.id}/members/${f.actor.id}`)).body.code, 'LAST_ADMIN')
    const asAgent = ticketing(f.company.id, agent.id, ['ticketing.access'])
    assert.equal((await asAgent('POST', '/ticketing/orders', { sessionId: f.fn.id, items: [{ typeId: f.general.id, quantity: 1 }] })).status, 201)
    assert.equal((await asAgent('PATCH', `/ticketing/events/${f.event.id}`, { title: 'X' })).status, 403)
    const cashierId = (await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Cajera', email: `${tag()}@example.test` } })).id
    const cashier = ticketing(f.company.id, cashierId, ['pos.caja.operate'])
    const held = await hold(f, 1)
    assert.equal((await cashier('GET', `/ticketing/orders/${held.order.id}/sale`)).status, 200)
    assert.equal((await cashier('GET', `/ticketing/events/${f.event.id}`)).status, 403)
    const paid = await sale(f, 1)
    const r = await cashier('POST', `/ticketing/orders/${held.order.id}/confirm-payment`, { posOrderId: paid.id }, { 'Idempotency-Key': key() })
    assert.deepEqual([r.status, r.body.credentials.length], [200, 1])
    assert.equal((await ticketing(f.company.id, cashierId, [])('GET', `/ticketing/orders/${held.order.id}/sale`)).status, 403)
  })
})
