// runly.ticketing F6B on a real disposable PostgreSQL (TICKETING_TEST_DATABASE_URL or
// BOOKINGS_TEST_DATABASE_URL, localhost only): issuance through the Booking Engine,
// concurrency on the last seats, idempotency, isolation, credentials, outbox, rollback.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsCommandService } from '../../bookings/bookings-command-service.js'
import { createBookingsCalendarProjection } from '../../bookings/bookings-calendar.js'
import { createTicketingRouter } from '../ticketing-routes.js'
import { createTicketingCommandService } from '../ticketing-command-service.js'

const url = process.env.TICKETING_TEST_DATABASE_URL || process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const H = 3600000

describe('runly.ticketing core (F6B) on real PostgreSQL', { skip: !url }, () => {
  let db, engine, cmd, n = 0
  const tag = () => `tk-${Date.now()}-${++n}`
  const key = () => `tk-key-${crypto.randomUUID()}`
  const at = (hours) => new Date(Date.now() + hours * H).toISOString()

  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 30 }) })
    engine = createBookingsCommandService({ prisma: db })
    cmd = createTicketingCommandService({ prisma: db, engine })
  })
  after(async () => { await db?.$disconnect() })

  // Router as a given user: grants = permission keys; admin = ticketing.admin bypass.
  function api(companyId, userId, grants = ['ticketing.access', 'ticketing.events.manage']) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', companyId); c.set('userContext', { isAdmin: false, permissionSet: new Set(grants), profile: { id: userId } }); return next() })
    const requirePermission = (k) => async (c, next) => (c.get('userContext').permissionSet.has(k) ? next() : c.json({ error: 'Sin permiso' }, 403))
    app.route('', createTicketingRouter({ prisma: db, requirePermission, engine, commands: cmd }))
    return async (method, path, body, headers = {}) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: res.status, body: await res.json().catch(() => null) }
    }
  }

  async function person(companyId, name) {
    const user = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: name, email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId, userId: user.id } })
    return user
  }

  // Company, organizer, event, one function and one free type.
  async function fixture({ capacity = 10, quota = null, policy = {} } = {}) {
    const company = await db.company.create({ data: { name: `Teatro ${tag()}`, slug: tag() } })
    const organizer = await person(company.id, 'Organizadora')
    const http = api(company.id, organizer.id)
    const event = (await http('POST', '/ticketing/events', { title: 'Concierto', slug: tag(), timezone: 'America/Mexico_City', durationMinutes: 120, policy })).body.data
    assert.ok(event?.id, 'event created')
    const session = (await http('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: at(48), capacity })).body.data
    const type = (await http('POST', `/ticketing/events/${event.id}/types`, { name: 'General' })).body.data
    if (quota != null) assert.equal((await http('PUT', `/ticketing/types/${type.id}/quotas/${session.id}`, { quota })).status, 200)
    return { company, organizer, http, event, session, type }
  }
  const order = (f, quantity = 1, extra = {}) => ({ sessionId: f.session.id, channel: 'box_office', items: [{ typeId: f.type.id, quantity }], ...extra })
  const reserve = (f, quantity = 1, extra = {}, idempotencyKey = null) => cmd.reserve({ companyId: f.company.id, actorId: f.organizer.id, input: order(f, quantity, extra), idempotencyKey })
  const seats = async (f) => (await db.$queryRaw`SELECT seats_taken FROM booking_session WHERE id = ${f.session.bookingSessionId}::uuid`)[0].seats_taken
  const issued = async (f, typeId = f.type.id) => (await db.$queryRaw`SELECT issued FROM ticket_quota WHERE ticket_type_id = ${typeId}::uuid AND session_id = ${f.session.id}::uuid`)[0].issued
  const valid = async (f, qr) => (await cmd.verifyCredential({ companyId: f.company.id, text: qr })).valid

  it('the function lives in the Booking Engine and a free order issues tickets with credentials', async () => {
    const f = await fixture({ capacity: 10 })
    assert.equal(f.session.capacity, 10)
    const r = await f.http('POST', '/ticketing/orders', order(f, 2, { buyer: { name: 'Ana Pérez', email: 'ana@example.test' } }), { 'Idempotency-Key': key() })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.data.status, 'CONFIRMED')
    assert.equal(r.body.data.tickets.length, 2)
    assert.ok(r.body.data.tickets.every((t) => t.status === 'ISSUED' && t.credentialVersion === 1))
    assert.equal(r.body.credentials.length, 2)
    const booking = (await db.$queryRaw`SELECT * FROM booking WHERE id = ${r.body.data.bookingId}::uuid`)[0]
    assert.deepEqual([booking.status, booking.party_size, booking.source_module, booking.guest_name, booking.guest_email, booking.contact_id], ['CONFIRMED', 2, 'runly.ticketing', null, null, null])
    assert.equal(await seats(f), 2)
    assert.equal(await issued(f), 2)
    for (const c of r.body.credentials) assert.ok(await valid(f, c.qr))
  })

  it('50 simultaneous buyers for the last 5 seats of the room: exactly 5 tickets', async () => {
    const f = await fixture({ capacity: 10 })
    assert.equal((await reserve(f, 5)).order.status, 'CONFIRMED')
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => reserve(f, 1)))
    const won = results.filter((r) => r.status === 'fulfilled')
    const lost = results.filter((r) => r.status === 'rejected')
    assert.equal(won.length, 5, lost.map((r) => r.reason?.code ?? r.reason?.message).slice(0, 3).join(','))
    assert.ok(lost.every((r) => r.reason?.code === 'SESSION_FULL'), [...new Set(lost.map((r) => r.reason?.code ?? r.reason?.message))].join(','))
    assert.equal(await seats(f), 10)
    assert.equal(await issued(f), 10)
    const counts = (await db.$queryRaw`SELECT count(*)::int AS n FROM ticket WHERE session_id = ${f.session.id}::uuid AND status = 'ISSUED'`)[0].n
    assert.equal(counts, 10)
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_order WHERE session_id = ${f.session.id}::uuid`)[0].n, 6, 'no orphan orders')
  })

  it('50 simultaneous buyers for the last 5 of a type quota: exactly 5 tickets, seats follow', async () => {
    const f = await fixture({ capacity: 100, quota: 10 })
    await reserve(f, 5)
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => reserve(f, 1)))
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5)
    assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason?.code === 'SOLD_OUT'))
    assert.equal(await issued(f), 10)
    assert.equal(await seats(f), 10, 'refused buyers left no seats taken')
  })

  it('idempotent retry replays the order; a concurrent duplicate issues once; another payload is 422', async () => {
    const f = await fixture({ capacity: 20 })
    const k = key()
    const first = await f.http('POST', '/ticketing/orders', order(f, 2), { 'Idempotency-Key': k })
    const again = await f.http('POST', '/ticketing/orders', order(f, 2), { 'Idempotency-Key': k })
    assert.deepEqual([first.status, again.status, again.body.replayed], [201, 200, true])
    assert.equal(again.body.data.id, first.body.data.id)
    assert.deepEqual(again.body.credentials, [], 'secrets are never stored, so a replay cannot repeat them')
    assert.equal(await issued(f), 2)
    const k2 = key()
    const both = await Promise.all([reserve(f, 3, {}, k2), reserve(f, 3, {}, k2)])
    assert.equal(both[0].order.id, both[1].order.id)
    assert.equal(both.filter((r) => r.replayed).length, 1)
    assert.equal(await issued(f), 5)
    assert.equal(await seats(f), 5)
    const reused = await f.http('POST', '/ticketing/orders', order(f, 1), { 'Idempotency-Key': k })
    assert.equal(reused.status, 422)
    assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED')
  })

  it('a failed transaction leaves no quota, seats, order, tickets, booking or idempotency record', async () => {
    const f = await fixture({ capacity: 10 })
    const k = key()
    const before = { seats: await seats(f), issued: await issued(f), orders: await db.ticketOrder.count({ where: { companyId: f.company.id } }), bookings: await db.booking.count({ where: { companyId: f.company.id } }), outbox: await db.domainEventOutbox.count({ where: { companyId: f.company.id } }) }
    await assert.rejects(cmd.reserve({ companyId: f.company.id, actorId: f.organizer.id, input: order(f, 3), idempotencyKey: k, beforeCommit: async () => { throw new Error('simulated failure after issuing') } }), /simulated failure/)
    assert.deepEqual({ seats: await seats(f), issued: await issued(f), orders: await db.ticketOrder.count({ where: { companyId: f.company.id } }), bookings: await db.booking.count({ where: { companyId: f.company.id } }), outbox: await db.domainEventOutbox.count({ where: { companyId: f.company.id } }) }, before)
    assert.equal(await db.ticket.count({ where: { companyId: f.company.id } }), 0)
    const retry = await reserve(f, 3, {}, k)
    assert.equal(retry.replayed, false, 'the key was not consumed by the failed attempt')
  })

  it('companies are isolated: no reads, sales, cancellations or credentials across them', async () => {
    const a = await fixture()
    const b = await fixture()
    const sale = await reserve(a, 1)
    const qr = sale.credentials[0].qr
    assert.equal((await b.http('GET', `/ticketing/events/${a.event.id}`)).status, 404)
    assert.equal((await b.http('POST', '/ticketing/orders', order(a, 1), { 'Idempotency-Key': key() })).status, 404)
    assert.equal((await b.http('GET', `/ticketing/orders/${sale.order.id}`)).status, 404)
    assert.equal((await b.http('POST', `/ticketing/orders/${sale.order.id}/cancel`, {})).status, 404)
    assert.equal((await b.http('POST', `/ticketing/tickets/${sale.order.tickets[0].id}/reissue`, {})).status, 404)
    assert.equal((await b.http('PUT', `/ticketing/types/${a.type.id}/quotas/${a.session.id}`, { quota: 1 })).status, 404)
    assert.ok(!(await b.http('GET', '/ticketing/events')).body.data.some((e) => e.id === a.event.id))
    await assert.rejects(cmd.reserve({ companyId: b.company.id, actorId: b.organizer.id, input: order(a, 1) }), (e) => e.status === 404)
    assert.equal((await cmd.verifyCredential({ companyId: b.company.id, text: qr })).valid, false)
    assert.equal(await valid(a, qr), true)
    // Inside one company: no membership and no ticketing.admin -> 403; a viewer cannot sell.
    const stranger = await person(a.company.id, 'Sin rol')
    assert.equal((await api(a.company.id, stranger.id)('GET', `/ticketing/events/${a.event.id}`)).status, 403)
    await db.bookingSpaceMember.create({ data: { companyId: a.company.id, spaceId: a.event.spaceId, userId: stranger.id, role: 'viewer' } })
    assert.equal((await api(a.company.id, stranger.id)('GET', `/ticketing/events/${a.event.id}`)).status, 200)
    assert.equal((await api(a.company.id, stranger.id)('POST', '/ticketing/orders', order(a, 1))).status, 403)
    assert.equal((await api(a.company.id, stranger.id, ['ticketing.access'])('POST', '/ticketing/events', { title: 'X', slug: tag(), timezone: 'UTC' })).status, 403)
  })

  it('reissue and transfer replace the credential: earlier QRs stop validating; only hashes are stored', async () => {
    const f = await fixture()
    const sale = await reserve(f, 1, { buyer: { name: 'Ana Pérez' } })
    const ticketId = sale.order.tickets[0].id
    const v1 = sale.credentials[0].qr
    const secret = v1.split('.')[2]
    const row = await db.ticket.findUnique({ where: { id: ticketId } })
    assert.ok(!JSON.stringify(row).includes(secret), 'the QR secret is not in the database')
    assert.match(row.credentialHash, /^[0-9a-f]{64}$/)
    const re = await f.http('POST', `/ticketing/tickets/${ticketId}/reissue`, {}, { 'Idempotency-Key': key() })
    assert.equal(re.status, 200, JSON.stringify(re.body))
    assert.equal(re.body.data.credentialVersion, 2)
    assert.equal(await valid(f, v1), false)
    assert.equal(await valid(f, re.body.credential.qr), true)
    const moved = await f.http('POST', `/ticketing/tickets/${ticketId}/transfer`, { holderName: 'Luis Gómez', holderEmail: 'luis@example.test' }, { 'Idempotency-Key': key() })
    assert.equal(moved.status, 200, JSON.stringify(moved.body))
    assert.deepEqual([moved.body.data.holderName, moved.body.data.credentialVersion], ['Luis Gómez', 3])
    assert.equal(await valid(f, re.body.credential.qr), false)
    assert.equal(await valid(f, moved.body.credential.qr), true)
    // Forged secret and garbage answer exactly like an unknown ticket.
    assert.deepEqual(await cmd.verifyCredential({ companyId: f.company.id, text: `RT1.${ticketId}.${'A'.repeat(43)}` }), { valid: false, reason: 'unknown' })
    assert.deepEqual(await cmd.verifyCredential({ companyId: f.company.id, text: 'hola' }), { valid: false, reason: 'unknown' })
    const actions = (await db.ticketHistory.findMany({ where: { entityId: ticketId }, orderBy: { createdAt: 'asc' } })).map((h) => h.action)
    assert.deepEqual(actions, ['reissue', 'transfer'])
    await assert.rejects(db.$executeRaw`DELETE FROM ticket_history WHERE entity_id = ${ticketId}::uuid`, /append-only/)
  })

  it('transfer follows the event policy', async () => {
    const f = await fixture({ policy: { transferAllowed: false } })
    const sale = await reserve(f, 1)
    const r = await f.http('POST', `/ticketing/tickets/${sale.order.tickets[0].id}/transfer`, { holderName: 'Otra persona' })
    assert.deepEqual([r.status, r.body.code], [409, 'TRANSFER_NOT_ALLOWED'])
    const g = await fixture({ policy: { transferCutoffMinutes: 72 * 60 } })
    const late = await reserve(g, 1)
    assert.equal((await g.http('POST', `/ticketing/tickets/${late.order.tickets[0].id}/transfer`, { holderName: 'Otra persona' })).body.code, 'TRANSFER_CLOSED')
  })

  it('cancelling a free order frees quota and seats, voids its QRs and cancels the engine booking', async () => {
    const f = await fixture({ capacity: 10 })
    const sale = await reserve(f, 3)
    const r = await f.http('POST', `/ticketing/orders/${sale.order.id}/cancel`, { reason: 'No asistirá' }, { 'Idempotency-Key': key() })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.data.status, 'CANCELLED')
    assert.ok(r.body.data.tickets.every((t) => t.status === 'CANCELLED'))
    assert.equal(await seats(f), 0)
    assert.equal(await issued(f), 0)
    assert.equal((await db.booking.findUnique({ where: { id: sale.order.bookingId } })).status, 'CANCELLED')
    for (const c of sale.credentials) assert.equal(await valid(f, c.qr), false)
    assert.equal((await f.http('POST', `/ticketing/orders/${sale.order.id}/cancel`, {})).body.code, 'INVALID_TRANSITION')
  })

  it('unpaid holds expire: quota, seats and the engine booking are released once', async () => {
    let clock = Date.now()
    const timed = createTicketingCommandService({ prisma: db, engine, now: () => clock })
    const f = await fixture({ capacity: 10, policy: { holdMinutes: 10 } })
    const product = await db.catalogProduct.create({ data: { companyId: f.company.id, name: 'Boleto VIP', slug: tag(), price: 350, currency: 'MXN' } })
    const vip = (await f.http('POST', `/ticketing/events/${f.event.id}/types`, { name: 'VIP', priceMode: 'pos', catalogProductId: product.id })).body.data
    assert.equal(vip.priceMode, 'pos')
    const held = await timed.reserve({ companyId: f.company.id, actorId: f.organizer.id, input: { sessionId: f.session.id, channel: 'box_office', items: [{ typeId: vip.id, quantity: 4 }] } })
    assert.deepEqual([held.order.status, held.credentials.length], ['PENDING_PAYMENT', 0])
    assert.ok(held.order.tickets.every((t) => t.status === 'PENDING_PAYMENT'))
    assert.equal(await seats(f), 4)
    assert.equal((await timed.expireHolds({ companyId: f.company.id })).expired, 0, 'not due yet')
    clock += 11 * 60000
    const [one, two] = await Promise.all([timed.expireHolds(), timed.expireHolds()])
    assert.ok(one.expired + two.expired >= 1)
    const after = await db.ticketOrder.findUnique({ where: { id: held.order.id } })
    assert.deepEqual([after.status, after.holdExpiresAt], ['EXPIRED', null])
    assert.equal(await seats(f), 0)
    assert.equal(await issued(f, vip.id), 0)
    assert.equal((await db.booking.findUnique({ where: { id: held.order.bookingId } })).status, 'CANCELLED')
    assert.equal((await db.ticketHistory.count({ where: { entityId: held.order.id, action: 'expire' } })), 1, 'expired exactly once')
  })

  it('outbox events carry no personal data; ticket bookings never reach the calendar', async () => {
    const f = await fixture()
    const sale = await reserve(f, 2, { buyer: { name: 'Ana Pérez', email: 'ana.perez@example.test', phone: '5512345678' }, holders: [{ name: 'Ana Pérez', email: 'ana.perez@example.test' }, { name: 'Luis Gómez' }] })
    await cmd.reissue({ companyId: f.company.id, actorId: f.organizer.id, ticketId: sale.order.tickets[0].id })
    await cmd.transfer({ companyId: f.company.id, actorId: f.organizer.id, ticketId: sale.order.tickets[1].id, input: { holderName: 'Marta Ruiz', holderEmail: 'marta@example.test' } })
    await cmd.cancel({ companyId: f.company.id, actorId: f.organizer.id, orderId: sale.order.id })
    const events = await db.domainEventOutbox.findMany({ where: { companyId: f.company.id } })
    const names = events.map((e) => e.event)
    for (const name of ['ticketing.order.created', 'ticketing.ticket.reissued', 'ticketing.ticket.transferred', 'ticketing.order.cancelled']) assert.ok(names.includes(name), name)
    const allowed = new Set(['id', 'eventId', 'sessionId', 'status', 'quantity', 'channel', 'orderId', 'typeId', 'credentialVersion'])
    for (const e of events.filter((x) => x.event.startsWith('ticketing.'))) assert.deepEqual(Object.keys(e.payload).filter((k) => !allowed.has(k)), [], e.event)
    const text = JSON.stringify(events.map((e) => e.payload))
    for (const pii of ['Ana', 'Pérez', 'Luis', 'Marta', 'example.test', '5512345678']) assert.ok(!text.includes(pii), pii)
    const { automationEvents } = await import('../../../../../../packages/module-compiler/src/automations.js')
    assert.ok(!automationEvents().some((e) => e.key.startsWith('ticketing.')), 'hidden from trigger pickers until F6E')
    const live = await reserve(f, 1)
    assert.equal(await createBookingsCalendarProjection({ prisma: db }).project(live.order.bookingId), 'removed')
    assert.equal(await db.calendarEvent.count({ where: { sourceEntityId: live.order.bookingId } }), 0)
  })
})
