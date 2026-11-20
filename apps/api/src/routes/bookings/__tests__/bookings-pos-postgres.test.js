// runly.bookings phase 5: POS restaurant tables and POS appointments on the Booking
// Engine, against a real disposable PostgreSQL (BOOKINGS_TEST_DATABASE_URL, localhost only).
// Drives the real POS router (same routes and SDK the POS screens use), the bookings
// backoffice router and the public portal router.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createRunlyClient } from '../../../../../../packages/sdk/src/index.js'
import { createPosRouter } from '../../pos/pos-routes.js'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsPortalRouter } from '../bookings-public-routes.js'
import { createPosBookingsAdapter } from '../../pos/pos-bookings-adapter.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const ENV = { BOOKINGS_LINK_SECRET: 'pos-test-secret', PUBLIC_APP_URL: 'https://app.example.test', CORS_ORIGIN: 'https://app.example.test' }
const OPEN = { reads: [10000, 100], creates: [10000, 100], pageCreates: [10000, 100], manageWrites: [10000, 100] }
const H = 3600000, MIN = 60000
const GRANTS = 'pos.admin.update,pos.admin.read,pos.settings.manage,pos.floor.manage,pos.orders.read,pos.orders.create,pos.orders.update,pos.orders.cancel,pos.caja.operate,pos.caja.read,pos.comandas.read,pos.comandas.create'

