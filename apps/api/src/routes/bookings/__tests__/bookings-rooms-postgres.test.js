// runly.bookings v1.2 R1: rooms reserved by employees on a real, disposable PostgreSQL
// (BOOKINGS_TEST_DATABASE_URL, localhost only). Same engine, same exclusion constraint.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsRoomsRouter } from '../bookings-rooms-routes.js'
import { createBookingsCommandService } from '../bookings-command-service.js'
import { createBookingsCalendarProjection } from '../bookings-calendar.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const H = 3600000

// A Wednesday at least 2 days ahead, at the given UTC hour (10:00 in Mexico City = 16:00Z).
function wednesday(hourUtc, minutes = 0, weeks = 0) {
  const d = new Date(Date.now() + 2 * 86400000)
  d.setUTCHours(hourUtc, minutes, 0, 0)
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCDate(d.getUTCDate() + 7 * weeks)
  return d.toISOString()
}

describe('runly.bookings rooms (v1.2 R1) on real PostgreSQL', { skip: !url }, () => {
  let db, commands, n = 0
  const tag = () => `br-${Date.now()}-${++n}`
  const key = () => `br-key-${crypto.randomUUID()}`
  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 30 }) })
    commands = createBookingsCommandService({ prisma: db })
  })
  after(async () => { await db?.$disconnect() })

  // As a given user: grants are permission keys; admin = bookings.admin bypass.
  function as(company, user, grants = ['bookings.reserve']) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', company.id); c.set('userContext', { isAdmin: false, permissionSet: new Set(grants), profile: { id: user.id } }); return next() })
    const requirePermission = (k) => async (c, next) => (c.get('userContext').permissionSet.has(k) ? next() : c.json({ error: 'Sin permiso' }, 403))
    const requireAnyPermission = (keys) => async (c, next) => (keys.some((k) => c.get('userContext').permissionSet.has(k)) ? next() : c.json({ error: 'Sin permiso' }, 403))
    app.route('', createBookingsRouter({ prisma: db, requirePermission, commands }))
    app.route('', createBookingsRoomsRouter({ prisma: db, requireAnyPermission, commands }))
    return async (method, path, body, headers = {}) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: res.status, body: await res.json().catch(() => null) }
    }
  }

  async function setup({ policy = {} } = {}) {
    const company = await db.company.create({ data: { name: `Oficina ${tag()}`, slug: tag() } })
    const person = async (name) => {
      const u = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: name, email: `${tag()}@example.test` } })
      await db.membership.create({ data: { companyId: company.id, userId: u.id } })
      await db.calendarCalendar.create({ data: { ownerId: u.id, companyId: company.id, name: 'Mi calendario', color: '#2563eb', isDefault: true } })
      return u
    }
    const admin = await person('Admin Salas'), ana = await person('Ana'), luis = await person('Luis'), eva = await person('Eva')
    const boss = as(company, admin, ['bookings.access', 'bookings.spaces.manage', 'bookings.reserve'])
    const space = (await boss('POST', '/bookings/spaces', { name: 'Salas Piso 3', slug: tag(), timezone: 'America/Mexico_City', purpose: 'resources', policy })).body.data
    assert.equal(space?.purpose, 'resources', 'resources space')
    const room = (await boss('POST', '/bookings/resources', { name: 'Sala de juntas', type: 'room', capacity: 6 })).body.data
    const small = (await boss('POST', '/bookings/resources', { name: 'Cabina', type: 'room', capacity: 2 })).body.data
    await boss('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [room.id, small.id] })
    return { company, admin, ana, luis, eva, boss, space, room, small, api: (u, g) => as(company, u, g) }
  }
  const reserve = (f, who, body, headers = {}) => f.api(who)('POST', `/bookings/rooms/${f.space.id}/reservations`, { resourceId: f.room.id, title: 'Comité', startsAt: wednesday(16), endsAt: wednesday(17), ...body }, { 'Idempotency-Key': key(), ...headers })

  it('a resources space hides its internal service and is not a portal', async () => {
    const f = await setup()
    assert.deepEqual((await f.boss('GET', `/bookings/spaces/${f.space.id}/services`)).body.data, [])
    assert.equal((await f.boss('POST', `/bookings/spaces/${f.space.id}/services`, { name: 'Consulta', kind: 'appointment', durationMinutes: 30 })).body.code, 'RESOURCE_SPACE')
    const rooms = (await f.api(f.ana)('GET', '/bookings/rooms')).body.data
    assert.deepEqual(rooms.map((r) => r.resources.map((x) => x.name)), [['Cabina', 'Sala de juntas']])
  })

  it('an employee reserves with motive, participants and headcount; it lands in their calendars', async () => {
    const f = await setup()
    const mara = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Mara', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: f.company.id, userId: mara.id } })
    const r = await reserve(f, f.ana, { participantIds: [f.luis.id, mara.id], headcount: 4 })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual([r.body.data.title, r.body.data.organizerName, r.body.data.resourceName, r.body.data.headcount, r.body.data.participants.map((p) => p.name)], ['Comité', 'Ana', 'Sala de juntas', 4, ['Luis', 'Mara']])
    await createBookingsCalendarProjection({ prisma: db }).project(r.body.data.id)
    const mine = (await f.api(f.luis)('GET', '/bookings/rooms/mine')).body.data
    assert.deepEqual(mine.map((m) => [m.id, m.isOrganizer]), [[r.body.data.id, false]])
    const events = await db.calendarEvent.findMany({ where: { sourceModule: 'runly.bookings', sourceEntityId: r.body.data.id }, include: { calendar: true } })
    const owners = events.map((e) => e.calendar.ownerId)
    assert.ok(owners.includes(f.ana.id) && owners.includes(f.luis.id) && !owners.includes(f.eva.id), 'organizer and participant calendars')
    assert.ok(events.some((e) => e.calendar.ownerId === mara.id && e.calendar.isDefault), 'a default calendar is created for someone who never opened Calendar')
    // Cancelling removes it from every calendar.
    await f.api(f.ana)('POST', `/bookings/rooms/reservations/${r.body.data.id}/cancel`, {})
    await createBookingsCalendarProjection({ prisma: db }).project(r.body.data.id)
    assert.equal(await db.calendarEvent.count({ where: { sourceModule: 'runly.bookings', sourceEntityId: r.body.data.id } }), 0)
    assert.ok(events.every((e) => e.title === 'Comité · Sala de juntas' && e.location === 'Sala de juntas'))

  })

  it('20 employees reserving the same room at the same time: exactly one wins', async () => {
    const f = await setup()
    const people = await Promise.all(Array.from({ length: 20 }, async (_, i) => {
      const u = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: `Persona ${i}`, email: `${tag()}@example.test` } })
      await db.membership.create({ data: { companyId: f.company.id, userId: u.id } })
      return u
    }))
    const results = await Promise.all(people.map((p) => reserve(f, p, { title: `Junta ${p.displayName}` })))
    assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.body?.code).join(','))
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409), [...new Set(results.map((r) => r.body?.code))].join(','))
    // An overlapping range is refused; touching ranges are fine.
    assert.equal((await reserve(f, f.eva, { startsAt: wednesday(16, 30), endsAt: wednesday(17, 30) })).status, 409)
    assert.equal((await reserve(f, f.eva, { startsAt: wednesday(17), endsAt: wednesday(18) })).status, 201)
  })

  it('capacity, office hours, length and the 15-minute grid are enforced', async () => {
    const f = await setup({ policy: { maxMinutes: 120 } })
    assert.equal((await reserve(f, f.ana, { resourceId: f.small.id, headcount: 3 })).body.code, 'NO_CAPACITY')
    assert.equal((await reserve(f, f.ana, { resourceId: f.small.id, participantIds: [f.luis.id, f.eva.id] })).body.code, 'NO_CAPACITY')
    assert.equal((await reserve(f, f.ana, { startsAt: wednesday(13), endsAt: wednesday(14) })).body.code, 'OUTSIDE_HOURS', '07:00 local is before office hours')
    assert.equal((await reserve(f, f.ana, { startsAt: wednesday(16), endsAt: wednesday(19) })).body.code, 'DURATION')
    assert.equal((await reserve(f, f.ana, { startsAt: wednesday(16, 10), endsAt: wednesday(17) })).status, 400)
    assert.equal((await reserve(f, f.ana, { startsAt: wednesday(17), endsAt: wednesday(16) })).status, 400)
  })

  it('who may reserve: company by default, members only when the space says so; no access without a grant', async () => {
    const f = await setup({ policy: { reservers: 'members' } })
    assert.equal((await reserve(f, f.ana)).status, 404)
    assert.deepEqual((await f.api(f.ana)('GET', '/bookings/rooms')).body.data, [])
    await f.boss('PUT', `/bookings/spaces/${f.space.id}/members/${f.ana.id}`, { role: 'viewer' })
    assert.equal((await reserve(f, f.ana)).status, 201)
    assert.equal((await f.api(f.eva, [])('GET', '/bookings/rooms')).status, 403)
  })

  it('organizer or managers cancel and move; others cannot even see it; idempotent retries', async () => {
    const f = await setup()
    const k = key()
    const first = await reserve(f, f.ana, {}, { 'Idempotency-Key': k })
    const again = await reserve(f, f.ana, {}, { 'Idempotency-Key': k })
    assert.deepEqual([again.status, again.body.data.id, again.body.replayed], [200, first.body.data.id, true])
    assert.equal((await reserve(f, f.ana, { title: 'Otra cosa' }, { 'Idempotency-Key': k })).status, 422)
    const id = first.body.data.id
    assert.equal((await f.api(f.luis)('POST', `/bookings/rooms/reservations/${id}/cancel`, {})).status, 404)
    assert.equal((await f.api(f.ana)('POST', `/bookings/rooms/${f.space.id}/reservations`, { resourceId: f.room.id, title: 'x', organizerId: f.luis.id, startsAt: wednesday(18), endsAt: wednesday(19) })).status, 403)
    const moved = await f.api(f.ana)('POST', `/bookings/rooms/reservations/${id}/reschedule`, { startsAt: wednesday(18), endsAt: wednesday(19, 30) })
    assert.deepEqual([moved.status, moved.body.data.resourceName, new Date(moved.body.data.endsAt).toISOString()], [200, 'Sala de juntas', wednesday(19, 30)])
    assert.equal((await reserve(f, f.eva)).status, 201, 'the old slot is free again')
    const cancelled = await f.boss('POST', `/bookings/rooms/reservations/${id}/cancel`, { reason: 'Se movió a otra fecha' })
    assert.equal(cancelled.body.data.status, 'CANCELLED')
    assert.equal((await reserve(f, f.luis, { startsAt: wednesday(18), endsAt: wednesday(19) })).status, 201)
  })

  it('agenda: busy blocks from every space sharing the room, details only for people involved', async () => {
    const f = await setup()
    const other = (await f.boss('POST', '/bookings/spaces', { name: 'Salas compartidas', slug: tag(), timezone: 'America/Mexico_City', purpose: 'resources' })).body.data
    await f.boss('PUT', `/bookings/spaces/${other.id}/resources`, { resourceIds: [f.room.id] })
    await reserve(f, f.ana, { title: 'Presupuesto confidencial', participantIds: [f.luis.id] })
    assert.equal((await f.api(f.eva)('POST', `/bookings/rooms/${other.id}/reservations`, { resourceId: f.room.id, title: 'x', startsAt: wednesday(16), endsAt: wednesday(17) }, { 'Idempotency-Key': key() })).status, 409, 'shared room')
    const q = `from=${encodeURIComponent(wednesday(6))}&to=${encodeURIComponent(wednesday(23))}`
    const forEva = (await f.api(f.eva)('GET', `/bookings/rooms/${f.space.id}/agenda?${q}`)).body.data.resources.find((r) => r.id === f.room.id)
    assert.deepEqual(forEva.busy.map((b) => [b.label, b.title, b.bookingId, b.organizerName]), [['Reservado', undefined, undefined, 'Ana']])
    assert.ok(forEva.hours.length >= 1)
    const forLuis = (await f.api(f.luis)('GET', `/bookings/rooms/${f.space.id}/agenda?${q}`)).body.data.resources.find((r) => r.id === f.room.id)
    assert.equal(forLuis.busy[0].title, 'Presupuesto confidencial')
  })

  it('another company never sees or reserves these rooms', async () => {
    const f = await setup(), g = await setup()
    assert.equal((await g.api(g.ana)('POST', `/bookings/rooms/${f.space.id}/reservations`, { resourceId: f.room.id, title: 'x', startsAt: wednesday(16), endsAt: wednesday(17) })).status, 404)
    assert.equal((await g.api(g.ana)('POST', `/bookings/rooms/${g.space.id}/reservations`, { resourceId: f.room.id, title: 'x', startsAt: wednesday(16), endsAt: wednesday(17) })).body.code, 'RESOURCE_NOT_ELIGIBLE')
    assert.equal((await g.api(g.ana)('GET', `/bookings/rooms/${f.space.id}/agenda?from=${wednesday(6)}&to=${wednesday(23)}`)).status, 404)
    const mine = await reserve(f, f.ana)
    assert.equal((await g.boss('POST', `/bookings/rooms/reservations/${mine.body.data.id}/cancel`, {})).status, 404)
  })
})
