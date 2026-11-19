// runly.bookings phase 4D: Calendar projection and Automations events against a real,
// disposable PostgreSQL (BOOKINGS_TEST_DATABASE_URL, localhost only).
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { automationEvents } from '@runly/module-compiler'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsCommandService } from '../bookings-command-service.js'
import { createBookingsCalendarProjection } from '../bookings-calendar.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const BASE = Date.parse('2027-03-01T00:00:00Z')

describe('runly.bookings calendar projection and events on real PostgreSQL', { skip: !url }, () => {
  let db, n = 0
  const clock = { now: BASE }
  const tag = () => `bc-${Date.now()}-${++n}`
  before(() => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 20 }) }) })
  after(async () => { await db?.$disconnect() })

  async function setup({ policy = {} } = {}) {
    const company = await db.company.create({ data: { name: `Empresa ${tag()}`, slug: tag() } })
    const user = async (name) => {
      const u = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: name, email: `${tag()}@example.test` } })
      await db.membership.create({ data: { companyId: company.id, userId: u.id } })
      return u
    }
    const owner = await user('Admin'), agent = await user('Agente'), outsider = await user('Otra área')
    const commands = createBookingsCommandService({ prisma: db, now: () => clock.now })
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', company.id); c.set('userContext', { isAdmin: true, permissionSet: new Set(), profile: { id: owner.id } }); return next() })
    app.route('', createBookingsRouter({ prisma: db, requirePermission: () => async (_c, next) => next(), commands }))
    const api = async (method, path, body, headers = {}) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: res.status, body: await res.json().catch(() => null) }
    }
    const space = (await api('POST', '/bookings/spaces', { name: 'Clínica Norte', slug: tag(), timezone: 'America/Mexico_City', policy: { horizonDays: 365, ...policy } })).body.data
    await api('PUT', `/bookings/spaces/${space.id}/members/${agent.id}`, { role: 'agent' })
    const resource = (await api('POST', '/bookings/resources', { name: 'Dra. Ruiz', type: 'staff' })).body.data
    await api('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [resource.id] })
    const service = (await api('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60 })).body.data
    await api('PUT', `/bookings/services/${service.id}/resources`, { resourceIds: [resource.id] })
    await api('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' })) })
    const book = async (startsAt, extra = {}) => (await api('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: service.id, startsAt, guestName: 'Ana Pérez', guestEmail: 'ana@example.test', guestPhone: '5551234567', notes: 'Alergia a la penicilina', ...extra })).body.data
    return { company, owner, agent, outsider, api, space, service, resource, book, projection: createBookingsCalendarProjection({ prisma: db }) }
  }
  const events = (bookingId) => db.calendarEvent.findMany({ where: { sourceModule: 'runly.bookings', sourceEntityId: bookingId }, include: { calendar: { include: { shares: true } } } })

  it('mirrors create, reschedule and cancel as one event without the customer contact data', async () => {
    const f = await setup()
    const booking = await f.book('2027-03-10T16:00:00Z')
    assert.equal((await f.projection.syncDue()).created >= 1, true)
    let [event, ...extra] = await events(booking.id)
    assert.equal(extra.length, 0)
    assert.equal(event.title, 'Consulta · Ana Pérez')
    assert.match(event.description, new RegExp(`Folio: ${booking.reference}`))
    assert.doesNotMatch(`${event.title}\n${event.description}`, /ana@example|5551234567|penicilina/)
    assert.equal(event.calendar.name, 'Reservaciones · Clínica Norte')
    assert.equal(event.calendar.ownerId, f.owner.id)
    assert.deepEqual(event.calendar.shares.map((s) => [s.userId, s.role]), [[f.agent.id, 'VIEWER']], 'space members only')

    await f.api('POST', `/bookings/reservations/${booking.id}/reschedule`, { startsAt: '2027-03-11T17:00:00Z' })
    await f.projection.project(booking.id)
    ;[event, ...extra] = await events(booking.id)
    assert.equal(extra.length, 0)
    assert.equal(event.startAt.toISOString(), '2027-03-11T17:00:00.000Z')
    assert.equal(await f.projection.project(booking.id), 'current', 'replays are no-ops')

    await f.api('POST', `/bookings/reservations/${booking.id}/cancel`, {})
    await f.projection.syncDue()
    assert.equal((await events(booking.id)).length, 0)
  })

  it('pending, confirmed and expired holds; concurrent projections never duplicate', async () => {
    const f = await setup({ policy: { requiresApproval: true, holdMinutes: 30 } })
    const pending = await f.book('2027-03-12T16:00:00Z')
    await Promise.all(Array.from({ length: 8 }, () => f.projection.project(pending.id)).concat(f.projection.syncDue()))
    assert.equal((await events(pending.id)).length, 1)
    assert.equal((await events(pending.id))[0].title, 'Pendiente · Consulta · Ana Pérez')
    await f.api('POST', `/bookings/reservations/${pending.id}/confirm`, {})
    await f.projection.project(pending.id)
    assert.equal((await events(pending.id))[0].title, 'Consulta · Ana Pérez')

    clock.now = Date.now() - 2 * 3600000
    const hold = await f.book('2027-03-13T16:00:00Z', { guestName: 'Luis Gómez' })
    clock.now = BASE
    await f.projection.project(hold.id)
    assert.equal((await events(hold.id)).length, 1)
    await createBookingsCommandService({ prisma: db }).expireAllHolds()
    await f.projection.syncDue()
    assert.equal((await events(hold.id)).length, 0, 'an expired hold leaves the calendar')

    // A duplicate made outside the projection is healed on the next change.
    const [kept] = await events(pending.id)
    await db.calendarEvent.create({ data: { calendarId: kept.calendarId, title: 'copia', startAt: kept.startAt, endAt: kept.endAt, sourceModule: 'runly.bookings', sourceEntityId: pending.id } })
    await f.api('POST', `/bookings/reservations/${pending.id}/reschedule`, { startsAt: '2027-03-14T16:00:00Z' })
    await f.projection.project(pending.id)
    assert.deepEqual((await events(pending.id)).map((e) => e.id), [kept.id])
  })

  it('Calendar is only a projection: deleting the event keeps the slot taken; leaving the space revokes the share', async () => {
    const f = await setup()
    const booking = await f.book('2027-03-15T16:00:00Z')
    await f.projection.project(booking.id)
    await db.calendarEvent.deleteMany({ where: { sourceModule: 'runly.bookings', sourceEntityId: booking.id } })
    const slots = (await f.api('GET', `/bookings/spaces/${f.space.id}/availability?serviceId=${f.service.id}&from=2027-03-15T15:00:00Z&to=2027-03-15T18:00:00Z`)).body.data.slots
    assert.equal(slots.some((s) => new Date(s.startsAt).toISOString() === '2027-03-15T16:00:00.000Z'), false)
    assert.equal((await f.api('POST', `/bookings/spaces/${f.space.id}/reservations`, { serviceId: f.service.id, startsAt: '2027-03-15T16:00:00Z', guestName: 'Otro' })).status, 409)

    await f.api('DELETE', `/bookings/spaces/${f.space.id}/members/${f.agent.id}`)
    const next = await f.book('2027-03-16T16:00:00Z')
    await f.projection.project(next.id)
    const [event] = await events(next.id)
    assert.deepEqual(event.calendar.shares, [], 'the former member no longer sees the calendar')
    assert.equal(event.calendar.shares.some((s) => s.userId === f.outsider.id), false)
  })

  it('Automations: lifecycle events are pickable triggers and their payload carries no contact data', async () => {
    const f = await setup()
    const booking = await f.book('2027-03-17T16:00:00Z')
    await f.api('POST', `/bookings/reservations/${booking.id}/cancel`, {})
    const rows = await db.domainEventOutbox.findMany({ where: { companyId: f.company.id }, orderBy: { createdAt: 'asc' } })
    assert.deepEqual(rows.map((r) => r.event), ['bookings.booking.created', 'bookings.booking.cancelled'])
    assert.equal(JSON.stringify(rows.map((r) => r.payload)).includes('ana@example'), false)
    const keys = automationEvents().map((e) => e.key)
    for (const action of ['created', 'confirmed', 'rescheduled', 'cancelled', 'rejected', 'completed', 'no_show', 'expired']) assert.ok(keys.includes(`bookings.booking.${action}`), action)
    assert.equal(keys.includes('automations.webhook.received'), false)
  })
})
