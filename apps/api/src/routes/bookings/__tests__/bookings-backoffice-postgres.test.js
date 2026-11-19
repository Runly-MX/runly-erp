// runly.bookings phase 2: the backoffice journeys over the real router and a
// real, disposable PostgreSQL (BOOKINGS_TEST_DATABASE_URL, localhost only).
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsCommandService } from '../bookings-command-service.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

describe('runly.bookings backoffice journeys on real PostgreSQL', { skip: !url }, () => {
  let db, n = 0
  const clock = { now: Date.parse('2027-01-01T00:00:00Z') }
  const tag = () => `bo-${Date.now()}-${++n}`
  const invalidated = []

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 20 }) })
    await db.permission.upsert({ where: { key: 'bookings.access' }, update: { active: true }, create: { key: 'bookings.access', name: 'Acceder a Reservaciones', moduleKey: 'runly.bookings' } })
  })
  after(async () => { await db?.$disconnect() })

  async function person(companyId) {
    const user = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: `Persona ${tag()}`, email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId, userId: user.id } })
    return user
  }

  // Effective permissions as the API resolves them: role keys ∪ per-user grants.
  async function permissionsOf(companyId, userId, extra = []) {
    const grants = await db.userPermissionGrant.findMany({ where: { companyId, userId, permission: { active: true } }, select: { permission: { select: { key: true } } } })
    return new Set([...extra, ...grants.map((g) => g.permission.key)])
  }

  function api({ companyId, user, roleKeys = [], isAdmin = false }) {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('companyId', companyId)
      c.set('userContext', { isAdmin, permissionSet: await permissionsOf(companyId, user.id, roleKeys), profile: { id: user.id } })
      return next()
    })
    const requirePermission = (key) => async (c, next) => (c.get('userContext').isAdmin || c.get('userContext').permissionSet.has(key) ? next() : c.json({ error: 'Sin permiso' }, 403))
    app.route('', createBookingsRouter({ prisma: db, requirePermission, cacheDel: async (key) => { invalidated.push(key) }, commands: createBookingsCommandService({ prisma: db, now: () => clock.now }) }))
    return async (method, path, body, headers = {}) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const type = res.headers.get('content-type') ?? ''
      return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) }
    }
  }

  it('admin sets up a space, agent and viewer operate within their roles, another company sees nothing', async () => {
    const company = await db.company.create({ data: { name: `Empresa ${tag()}`, slug: tag() } })
    const adminUser = await person(company.id)
    // Catalog manager by role (bookings.access + bookings.spaces.manage), not a company admin.
    const admin = api({ companyId: company.id, user: adminUser, roleKeys: ['bookings.access', 'bookings.spaces.manage'] })

    // 1. Create the space: the creator becomes its admin.
    const space = (await admin('POST', '/bookings/spaces', { name: 'Clínica', slug: tag(), timezone: 'America/Mexico_City', policy: { horizonDays: 730 } })).body.data
    assert.ok(space.id)
    assert.equal((await admin('GET', '/bookings/spaces')).body.data[0].role, 'admin')
    // 2. Resource + service.
    const doctor = (await admin('POST', '/bookings/resources', { name: 'Dra. López', type: 'staff', userId: adminUser.id })).body.data
    assert.equal((await admin('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [doctor.id] })).status, 200)
    const service = (await admin('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60 })).body.data
    assert.equal((await admin('PUT', `/bookings/services/${service.id}/resources`, { resourceIds: [doctor.id] })).status, 200)
    assert.deepEqual((await admin('GET', `/bookings/spaces/${space.id}/services`)).body.data[0].resourceIds, [doctor.id])
    // 3. Weekly hours with a break.
    const rules = ALL_DAYS.flatMap((weekday) => [{ weekday, startTime: '09:00', endTime: '13:00' }, { weekday, startTime: '14:00', endTime: '18:00' }])
    assert.equal((await admin('PUT', `/bookings/spaces/${space.id}/schedule`, { rules })).status, 200)
    const slots = (await admin('GET', `/bookings/spaces/${space.id}/availability?serviceId=${service.id}&from=2027-01-11T06:00:00Z&to=2027-01-12T06:00:00Z`)).body.data.slots
    assert.deepEqual(slots.map((s) => s.startsAt.slice(11, 16)), ['15:00', '16:00', '17:00', '18:00', '20:00', '21:00', '22:00', '23:00'])

    // Team: agent and viewer get bookings.access through their space membership.
    const agentUser = await person(company.id), viewerUser = await person(company.id)
    assert.equal((await api({ companyId: company.id, user: agentUser })('GET', '/bookings/spaces')).status, 403)
    assert.equal((await admin('PUT', `/bookings/spaces/${space.id}/members/${agentUser.id}`, { role: 'agent' })).status, 200)
    assert.equal((await admin('PUT', `/bookings/spaces/${space.id}/members/${viewerUser.id}`, { role: 'viewer' })).status, 200)
    assert.ok(invalidated.some((key) => key.startsWith('user_ctx:')))
    const agent = api({ companyId: company.id, user: agentUser })
    const viewer = api({ companyId: company.id, user: viewerUser })
    assert.deepEqual((await agent('GET', '/bookings/me')).body.data.roles, { [space.id]: 'agent' })

    // 4-5. Manual booking occupies the slot.
    const booking = (await admin('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: service.id, startsAt: '2027-01-11T15:00:00Z', guestName: 'Ana Pérez', guestPhone: '555 100 2000' })).body.data
    assert.equal(booking.status, 'CONFIRMED')
    assert.deepEqual(booking.resourceIds, [doctor.id])
    assert.ok(booking.actions.includes('cancel') && booking.actions.includes('reschedule') && !booking.actions.includes('complete'))
    const after = (await admin('GET', `/bookings/spaces/${space.id}/availability?serviceId=${service.id}&from=2027-01-11T06:00:00Z&to=2027-01-12T06:00:00Z`)).body.data.slots
    assert.ok(!after.some((s) => s.startsAt.startsWith('2027-01-11T15:00')))
    // 6. Another user books the same resource and time: conflict.
    const clash = await agent('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: service.id, startsAt: '2027-01-11T15:00:00Z', guestName: 'Luis' })
    assert.equal(clash.status, 409)
    assert.equal(clash.body.code, 'SLOT_TAKEN')
    // 7. The agent reschedules.
    const moved = await agent('POST', `/bookings/reservations/${booking.id}/reschedule`, { startsAt: '2027-01-11T16:00:00Z', expectedVersion: booking.version })
    assert.equal(moved.status, 200)
    assert.equal(moved.body.data.startsAt.slice(11, 16), '16:00')
    assert.equal((await agent('POST', `/bookings/reservations/${booking.id}/reschedule`, { startsAt: '2027-01-11T17:00:00Z', expectedVersion: booking.version })).body.code, 'VERSION_CONFLICT')
    // 8. The viewer reads but cannot change anything.
    assert.equal((await viewer('GET', `/bookings/reservations/${booking.id}`)).status, 200)
    assert.equal((await viewer('GET', `/bookings/reservations/${booking.id}/history`)).body.data.length, 2)
    for (const [method, path, body] of [
      ['POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: service.id, startsAt: '2027-01-11T20:00:00Z', guestName: 'X' }],
      ['POST', `/bookings/reservations/${booking.id}/cancel`, {}],
      ['POST', `/bookings/reservations/${booking.id}/reschedule`, { startsAt: '2027-01-11T20:00:00Z' }],
      ['PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [] }],
      ['PATCH', `/bookings/services/${service.id}`, { name: 'Otra' }],
      ['PUT', `/bookings/spaces/${space.id}/members/${viewerUser.id}`, { role: 'admin' }],
      ['POST', '/bookings/resources', { name: 'Sala' }],
    ]) assert.equal((await viewer(method, path, body)).status, 403, `${method} ${path}`)
    // The agent operates but does not configure.
    assert.equal((await agent('PATCH', `/bookings/spaces/${space.id}`, { name: 'Otra' })).status, 403)
    // 9. Cancel frees the capacity.
    assert.equal((await agent('POST', `/bookings/reservations/${booking.id}/cancel`, { reason: 'Cliente avisó' })).status, 200)
    assert.equal((await agent('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: service.id, startsAt: '2027-01-11T16:00:00Z', guestName: 'Luis' })).status, 201)
    assert.deepEqual((await viewer('GET', `/bookings/reservations/${booking.id}/history`)).body.data.map((h) => h.action), ['create', 'reschedule', 'cancelled'])

    // 10. Another company: nothing readable or writable, even for its admin.
    const other = await db.company.create({ data: { name: `Otra ${tag()}`, slug: tag() } })
    const outsider = api({ companyId: other.id, user: await person(other.id), isAdmin: true })
    for (const [method, path, body] of [
      ['GET', `/bookings/spaces/${space.id}`], ['GET', `/bookings/spaces/${space.id}/reservations`], ['GET', `/bookings/spaces/${space.id}/summary`],
      ['GET', `/bookings/reservations/${booking.id}`], ['POST', `/bookings/reservations/${booking.id}/cancel`, {}],
      ['PATCH', `/bookings/services/${service.id}`, { name: 'X' }], ['PUT', `/bookings/spaces/${space.id}/members/${agentUser.id}`, { role: 'viewer' }],
    ]) assert.equal((await outsider(method, path, body)).status, 404, `${method} ${path}`)
    assert.deepEqual((await outsider('GET', '/bookings/spaces')).body.data, [])
    assert.deepEqual((await outsider('GET', '/bookings/resources')).body.data, [])

    // Removing a person from their last space takes the access away; the last admin stays.
    assert.equal((await admin('DELETE', `/bookings/spaces/${space.id}/members/${viewerUser.id}`)).status, 200)
    assert.equal((await api({ companyId: company.id, user: viewerUser })('GET', '/bookings/spaces')).status, 403)
    assert.equal((await admin('DELETE', `/bookings/spaces/${space.id}/members/${adminUser.id}`)).body.code, 'LAST_ADMIN')
    // Resources are not readable by someone outside every space without the catalog permission.
    assert.equal((await api({ companyId: company.id, user: viewerUser, roleKeys: ['bookings.access'] })('GET', '/bookings/resources')).status, 403)
  })

  it('search, paging and export of reservations; rule validity windows', async () => {
    const company = await db.company.create({ data: { name: `Empresa ${tag()}`, slug: tag() } })
    const user = await person(company.id)
    const call = api({ companyId: company.id, user, roleKeys: ['bookings.access', 'bookings.spaces.manage'] })
    const space = (await call('POST', '/bookings/spaces', { name: 'Estudio', slug: tag(), timezone: 'America/Mexico_City', policy: { horizonDays: 730 } })).body.data
    const r = (await call('POST', '/bookings/resources', { name: 'Sala A', type: 'room' })).body.data
    await call('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [r.id] })
    const svc = (await call('POST', `/bookings/spaces/${space.id}/services`, { name: 'Ensayo', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60 })).body.data
    await call('PUT', `/bookings/services/${svc.id}/resources`, { resourceIds: [r.id] })
    // Open only during January 2027 (local dates).
    await call('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: ALL_DAYS.map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00', validFrom: '2027-01-01', validTo: '2027-01-31' })) })
    assert.equal((await call('GET', `/bookings/spaces/${space.id}/schedule`)).body.data[0].validTo, '2027-01-31')
    assert.equal((await call('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: svc.id, startsAt: '2027-02-01T16:00:00Z', guestName: 'Fuera' })).body.code, 'OUTSIDE_HOURS')
    assert.equal((await call('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [{ weekday: 1, startTime: '09:00', endTime: '10:00', validFrom: '2027-02-01', validTo: '2027-01-01' }] })).status, 400)

    for (let day = 4; day <= 9; day++) {
      assert.equal((await call('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: svc.id, startsAt: `2027-01-0${day}T16:00:00Z`, guestName: day % 2 ? 'Banda Norte' : 'Coro Sur', guestEmail: `g${day}@example.test` })).status, 201)
    }
    const page1 = (await call('GET', `/bookings/spaces/${space.id}/reservations?limit=4&offset=0`)).body
    const page2 = (await call('GET', `/bookings/spaces/${space.id}/reservations?limit=4&offset=4`)).body
    assert.equal(page1.total, 6)
    assert.equal(page1.data.length, 4)
    assert.equal(page2.data.length, 2)
    assert.equal((await call('GET', `/bookings/spaces/${space.id}/reservations?q=norte`)).body.total, 3)
    assert.equal((await call('GET', `/bookings/spaces/${space.id}/reservations?q=${encodeURIComponent('%')}`)).body.total, 0)
    assert.equal((await call('GET', `/bookings/spaces/${space.id}/reservations?resourceId=${r.id}&from=2027-01-06T00:00:00Z`)).body.total, 4)
    const summary = (await call('GET', `/bookings/spaces/${space.id}/summary`)).body.data
    assert.equal(summary.services, 1)
    assert.equal(summary.resources, 1)

    const file = await call('GET', `/bookings/spaces/${space.id}/reservations/export?q=coro`)
    assert.equal(file.status, 200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(file.body)
    const sheet = workbook.getWorksheet('Reservaciones')
    assert.equal(sheet.rowCount, 4)
    assert.equal(sheet.getRow(1).getCell(1).value, 'Inicio (America/Mexico_City)')
    assert.equal(sheet.getRow(2).getCell(1).value, '2027-01-04 10:00')
    assert.equal(sheet.getRow(2).getCell(5).value, 'Sala A')
  })
})
