// runly.bookings phase 1 acceptance against a real, disposable PostgreSQL
// (BOOKINGS_TEST_DATABASE_URL, localhost only). Spec 2026-11-18-bookings-engine-design.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsCommandService, TRANSITIONS } from '../bookings-command-service.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')

const H = 3600000
const MANAGE = 'bookings.access,bookings.spaces.manage'
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

describe('runly.bookings engine on real PostgreSQL', { skip: !url }, () => {
  let db, n = 0
  const clock = { now: Date.parse('2027-01-01T00:00:00Z') }
  const tag = () => `bk-${Date.now()}-${++n}`

  before(() => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 25 }) }) })
  after(async () => { await db?.$disconnect() })

  async function person(companyId) {
    const user = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: `Persona ${tag()}`, email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId, userId: user.id } })
    return user
  }

  function api({ companyId, user, permissions = MANAGE, isAdmin = false, prisma = db }) {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('companyId', companyId)
      c.set('userContext', { isAdmin, permissionSet: new Set(permissions.split(',')), profile: { id: user.id } })
      return next()
    })
    const requirePermission = (key) => async (c, next) => (c.get('userContext').isAdmin || c.get('userContext').permissionSet.has(key) ? next() : c.json({ error: 'Sin permiso' }, 403))
    app.route('', createBookingsRouter({ prisma, requirePermission, commands: createBookingsCommandService({ prisma, now: () => clock.now }) }))
    return async (method, path, body, headers = {}) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: res.status, body: await res.json() }
    }
  }

  // One company, a manager (space admin), one space, one service and N resources.
  async function setup({ timezone = 'America/Mexico_City', policy = {}, rules = ALL_DAYS.map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' })), service = {}, resources = 1 } = {}) {
    const company = await db.company.create({ data: { name: `Empresa ${tag()}`, slug: tag() } })
    const manager = await person(company.id)
    const call = api({ companyId: company.id, user: manager })
    const space = (await call('POST', '/bookings/spaces', { name: 'Consultorio', slug: tag(), timezone, policy: { horizonDays: 730, ...policy } })).body.data
    assert.ok(space?.id, 'space created')
    const resourceIds = []
    for (let i = 0; i < resources; i++) resourceIds.push((await call('POST', '/bookings/resources', { name: `Recurso ${i + 1}`, type: 'staff' })).body.data.id)
    assert.equal((await call('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds })).status, 200)
    const svc = (await call('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 30, ...service })).body.data
    assert.ok(svc?.id, 'service created')
    assert.equal((await call('PUT', `/bookings/services/${svc.id}/resources`, { resourceIds })).status, 200)
    assert.equal((await call('PUT', `/bookings/spaces/${space.id}/schedule`, { rules })).status, 200)
    return { company, manager, call, space, service: svc, resourceIds }
  }

  const book = (f, startsAt, extra = {}, headers = {}, call = f.call) =>
    call('POST', `/bookings/spaces/${f.space.id}/reservations`, { serviceId: f.service.id, guestName: 'Ana', ...(startsAt ? { startsAt } : {}), ...extra }, headers)
  const counts = async (f) => ({
    bookings: await db.booking.count({ where: { companyId: f.company.id } }),
    active: await db.bookingAllocation.count({ where: { companyId: f.company.id, active: true } }),
    allocations: await db.bookingAllocation.count({ where: { companyId: f.company.id } }),
    history: await db.bookingHistory.count({ where: { companyId: f.company.id } }),
    outbox: await db.domainEventOutbox.count({ where: { companyId: f.company.id, event: { startsWith: 'bookings.' } } }),
  })

  it('20 simultaneous requests for one resource and time produce exactly one booking and nothing orphaned', async () => {
    const f = await setup()
    const results = await Promise.all(Array.from({ length: 20 }, () => book(f, '2027-01-04T16:00:00Z')))
    assert.equal(results.filter((r) => r.status === 201).length, 1)
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.body.code === 'SLOT_TAKEN'), JSON.stringify(results.find((r) => r.status !== 201 && r.status !== 409)?.body))
    assert.deepEqual(await counts(f), { bookings: 1, active: 1, allocations: 1, history: 1, outbox: 1 })
  })

  it('20 simultaneous requests for a session of capacity 5 produce exactly five bookings', async () => {
    const f = await setup({ service: { kind: 'session', capacity: 5, maxParty: 4 } })
    const session = (await f.call('POST', `/bookings/spaces/${f.space.id}/sessions`, { serviceId: f.service.id, startsAt: '2027-01-05T16:00:00Z', resourceId: f.resourceIds[0] })).body.data
    const results = await Promise.all(Array.from({ length: 20 }, () => book(f, null, { sessionId: session.id })))
    assert.equal(results.filter((r) => r.status === 201).length, 5)
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.body.code === 'SESSION_FULL'))
    const row = await db.bookingSession.findUnique({ where: { id: session.id } })
    assert.equal(row.seatsTaken, 5)
    assert.equal(await db.booking.count({ where: { sessionId: session.id } }), 5)
    // A party that does not fit is rejected without consuming seats; cancelling frees them.
    const one = results.find((r) => r.status === 201).body.data
    assert.equal((await book(f, null, { sessionId: session.id, partySize: 2 })).body.code, 'SESSION_FULL')
    assert.equal((await f.call('POST', `/bookings/reservations/${one.id}/cancel`, {})).status, 200)
    assert.equal((await db.bookingSession.findUnique({ where: { id: session.id } })).seatsTaken, 4)
    assert.equal((await book(f, null, { sessionId: session.id })).status, 201)
  })

  it('two simultaneous reschedules into the same slot: one wins, the loser keeps its original slot', async () => {
    const f = await setup()
    const a = (await book(f, '2027-01-06T15:00:00Z')).body.data
    const b = (await book(f, '2027-01-06T17:00:00Z')).body.data
    const moves = await Promise.all([a, b].map((x) => f.call('POST', `/bookings/reservations/${x.id}/reschedule`, { startsAt: '2027-01-06T20:00:00Z' })))
    assert.deepEqual(moves.map((m) => m.status).sort(), [200, 409])
    const loser = [a, b][moves.findIndex((m) => m.status === 409)]
    const kept = await db.booking.findUnique({ where: { id: loser.id } })
    assert.equal(kept.startsAt.toISOString(), new Date(loser.startsAt).toISOString())
    assert.equal(await db.bookingAllocation.count({ where: { bookingId: loser.id, active: true } }), 1)
    assert.equal((await counts(f)).active, 2)
    // Moving inside its own overlapping range works because the old allocation is freed first.
    const winner = [a, b][moves.findIndex((m) => m.status === 200)]
    assert.equal((await f.call('POST', `/bookings/reservations/${winner.id}/reschedule`, { startsAt: '2027-01-06T20:30:00Z' })).status, 200)
    // Rescheduled-away slot is free again.
    assert.equal((await book(f, '2027-01-06T20:00:00Z')).status, 409)
    assert.equal((await book(f, new Date(loser.startsAt).toISOString() === '2027-01-06T15:00:00.000Z' ? '2027-01-06T17:00:00Z' : '2027-01-06T15:00:00Z')).status, 201)
  })

  it('idempotency: exact repeats replay, a reused key with another payload fails, a failed attempt can be retried', async () => {
    const f = await setup()
    const key = { 'Idempotency-Key': tag() }
    const first = await book(f, '2027-01-07T16:00:00Z', {}, key)
    const again = await book(f, '2027-01-07T16:00:00Z', {}, key)
    assert.equal(first.status, 201)
    assert.equal(again.status, 200)
    assert.equal(again.body.replayed, true)
    assert.equal(again.body.data.id, first.body.data.id)
    const reused = await book(f, '2027-01-07T18:00:00Z', {}, key)
    assert.equal(reused.status, 422)
    assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED')
    // Parallel duplicates of one key create one booking.
    const parallelKey = { 'Idempotency-Key': tag() }
    const parallel = await Promise.all(Array.from({ length: 6 }, () => book(f, '2027-01-07T20:00:00Z', {}, parallelKey)))
    assert.equal(new Set(parallel.map((r) => r.body.data?.id)).size, 1)
    assert.equal(parallel.filter((r) => r.status === 201).length, 1)
    // A failed attempt leaves no idempotency record: once the slot frees, the same key succeeds once.
    const retryKey = { 'Idempotency-Key': tag() }
    assert.equal((await book(f, '2027-01-07T16:00:00Z', {}, retryKey)).status, 409)
    assert.equal(await db.bookingIdempotency.count({ where: { companyId: f.company.id, key: retryKey['Idempotency-Key'] } }), 0)
    assert.equal((await f.call('POST', `/bookings/reservations/${first.body.data.id}/cancel`, {}, { 'Idempotency-Key': tag() })).status, 200)
    const retried = await book(f, '2027-01-07T16:00:00Z', {}, retryKey)
    assert.equal(retried.status, 201)
    assert.equal((await book(f, '2027-01-07T16:00:00Z', {}, retryKey)).body.data.id, retried.body.data.id)
    // Transitions too: a repeated cancel with its key replays instead of failing.
    const cancelKey = { 'Idempotency-Key': tag() }
    assert.equal((await f.call('POST', `/bookings/reservations/${retried.body.data.id}/cancel`, {}, cancelKey)).status, 200)
    const replay = await f.call('POST', `/bookings/reservations/${retried.body.data.id}/cancel`, {}, cancelKey)
    assert.equal(replay.status, 200)
    assert.equal(replay.body.replayed, true)
    assert.equal(await db.bookingHistory.count({ where: { bookingId: retried.body.data.id, action: 'cancelled' } }), 1)
  })

  it('isolation: another company, a non-member and a viewer cannot operate on the space', async () => {
    const f = await setup()
    const booking = (await book(f, '2027-01-08T16:00:00Z')).body.data
    const other = await setup()
    const outsiderCompany = api({ companyId: other.company.id, user: other.manager })
    for (const [method, path] of [['GET', `/bookings/reservations/${booking.id}`], ['POST', `/bookings/reservations/${booking.id}/cancel`], ['POST', `/bookings/reservations/${booking.id}/reschedule`], ['GET', `/bookings/spaces/${f.space.id}`], ['GET', `/bookings/spaces/${f.space.id}/reservations`]]) {
      const res = await outsiderCompany(method, path, method === 'GET' ? undefined : path.endsWith('reschedule') ? { startsAt: '2027-01-08T18:00:00Z' } : {})
      assert.equal(res.status, 404, `${method} ${path}`)
    }
    // Admin of another company is still scoped to their own company.
    assert.equal((await api({ companyId: other.company.id, user: other.manager, isAdmin: true })('GET', `/bookings/reservations/${booking.id}`)).status, 404)
    // Cross-company references are rejected by the service and by the composite foreign keys.
    assert.equal((await f.call('PUT', `/bookings/spaces/${f.space.id}/resources`, { resourceIds: [other.resourceIds[0]] })).status, 404)
    await assert.rejects(db.$executeRaw`INSERT INTO booking_space_resource (company_id, space_id, resource_id) VALUES (${f.company.id}::uuid, ${f.space.id}::uuid, ${other.resourceIds[0]}::uuid)`)
    // Same company, not a member of the space.
    const stranger = api({ companyId: f.company.id, user: await person(f.company.id), permissions: 'bookings.access' })
    assert.equal((await stranger('GET', `/bookings/spaces/${f.space.id}`)).status, 403)
    assert.equal((await book(f, '2027-01-08T18:00:00Z', {}, {}, stranger)).status, 403)
    assert.equal((await stranger('POST', `/bookings/reservations/${booking.id}/cancel`, {})).status, 403)
    assert.equal((await stranger('POST', '/bookings/resources', { name: 'X' })).status, 403)
    // Viewer reads but cannot write.
    const viewerUser = await person(f.company.id)
    assert.equal((await f.call('PUT', `/bookings/spaces/${f.space.id}/members/${viewerUser.id}`, { role: 'viewer' })).status, 200)
    const viewer = api({ companyId: f.company.id, user: viewerUser, permissions: 'bookings.access' })
    assert.equal((await viewer('GET', `/bookings/reservations/${booking.id}`)).status, 200)
    assert.equal((await viewer('GET', `/bookings/spaces/${f.space.id}/reservations`)).body.data.length, 1)
    assert.equal((await book(f, '2027-01-08T18:00:00Z', {}, {}, viewer)).status, 403)
    assert.equal((await viewer('POST', `/bookings/reservations/${booking.id}/cancel`, {})).status, 403)
    assert.equal((await viewer('PATCH', `/bookings/spaces/${f.space.id}`, { name: 'Otro' })).status, 403)
    // Agent operates bookings but cannot configure the space.
    const agentUser = await person(f.company.id)
    await f.call('PUT', `/bookings/spaces/${f.space.id}/members/${agentUser.id}`, { role: 'agent' })
    const agent = api({ companyId: f.company.id, user: agentUser, permissions: 'bookings.access' })
    assert.equal((await book(f, '2027-01-08T18:00:00Z', {}, {}, agent)).status, 201)
    assert.equal((await agent('PUT', `/bookings/spaces/${f.space.id}/schedule`, { rules: [] })).status, 403)
    // Without the module permission nothing is reachable.
    assert.equal((await api({ companyId: f.company.id, user: agentUser, permissions: '' })('GET', '/bookings/spaces')).status, 403)
    assert.equal((await db.booking.findUnique({ where: { id: booking.id } })).status, 'CONFIRMED')
  })

  it('every transition between the seven states is allowed or rejected exactly as the state machine says', async () => {
    const f = await setup({ policy: { requiresApproval: true, holdMinutes: 60 } })
    const TARGETS = { confirm: 'CONFIRMED', reject: 'REJECTED', cancel: 'CANCELLED', complete: 'COMPLETED', 'no-show': 'NO_SHOW' }
    const PATH_TO = Object.fromEntries(Object.entries(TARGETS).map(([path, to]) => [to, path]))
    const DRIVE = { PENDING: [], CONFIRMED: ['CONFIRMED'], CANCELLED: ['CANCELLED'], REJECTED: ['REJECTED'], COMPLETED: ['CONFIRMED', 'COMPLETED'], NO_SHOW: ['CONFIRMED', 'NO_SHOW'] }
    let hour = 0
    const startOf = () => new Date(Date.parse('2027-02-01T15:00:00Z') + 86400000 * Math.floor(hour / 8) + H * (hour++ % 8)).toISOString()
    async function bookingIn(state) {
      const startsAt = startOf()
      if (state === 'EXPIRED') {
        clock.now = Date.now() - 2 * H
        const created = (await book(f, startsAt)).body.data
        clock.now = Date.parse('2027-01-01T00:00:00Z')
        await createBookingsCommandService({ prisma: db }).expireHolds({ companyId: f.company.id })
        return created
      }
      const created = (await book(f, startsAt)).body.data
      for (const to of DRIVE[state]) {
        if (to === 'COMPLETED' || to === 'NO_SHOW') clock.now = Date.parse(startsAt) + H
        const res = await f.call('POST', `/bookings/reservations/${created.id}/${PATH_TO[to]}`, {})
        clock.now = Date.parse('2027-01-01T00:00:00Z')
        assert.equal(res.status, 200, `${state} via ${to}: ${JSON.stringify(res.body)}`)
      }
      return created
    }
    for (const from of ['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW', 'EXPIRED']) {
      for (const [path, to] of Object.entries(TARGETS)) {
        const b = await bookingIn(from)
        assert.equal((await db.booking.findUnique({ where: { id: b.id } })).status, from)
        if (to === 'COMPLETED' || to === 'NO_SHOW') clock.now = Date.parse(b.startsAt) + H
        const res = await f.call('POST', `/bookings/reservations/${b.id}/${path}`, {})
        clock.now = Date.parse('2027-01-01T00:00:00Z')
        const allowed = (TRANSITIONS[from] ?? []).includes(to)
        assert.equal(res.status, allowed ? 200 : 409, `${from} -> ${to}: ${JSON.stringify(res.body)}`)
        const row = await db.booking.findUnique({ where: { id: b.id } })
        assert.equal(row.status, allowed ? to : from)
        const occupying = ['PENDING', 'CONFIRMED'].includes(row.status)
        assert.equal(await db.bookingAllocation.count({ where: { bookingId: b.id, active: true } }), occupying ? 1 : 0, `${from} -> ${to} allocation`)
      }
    }
    // COMPLETED / NO_SHOW are refused before the booking starts.
    const early = await bookingIn('CONFIRMED')
    assert.equal((await f.call('POST', `/bookings/reservations/${early.id}/complete`, {})).body.code, 'NOT_STARTED')
  })

  it('adjacent intervals coexist, buffers and exceptions apply, cancel frees, midnight-crossing hours work', async () => {
    const f = await setup()
    assert.equal((await book(f, '2027-01-11T16:00:00Z')).status, 201)
    assert.equal((await book(f, '2027-01-11T17:00:00Z')).status, 201)
    assert.equal((await book(f, '2027-01-11T15:00:00Z')).status, 201)
    assert.equal((await book(f, '2027-01-11T16:30:00Z')).status, 409)
    // Outside hours (09:00-18:00 local = 15:00-24:00Z) and past the day.
    assert.equal((await book(f, '2027-01-11T14:00:00Z')).body.code, 'OUTSIDE_HOURS')
    assert.equal((await book(f, '2027-01-12T00:30:00Z')).body.code, 'OUTSIDE_HOURS')
    // Closed exception blocks, open exception adds hours.
    assert.equal((await f.call('POST', '/bookings/exceptions', { spaceId: f.space.id, startsAt: '2027-01-12T18:00:00Z', endsAt: '2027-01-12T19:00:00Z', kind: 'closed', reason: 'Comida' })).status, 201)
    assert.equal((await book(f, '2027-01-12T18:00:00Z')).body.code, 'OUTSIDE_HOURS')
    assert.equal((await book(f, '2027-01-12T19:00:00Z')).status, 201)
    assert.equal((await f.call('POST', '/bookings/exceptions', { spaceId: f.space.id, startsAt: '2027-01-13T12:00:00Z', endsAt: '2027-01-13T15:00:00Z', kind: 'open' })).status, 201)
    assert.equal((await book(f, '2027-01-13T13:00:00Z')).status, 201)
    // Cancelling frees the slot for a new booking.
    const c = (await book(f, '2027-01-14T16:00:00Z')).body.data
    assert.equal((await f.call('POST', `/bookings/reservations/${c.id}/cancel`, { reason: 'Cliente' })).status, 200)
    assert.equal((await book(f, '2027-01-14T16:00:00Z')).status, 201)
    const hist = (await f.call('GET', `/bookings/reservations/${c.id}/history`)).body.data
    assert.deepEqual(hist.map((h) => h.action), ['create', 'cancelled'])
    assert.equal(hist[1].after.reason, 'Cliente')

    const buffered = await setup({ service: { bufferAfterMinutes: 15 } })
    assert.equal((await book(buffered, '2027-01-11T16:00:00Z')).status, 201)
    assert.equal((await book(buffered, '2027-01-11T17:00:00Z')).body.code, 'SLOT_TAKEN')
    assert.equal((await book(buffered, '2027-01-11T17:15:00Z')).status, 201)

    const night = await setup({ rules: [{ weekday: 5, startTime: '20:00', endTime: '02:00' }] })
    // Friday 2027-01-15 23:30 local (UTC-6) = Saturday 05:30Z, ends after midnight.
    assert.equal((await book(night, '2027-01-16T05:30:00Z')).status, 201)
    const slots = (await night.call('GET', `/bookings/spaces/${night.space.id}/availability?serviceId=${night.service.id}&from=2027-01-16T02:00:00Z&to=2027-01-16T09:00:00Z`)).body.data.slots.map((s) => s.startsAt)
    assert.deepEqual(slots, ['2027-01-16T02:00:00.000Z', '2027-01-16T02:30:00.000Z', '2027-01-16T03:00:00.000Z', '2027-01-16T03:30:00.000Z', '2027-01-16T04:00:00.000Z', '2027-01-16T04:30:00.000Z', '2027-01-16T06:30:00.000Z', '2027-01-16T07:00:00.000Z'])
  })

  it('DST in an IANA zone: nonexistent local hours vanish, ambiguous ones resolve once', async () => {
    const tz = 'America/New_York'
    // 2027-03-14 spring forward (02:00-03:00 does not exist); 2027-11-07 fall back (01:00-02:00 twice). Both Sundays.
    const f = await setup({ timezone: tz, rules: [{ weekday: 0, startTime: '01:00', endTime: '04:00' }] })
    const slotsOn = async (from, to) => (await f.call('GET', `/bookings/spaces/${f.space.id}/availability?serviceId=${f.service.id}&from=${from}&to=${to}`)).body.data.slots.map((s) => s.startsAt)
    // Spring: 01:00 EST (06:00Z) .. 04:00 EDT (08:00Z) is two real hours.
    assert.deepEqual(await slotsOn('2027-03-14T00:00:00Z', '2027-03-15T00:00:00Z'), ['2027-03-14T06:00:00.000Z', '2027-03-14T06:30:00.000Z', '2027-03-14T07:00:00.000Z'])
    // Normal Sunday: 01:00 EST..04:00 EST = 06:00Z..09:00Z.
    assert.equal((await slotsOn('2027-03-07T00:00:00Z', '2027-03-08T00:00:00Z')).length, 5)
    // Fall back: ambiguous 01:00 resolves to the later (EST) occurrence: 06:00Z..09:00Z.
    assert.deepEqual(await slotsOn('2027-11-07T00:00:00Z', '2027-11-08T00:00:00Z'), ['2027-11-07T06:00:00.000Z', '2027-11-07T06:30:00.000Z', '2027-11-07T07:00:00.000Z', '2027-11-07T07:30:00.000Z', '2027-11-07T08:00:00.000Z'])
    // A booking at a real instant inside the spring window is accepted; outside is not.
    assert.equal((await book(f, '2027-03-14T07:00:00Z')).status, 201)
    assert.equal((await book(f, '2027-03-14T07:30:00Z')).body.code, 'OUTSIDE_HOURS')
    // Invalid zone names are refused before any data is written.
    assert.equal((await f.call('POST', '/bookings/spaces', { name: 'X', slug: tag(), timezone: 'Mars/Olympus' })).body.code, 'INVALID_TIMEZONE')
  })

  it('a failure after the booking insert rolls back booking, allocation, seats, history, outbox and idempotency', async () => {
    const f = await setup()
    const session = (await setup({ service: { kind: 'session', capacity: 3 } }))
    const s = (await session.call('POST', `/bookings/spaces/${session.space.id}/sessions`, { serviceId: session.service.id, startsAt: '2027-01-20T16:00:00Z' })).body.data
    // Same database, but the outbox write throws inside the transaction.
    const failing = new Proxy(db, {
      get(target, prop) {
        if (prop !== '$transaction') return target[prop]
        return (fn, options) => target.$transaction((tx) => fn(new Proxy(tx, { get: (t, p) => (p === 'domainEventOutbox' ? { create: async () => { throw new Error('outbox down') } } : t[p]) })), options)
      },
    })
    for (const [fixture, body] of [[f, { startsAt: '2027-01-20T16:00:00Z' }], [session, { sessionId: s.id }]]) {
      const before = await counts(fixture)
      const res = await book(fixture, null, body, { 'Idempotency-Key': 'fail-once' }, api({ companyId: fixture.company.id, user: fixture.manager, prisma: failing }))
      assert.equal(res.status, 500)
      assert.deepEqual(await counts(fixture), before)
      assert.equal(await db.bookingIdempotency.count({ where: { companyId: fixture.company.id } }), 0)
    }
    assert.equal((await db.bookingSession.findUnique({ where: { id: s.id } })).seatsTaken, 0)
    // History is append-only at the database level.
    const ok = (await book(f, '2027-01-20T16:00:00Z')).body.data
    await assert.rejects(db.$executeRaw`UPDATE booking_history SET action = 'x' WHERE booking_id = ${ok.id}::uuid`, /append-only/)
    await assert.rejects(db.$executeRaw`DELETE FROM booking_history WHERE booking_id = ${ok.id}::uuid`, /append-only/)
  })

  it('expired holds stop occupying the slot and appear as EXPIRED', async () => {
    const f = await setup({ policy: { requiresApproval: true, holdMinutes: 30 } })
    clock.now = Date.now() - 2 * H
    const stale = (await book(f, '2027-01-21T16:00:00Z')).body.data
    clock.now = Date.parse('2027-01-01T00:00:00Z')
    assert.equal(stale.status, 'PENDING')
    const slots = (await f.call('GET', `/bookings/spaces/${f.space.id}/availability?serviceId=${f.service.id}&from=2027-01-21T16:00:00Z&to=2027-01-21T17:00:00Z`)).body.data.slots
    assert.ok(slots.some((s) => s.startsAt === '2027-01-21T16:00:00.000Z'))
    const fresh = await book(f, '2027-01-21T16:00:00Z')
    assert.equal(fresh.status, 201)
    assert.equal((await db.booking.findUnique({ where: { id: stale.id } })).status, 'EXPIRED')
    assert.equal((await f.call('POST', `/bookings/reservations/${stale.id}/confirm`, {})).body.code, 'INVALID_TRANSITION')
  })
})