describe('runly.bookings x POS on real PostgreSQL', { skip: !url }, () => {
  let db, n = 0
  const tag = () => `bp-${Date.now()}-${++n}`
  const key = () => `bp-key-${Date.now()}-${++n}-${crypto.randomUUID()}`
  // A start at a whole hour, h hours from now (within the space's 24 h schedule).
  const at = (hours) => { const d = new Date(Date.now() + hours * H); d.setUTCMinutes(0, 0, 0); return d.toISOString() }

  before(() => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 30 }) }); Object.assign(process.env, { BOOKINGS_LINK_SECRET: ENV.BOOKINGS_LINK_SECRET }) })
  after(async () => { await db?.$disconnect() })

  const http = (app) => async (method, path, body, headers = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  function posApp(f, company = f.company.id) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', company); c.set('userId', f.actor.id); c.set('userContext', { isAdmin: false, permissionSet: new Set(GRANTS.split(',')), profile: { id: f.actor.id } }); return next() })
    const any = (keys) => async (c, next) => (keys.some((k) => c.get('userContext').permissionSet.has(k)) ? next() : c.json({ error: 'Sin permiso' }, 403))
    app.route('', createPosRouter({ prisma: db, requirePermission: (k) => any([k]), requireAnyPermission: any }))
    return app
  }
  function adminApi(f) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', f.company.id); c.set('userContext', { isAdmin: true, permissionSet: new Set(), profile: { id: f.actor.id } }); return next() })
    app.route('', createBookingsRouter({ prisma: db, env: ENV, requirePermission: () => async (_c, next) => next() }))
    return http(app)
  }
  const portal = () => { const app = new Hono(); app.route('', createBookingsPortalRouter({ prisma: db, env: ENV, limits: OPEN })); return http(app) }

  async function fixture({ tables = [['Mesa 1', 2], ['Mesa 2', 4], ['Mesa 3', 6]], outletName = 'Comedor' } = {}) {
    const company = await db.company.create({ data: { name: `Restaurante ${tag()}`, slug: tag() } })
    const actor = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Hostess', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: company.id, userId: actor.id } })
    await db.posSettings.create({ data: { companyId: company.id, currency: 'MXN', defaultTaxRate: 0, pricesIncludeTax: true } })
    const outlet = await db.posOutlet.create({ data: { companyId: company.id, name: outletName, mode: 'HYBRID', allowTableCharge: true, kitchenKdsEnabled: false } })
    const f = { company, actor, outlet }
    f.app = posApp(f); f.pos = http(f.app)
    f.sdk = createRunlyClient({ baseUrl: 'https://example.test', getActiveCompanyId: () => company.id, fetch: async (u, o) => f.app.request(new URL(u).pathname + new URL(u).search, o) }).commerce
    f.tables = []
    for (const [name, capacity] of tables) f.tables.push((await f.sdk.createTable({ outletId: outlet.id, name, capacity }, 'token', { idempotencyKey: key() })).data)
    f.admin = adminApi(f)
    return f
  }
  const activate = async (f, body = {}) => f.pos('POST', '/pos/bookings/links/activate', { outletId: f.outlet.id, kind: 'tables', timezone: 'America/Mexico_City', ...body })
  const reserve = (f, body) => f.pos('POST', '/pos/reservations', { outletId: f.outlet.id, guestName: 'Ana', partySize: 2, ...body })
  const walkIn = (f, tableId) => f.sdk.createOrder({ outletId: f.outlet.id, experience: 'RESTAURANT', fulfillmentType: 'DINE_IN', tableId, guestCount: 2 }, 'token', { idempotencyKey: key() })

  it('1-3: one table holds several non-overlapping reservations; overlaps refused; physical occupation vs future time', async () => {
    const f = await fixture()
    assert.equal((await activate(f)).status, 200)
    const [t1, t2] = f.tables
    const a = await reserve(f, { tableId: t1.id, scheduledAt: at(26), durationMinutes: 90 })
    const b = await reserve(f, { tableId: t1.id, scheduledAt: at(29), durationMinutes: 90 })
    assert.deepEqual([a.status, b.status], [201, 201], JSON.stringify([a.body, b.body]))
    assert.equal((await db.posTable.findUnique({ where: { id: t1.id } })).status, 'AVAILABLE', 'no all-day RESERVED mark')
    const clash = await reserve(f, { tableId: t1.id, scheduledAt: at(27), durationMinutes: 60 })
    assert.equal(clash.status, 409)
    // Buffer (15 min cleanup) counts: starting right when the first one ends overlaps its cleanup.
    assert.equal((await reserve(f, { tableId: t1.id, scheduledAt: new Date(Date.parse(a.body.data.scheduledAt) + 90 * MIN).toISOString(), durationMinutes: 30 })).status, 409)
    // Party of 5 only fits Mesa 3; party of 2 without a table takes the smallest free one.
    const big = await reserve(f, { partySize: 5, scheduledAt: at(26) })
    assert.equal(big.body.data.table.name, 'Mesa 3')
    assert.equal((await reserve(f, { partySize: 9, scheduledAt: at(30) })).status, 422)
    const small = await reserve(f, { partySize: 2, scheduledAt: at(26) })
    assert.equal(small.body.data.table.name, 'Mesa 2', 'Mesa 1 is taken at that time')

    // Mesa 2 physically occupied by a walk-in right now.
    await walkIn(f, t2.id)
    assert.equal((await reserve(f, { tableId: t2.id, scheduledAt: new Date(Date.now() + 30 * MIN).toISOString() })).status, 409, 'no valid window while occupied')
    assert.equal((await reserve(f, { tableId: t2.id, scheduledAt: at(3) })).status, 201, 'after its turnover it is fine')
    const auto = await reserve(f, { partySize: 2, scheduledAt: new Date(Date.now() + 20 * MIN).toISOString() })
    assert.notEqual(auto.body.data.tableId, t2.id, 'auto-assignment skips the occupied table')
    // A walk-in cannot take a table whose reservation starts within the next turnover.
    await assert.rejects(walkIn(f, auto.body.data.tableId), { code: 'TABLE_OCCUPIED' })
  })

  it('4-5, 7: portal bookings show in POS; POS bookings block the public availability; cancel frees it', async () => {
    const f = await fixture({ tables: [['Barra', 4]] })
    const link = (await activate(f)).body.data
    const service = (await db.posBookingLink.findFirst({ where: { companyId: f.company.id } })).serviceId
    const slug = `p-${tag()}`.slice(0, 60)
    const page = (await f.admin('POST', `/bookings/spaces/${link.spaceId}/pages`, { slug, title: 'Reserva tu mesa', serviceIds: [service], published: true })).body.data
    await f.admin('PATCH', `/bookings/spaces/${link.spaceId}`, { published: true })
    const pub = portal()
    const slots = async () => (await pub('GET', `/public/bookings/pages/${slug}/availability?serviceId=${service}&from=${at(47)}&to=${at(50)}`)).body.data.slots.map((s) => new Date(s.startsAt).toISOString())
    const when = at(48)
    assert.ok((await slots()).includes(when))
    const pos = await reserve(f, { scheduledAt: when, durationMinutes: 90 })
    assert.equal(pos.status, 201)
    assert.equal((await slots()).includes(when), false, 'the POS reservation blocks the public slot')
    const web = await pub('POST', `/public/bookings/pages/${slug}/reservations`, { serviceId: service, startsAt: at(52), guestName: 'Luis Portal', guestEmail: 'luis@example.test', acceptedPolicyVersion: page.policyVersion }, { 'Idempotency-Key': key() })
    assert.equal(web.status, 201, JSON.stringify(web.body))
    const list = (await f.pos('GET', `/pos/reservations?outletId=${f.outlet.id}`)).body.data
    const fromPortal = list.find((r) => r.guestName === 'Luis Portal')
    assert.equal(fromPortal?.table?.name, 'Barra')
    assert.equal(fromPortal.channel, 'portal')
    // 7. Cancelling from POS frees the time for everyone.
    assert.equal((await f.pos('PATCH', `/pos/reservations/${pos.body.data.id}`, { status: 'CANCELLED' })).body.data.status, 'CANCELLED')
    assert.ok((await slots()).includes(when))
    assert.equal((await reserve(f, { scheduledAt: when })).status, 201)
  })

  it('6: POS and the backoffice moving two bookings into the same table slot at once: exactly one wins', async () => {
    const f = await fixture({ tables: [['Terraza', 4]] })
    await activate(f)
    const a = (await reserve(f, { scheduledAt: at(30) })).body.data
    const b = (await reserve(f, { scheduledAt: at(33) })).body.data
    const target = at(36)
    const results = await Promise.all([
      f.pos('PATCH', `/pos/reservations/${a.id}`, { scheduledAt: target }),
      f.admin('POST', `/bookings/reservations/${b.id}/reschedule`, { startsAt: target, durationMinutes: 90 }),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], JSON.stringify(results.map((r) => r.body)))
    const active = await db.$queryRaw`SELECT count(*)::int AS n FROM booking_allocation a JOIN booking b ON b.id = a.booking_id WHERE b.company_id = ${f.company.id}::uuid AND a.active`
    assert.equal(active[0].n, 2, 'one allocation per live booking')
  })

  it('8: arrival opens the account through C6 and links it; the closed account completes the booking', async () => {
    const f = await fixture({ tables: [['Mesa 7', 4]] })
    await activate(f)
    const r = (await reserve(f, { scheduledAt: new Date(Date.now() + 5 * MIN).toISOString() })).body.data
    const order = (await f.sdk.seatReservation(r.id, {}, 'token', { idempotencyKey: key() })).data
    assert.equal(order.tableId, f.tables[0].id)
    const seated = (await f.pos('GET', `/pos/reservations/${r.id}`)).body.data
    assert.deepEqual([seated.status, seated.orderId], ['SEATED', order.id])
    assert.equal((await db.posTable.findUnique({ where: { id: f.tables[0].id } })).status, 'OCCUPIED')
    await assert.rejects(f.sdk.seatReservation(r.id, {}, 'token', { idempotencyKey: key() }), { code: 'INVALID_TRANSITION' })
    // The guests leave: account cancelled (empty), booking started -> the worker completes it.
    await f.sdk.cancel(order.id, { expectedVersion: order.version, reason: 'Se fueron' }, 'token', { idempotencyKey: key() })
    await db.$executeRaw`UPDATE booking SET starts_at = now() - interval '1 minute' WHERE id = ${r.id}::uuid`
    await createPosBookingsAdapter({ prisma: db }).completeClosed()
    assert.equal((await db.booking.findUnique({ where: { id: r.id } })).status, 'COMPLETED')
    assert.equal(await db.bookingAllocation.count({ where: { bookingId: r.id, active: true } }), 0, 'table freed in the engine')
    const actions = (await db.bookingHistory.findMany({ where: { bookingId: r.id }, orderBy: { createdAt: 'asc' } })).map((h) => h.action)
    assert.deepEqual(actions, ['create', 'arrive', 'completed'])
  })

  it('9: companies and outlets stay isolated; a legacy outlet keeps the legacy behaviour', async () => {
    const [f, g] = [await fixture(), await fixture({ outletName: 'Otra' })]
    await activate(f)
    const r = (await reserve(f, { scheduledAt: at(40) })).body.data
    const foreign = http(posApp(f, g.company.id))
    assert.equal((await foreign('GET', `/pos/reservations/${r.id}`)).status, 404)
    assert.equal((await foreign('PATCH', `/pos/reservations/${r.id}`, { status: 'CANCELLED' })).status, 404)
    assert.equal((await foreign('GET', '/pos/reservations')).body.data.some((x) => x.id === r.id), false)
    assert.equal((await f.pos('POST', '/pos/reservations', { outletId: g.outlet.id, guestName: 'X', scheduledAt: at(40) })).status, 404, 'outlet of another company')
    // g is still legacy: its reservation marks the table as before.
    const legacy = await reserve(g, { tableId: g.tables[0].id, scheduledAt: at(40) })
    assert.equal(legacy.body.data.source, undefined)
    assert.equal((await db.posTable.findUnique({ where: { id: g.tables[0].id } })).status, 'RESERVED')
  })

  it('10: legacy rows: preview, conflicts block, idempotent carry-over, rollback without losing new bookings, reactivation', async () => {
    const f = await fixture({ tables: [['Mesa A', 4], ['Mesa B', 4]] })
    const [ta, tb] = f.tables
    const legacy = async (data) => db.posReservation.create({ data: { companyId: f.company.id, outletId: f.outlet.id, guestName: 'Legado', partySize: 2, durationMinutes: 90, createdById: f.actor.id, ...data } })
    const ok1 = await legacy({ tableId: ta.id, scheduledAt: new Date(at(30)), guestName: 'Uno' })
    const ok2 = await legacy({ tableId: ta.id, scheduledAt: new Date(at(34)), guestName: 'Dos' })
    const clash = await legacy({ tableId: tb.id, scheduledAt: new Date(at(30)), partySize: 9, guestName: 'Grupo grande' })
    const past = await legacy({ tableId: tb.id, scheduledAt: new Date(Date.now() - 5 * H), guestName: 'Pasada' })
    await db.posTable.update({ where: { id: ta.id }, data: { status: 'RESERVED' } })
    const preview = (await f.pos('POST', '/pos/bookings/links/preview', { outletId: f.outlet.id, kind: 'tables', timezone: 'America/Mexico_City' })).body.data
    assert.deepEqual([preview.preview, preview.carried, preview.conflicts.map((c) => c.id)], [true, 2, [clash.id]])
    assert.equal(await db.posBookingLink.count({ where: { companyId: f.company.id } }), 0, 'preview leaves nothing behind')
    const refused = await activate(f)
    assert.equal(refused.status, 409)
    assert.equal(refused.body.report.conflicts[0].code, 'NO_CAPACITY')
    await db.posReservation.update({ where: { id: clash.id }, data: { partySize: 4 } })
    const done = (await activate(f)).body.data
    assert.equal(done.carried, 3)
    assert.equal((await activate(f)).body.data.alreadyActive, true)
    const carried = await db.booking.findMany({ where: { companyId: f.company.id, sourceModule: 'runly.pos.reservation' } })
    assert.deepEqual(carried.map((b) => b.sourceId).sort(), [ok1.id, ok2.id, clash.id].sort())
    assert.equal((await db.posReservation.findUnique({ where: { id: past.id } })).bookingId, null, 'history stays legacy')
    assert.equal((await db.posTable.findUnique({ where: { id: ta.id } })).status, 'AVAILABLE')
    const list = (await f.pos('GET', `/pos/reservations?outletId=${f.outlet.id}`)).body.data
    assert.equal(list.filter((r) => r.guestName === 'Uno').length, 1, 'carried rows are listed once')

    // A booking made after activation, then rollback: it gets a legacy row; nothing lost.
    const fresh = (await reserve(f, { tableId: tb.id, scheduledAt: at(38), guestName: 'Nueva' })).body.data
    await f.pos('PATCH', `/pos/reservations/${ok2.id}`, { scheduledAt: at(36) })
    const back = (await f.pos('POST', '/pos/bookings/links/rollback', { outletId: f.outlet.id, kind: 'tables' })).body.data
    assert.deepEqual([back.copied, back.updated], [1, 3])
    const copied = await db.posReservation.findFirst({ where: { bookingId: fresh.id } })
    assert.deepEqual([copied.guestName, copied.tableId, copied.status], ['Nueva', tb.id, 'CONFIRMED'])
    assert.equal((await db.posReservation.findUnique({ where: { id: ok2.id } })).scheduledAt.toISOString(), at(36), 'engine changes reach the legacy row')
    assert.equal((await db.bookingSpace.findUnique({ where: { id: done.spaceId } })).published, false)
    // Legacy mode again: a cancellation there wins when the outlet is reactivated.
    await f.pos('PATCH', `/pos/reservations/${ok1.id}`, { status: 'CANCELLED' })
    const again = (await activate(f)).body.data
    assert.equal(again.reconciled, 1)
    assert.equal((await db.booking.findFirst({ where: { sourceId: ok1.id } })).status, 'CANCELLED')
    assert.equal(await db.booking.count({ where: { companyId: f.company.id, guestName: 'Nueva' } }), 1, 'no duplicate after reactivation')
  })

  it('11: appointments per professional without overlaps; legacy ones in progress carried; atomic reschedule; status mirrors', async () => {
    const f = await fixture({ tables: [] })
    const inProgress = await db.posAppointment.create({ data: { companyId: f.company.id, outletId: f.outlet.id, customerName: 'En curso', startsAt: new Date(Date.now() - 10 * MIN), durationMinutes: 60, status: 'ARRIVED', createdById: f.actor.id } })
    const act = await f.pos('POST', '/pos/bookings/links/activate', { outletId: f.outlet.id, kind: 'appointments', timezone: 'America/Mexico_City', professionals: [{ name: 'Ana' }, { name: 'Luis' }] })
    assert.equal(act.status, 200, JSON.stringify(act.body))
    assert.equal(act.body.data.carried, 1)
    const pros = (await f.pos('GET', `/pos/bookings/professionals?outletId=${f.outlet.id}`)).body.data
    const book = (body) => f.pos('POST', '/pos/appointments', { outletId: f.outlet.id, customerName: 'Cliente', startsAt: at(24), durationMinutes: 60, ...body })
    const one = await book({ customerName: 'Uno' }), two = await book({ customerName: 'Dos' }), three = await book({ customerName: 'Tres' })
    assert.deepEqual([one.status, two.status, three.status], [201, 201, 409])
    assert.equal((await book({ customerName: 'Ana ya ocupada', resourceId: pros.find((p) => p.name === 'Ana').id, startsAt: new Date(Date.parse(at(24)) + 30 * MIN).toISOString() })).status, 409)
    const listed = (await f.pos('GET', `/pos/appointments?from=${at(23)}&to=${at(26)}`)).body.data
    assert.deepEqual(listed.map((a) => a.professional?.name).sort(), ['Ana', 'Luis'])
    // Reschedule: the new time is taken atomically; a failed move keeps the old one.
    const moved = await f.pos('PATCH', `/pos/appointments/${one.body.data.id}`, { startsAt: at(28), durationMinutes: 90 })
    assert.equal(moved.body.data.durationMinutes, 90)
    const blocked = await f.pos('PATCH', `/pos/appointments/${two.body.data.id}`, { startsAt: at(28), resourceId: (await db.$queryRaw`SELECT a.resource_id FROM booking_allocation a WHERE a.booking_id = ${moved.body.data.bookingId}::uuid AND a.active`)[0].resource_id })
    assert.equal(blocked.status, 409)
    assert.equal((await db.posAppointment.findUnique({ where: { id: two.body.data.id } })).startsAt.toISOString(), at(24))
    // Status: cancel frees the professional; no-show before the start is refused.
    assert.equal((await f.pos('POST', `/pos/appointments/${two.body.data.id}/status`, { status: 'NO_SHOW' })).status, 409)
    assert.equal((await f.pos('POST', `/pos/appointments/${two.body.data.id}/status`, { status: 'CANCELLED' })).body.data.status, 'CANCELLED')
    assert.equal((await db.booking.findUnique({ where: { id: two.body.data.bookingId } })).status, 'CANCELLED')
    assert.equal((await book({ customerName: 'Cuatro' })).status, 201)
    assert.equal((await db.posAppointment.findUnique({ where: { id: inProgress.id } })).bookingId !== null, true)
  })

  it('12: history, domain events, audit and calendar are coherent (one event per booking, no contact data)', async () => {
    const f = await fixture({ tables: [['Mesa H', 4]] })
    await activate(f)
    const r = (await reserve(f, { scheduledAt: at(30), guestPhone: '5550001111', notes: 'Alergia' })).body.data
    await f.pos('PATCH', `/pos/reservations/${r.id}`, { guestName: 'Ana María' })
    await f.pos('PATCH', `/pos/reservations/${r.id}`, { status: 'CANCELLED' })
    const actions = (await db.bookingHistory.findMany({ where: { bookingId: r.id }, orderBy: { createdAt: 'asc' } })).map((h) => h.action)
    assert.deepEqual(actions, ['create', 'update', 'cancelled'])
    const events = (await db.domainEventOutbox.findMany({ where: { companyId: f.company.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.event)
    assert.deepEqual(events, ['bookings.booking.created', 'bookings.booking.cancelled'])
    assert.equal(await db.auditLog.count({ where: { entityId: r.id, action: { startsWith: 'pos.reservation.' } } }), 3)
    assert.equal(await db.calendarEvent.count({ where: { sourceModule: 'runly.pos', sourceEntityId: r.id } }), 0, 'POS bridge does not mirror engine reservations')
  })
})
