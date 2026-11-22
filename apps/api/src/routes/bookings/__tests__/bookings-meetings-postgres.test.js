// runly.bookings v1.2 R2: online appointments on Runly Chat/Llamadas against a real,
// disposable PostgreSQL (BOOKINGS_TEST_DATABASE_URL, localhost only). LiveKit is only
// configured (never reached): the room is prepared, never started by the engine.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsPortalRouter } from '../bookings-public-routes.js'
import { createBookingsCommandService } from '../bookings-command-service.js'
import { createBookingsMeetings, MEETING_GRACE_MS } from '../bookings-meetings.js'
import { createBookingsNotifier } from '../bookings-notifications.js'
import { createCallLinksService } from '../../calls/call-links-service.js'
import { createCallGuestService } from '../../calls/call-guest-service.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const ENV = {
  BOOKINGS_LINK_SECRET: 'meetings-test-secret', PUBLIC_APP_URL: 'https://app.example.test', CORS_ORIGIN: 'https://app.example.test',
  LIVEKIT_MODE: 'external', LIVEKIT_URL: 'ws://127.0.0.1:9', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-test-secret-test-secret',
}
const OPEN = { reads: [10000, 100], creates: [10000, 100], pageCreates: [10000, 100], manageWrites: [10000, 100] }

describe('runly.bookings online meetings (v1.2 R2) on real PostgreSQL', { skip: !url }, () => {
  let db, meetings, n = 0
  const tag = () => `mt-${Date.now()}-${++n}`
  const key = () => `${crypto.randomUUID()}-${++n}`
  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 25 }) })
    Object.assign(process.env, { BOOKINGS_LINK_SECRET: ENV.BOOKINGS_LINK_SECRET })
    meetings = createBookingsMeetings({ prisma: db, env: ENV, log: () => {} })
  })
  after(async () => { await db?.$disconnect() })

  const http = (app) => async (method, path, body, headers = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  // Projections are run explicitly by the tests (no after-commit hook), so each step is observable.
  const commands = () => createBookingsCommandService({ prisma: db })
  const publicApi = () => {
    const app = new Hono()
    app.route('', createBookingsPortalRouter({ prisma: db, env: ENV, limits: OPEN, meetings, getBrand: async () => null, portal: null }))
    return http(app)
  }
  function adminApi(companyId, user) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', companyId); c.set('userContext', { isAdmin: true, permissionSet: new Set(), profile: { id: user.id } }); return next() })
    app.route('', createBookingsRouter({ prisma: db, env: ENV, requirePermission: () => async (_c, next) => next(), commands: commands(), meetings }))
    return http(app)
  }

  async function setup({ meeting = { kind: 'runly' }, policy = {} } = {}) {
    const company = await db.company.create({ data: { name: `Empresa ${tag()}`, slug: tag() } })
    const person = async (name) => {
      const u = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: name, email: `${tag()}@example.test` } })
      await db.membership.create({ data: { companyId: company.id, userId: u.id } })
      return u
    }
    const user = await person('Admin'), doctor = await person('Dra. Luna')
    const admin = adminApi(company.id, user)
    const space = (await admin('POST', '/bookings/spaces', { name: 'Consultorio', slug: tag(), timezone: 'America/Mexico_City', policy: { horizonDays: 730, ...policy } })).body.data
    const resource = (await admin('POST', '/bookings/resources', { name: 'Dra. Luna', type: 'staff', userId: doctor.id })).body.data
    await admin('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [resource.id] })
    const created = await admin('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta en línea', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60, meeting })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const service = created.body.data
    await admin('PUT', `/bookings/services/${service.id}/resources`, { resourceIds: [resource.id] })
    await admin('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' })) })
    const slug = `m-${tag()}`.slice(0, 60)
    const page = (await admin('POST', `/bookings/spaces/${space.id}/pages`, { slug, title: 'Citas en línea', serviceIds: [service.id], published: true, privacyNotice: 'Solo para tu cita.' })).body.data
    await admin('PATCH', `/bookings/spaces/${space.id}`, { published: true })
    return { company, user, doctor, admin, space, service, resource, page, slug }
  }
  const book = (pub, f, startsAt = '2027-01-11T16:00:00Z') => pub('POST', `/public/bookings/pages/${f.slug}/reservations`, {
    serviceId: f.service.id, startsAt, guestName: 'Ana Pérez', guestEmail: 'ana@example.test', acceptedPolicyVersion: f.page.policyVersion,
  }, { 'Idempotency-Key': key() })
  const bookingOf = async (reference) => (await db.$queryRaw`SELECT * FROM booking WHERE reference = ${reference}`)[0]
  const meetingRow = async (bookingId) => (await db.$queryRaw`
    SELECT m.*, l.token, l.expires_at, l.revoked_at AS link_revoked_at, l.access_mode, c.company_id AS conversation_company, c.is_public, c.metadata
      FROM booking_meeting m JOIN call_link l ON l.id = m.call_link_id JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.booking_id = ${bookingId}::uuid`)[0]

  it('services: https-only external links; online sessions are refused', async () => {
    const f = await setup({ meeting: { kind: 'none' } })
    const bad = await f.admin('PATCH', `/bookings/services/${f.service.id}`, { meeting: { kind: 'external', url: 'http://zoom.example/j/1' } })
    assert.equal(bad.status, 400)
    const session = await f.admin('POST', `/bookings/spaces/${f.space.id}/services`, { name: 'Taller', kind: 'session', durationMinutes: 60, meeting: { kind: 'runly' } })
    assert.equal(session.body.code, 'MEETING_SESSION')
    const good = await f.admin('PATCH', `/bookings/services/${f.service.id}`, { meeting: { kind: 'external', url: 'https://meet.example/abc' } })
    assert.deepEqual(good.body.data.meeting, { kind: 'external', url: 'https://meet.example/abc' })
  })

  it('a pending booking gets no room; once confirmed, concurrent projections prepare exactly one lobby room', async () => {
    const f = await setup({ policy: { requiresApproval: true } })
    const pub = publicApi()
    const made = await book(pub, f)
    assert.equal(made.status, 201, JSON.stringify(made.body))
    assert.equal(made.body.data.status, 'PENDING')
    assert.equal(made.body.data.meeting, null, 'no link while pending')
    const row = await bookingOf(made.body.data.reference)
    assert.equal(await meetings.project(row.id), 'none')
    const confirmed = await f.admin('POST', `/bookings/reservations/${row.id}/confirm`, {}, { 'Idempotency-Key': key() })
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body))
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => meetings.project(row.id)))
    assert.deepEqual(outcomes.filter((o) => o === 'created').length, 1, outcomes.join(','))
    const rooms = await db.$queryRaw`SELECT id FROM chat_conversations WHERE metadata->>'bookingId' = ${row.id}`
    assert.equal(rooms.length, 1, 'one room, no orphans')
    const m = await meetingRow(row.id)
    assert.equal(m.access_mode, 'LOBBY')
    assert.equal(m.is_public, false)
    assert.equal(m.metadata.origin, 'meeting')
    assert.equal(m.conversation_company, f.company.id)
    const hosts = await db.$queryRaw`SELECT user_id FROM chat_conversation_members WHERE conversation_id = ${m.conversation_id}::uuid AND left_at IS NULL`
    assert.deepEqual(hosts.map((h) => h.user_id), [f.doctor.id], 'the person behind the booked resource hosts')
    assert.equal(new Date(m.expires_at).getTime(), new Date(row.ends_at).getTime() + MEETING_GRACE_MS)
    // The customer sees only the lobby link, never the channel or the meeting ID.
    const manage = (await pub('GET', '/public/bookings/manage', null, { 'X-Booking-Token': made.body.manageToken })).body.data
    assert.deepEqual(manage.booking.meeting, { kind: 'runly', url: `https://app.example.test/p/call/${m.token}` })
    assert.ok(!JSON.stringify(manage).includes(m.conversation_id), 'no conversation id leaks')
    // Staff: the host opens the room; the admin (not a member) sees it exists without the channel.
    const staff = (await f.admin('GET', `/bookings/reservations/${row.id}`)).body.data
    assert.deepEqual(staff.meeting, { kind: 'runly', conversationId: null })
    assert.deepEqual(await meetings.staffMeeting(f.company.id, row.id, f.doctor.id), { kind: 'runly', conversationId: m.conversation_id })
  })

  it('an external guest waits until a host starts the call, then enters the lobby; cancel revokes and removes guests', async () => {
    const f = await setup()
    const pub = publicApi()
    const made = await book(pub, f)
    const row = await bookingOf(made.body.data.reference)
    assert.ok(made.body.data.meeting?.url, 'confirmed on creation: link prepared before answering')
    const m = await meetingRow(row.id)
    const links = createCallLinksService({ prisma: db, env: ENV })
    const guests = createCallGuestService({ prisma: db, env: ENV, linksService: links })
    const early = await guests.joinAsGuest({ token: m.token, displayName: 'Ana Pérez', ip: `10.0.${n}.1` })
    assert.equal(early.status, 'waiting', 'nothing started in advance')
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS c FROM call WHERE conversation_id = ${m.conversation_id}::uuid`)[0].c, 0)
    await db.$executeRaw`INSERT INTO call (conversation_id, kind, status, initiated_by_user_id, livekit_room_name) VALUES (${m.conversation_id}::uuid, 'VIDEO', 'ACTIVE', ${f.doctor.id}::uuid, ${`room-${tag()}`})`
    const joined = await guests.joinAsGuest({ token: m.token, displayName: 'Ana Pérez', ip: `10.0.${n}.2` })
    assert.equal(joined.status, 'LOBBY', 'the host admits the guest')

    const cancelled = await f.admin('POST', `/bookings/reservations/${row.id}/cancel`, {}, { 'Idempotency-Key': key() })
    assert.equal(cancelled.status, 200)
    assert.equal(await meetings.project(row.id), 'revoked')
    assert.equal(await meetings.project(row.id), 'none', 'idempotent')
    await assert.rejects(links.resolveLinkForJoin({ token: m.token }), (e) => e.status === 410 && e.reason === 'revoked')
    const guest = (await db.$queryRaw`SELECT status FROM call_guest WHERE id = ${joined.guestId}::uuid`)[0]
    assert.equal(guest.status, 'KICKED')
    assert.equal(await meetings.guestJoin(row.id), null)
  })

  it('rescheduling keeps the same room and moves the link window', async () => {
    const f = await setup()
    const made = await book(publicApi(), f)
    const row = await bookingOf(made.body.data.reference)
    const before = await meetingRow(row.id)
    const moved = await f.admin('POST', `/bookings/reservations/${row.id}/reschedule`, { startsAt: '2027-01-12T17:00:00Z' }, { 'Idempotency-Key': key() })
    assert.equal(moved.status, 200, JSON.stringify(moved.body))
    assert.equal(await meetings.project(row.id), 'updated')
    const after = await meetingRow(row.id)
    assert.equal(after.conversation_id, before.conversation_id)
    assert.equal(after.token, before.token, 'same guest link: emails already sent keep working')
    assert.equal(new Date(after.expires_at).toISOString(), new Date(Date.parse('2027-01-12T18:00:00Z') + MEETING_GRACE_MS).toISOString())
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS c FROM chat_conversations WHERE metadata->>'bookingId' = ${row.id}`)[0].c, 1)
  })

  it('external URL services hand out the business link only once confirmed; no room is created', async () => {
    const f = await setup({ meeting: { kind: 'external', url: 'https://meet.example/consulta' } })
    const made = await book(publicApi(), f)
    assert.deepEqual(made.body.data.meeting, { kind: 'external', url: 'https://meet.example/consulta' })
    const row = await bookingOf(made.body.data.reference)
    assert.equal(await meetings.project(row.id), 'none')
    assert.equal(await meetingRow(row.id), undefined)
  })

  it('the worker sweep prepares missed rooms and revokes them when the service stops being online; other companies get 404', async () => {
    const f = await setup()
    const cmd = commands()
    const created = await cmd.create({ companyId: f.company.id, actorId: f.user.id, spaceId: f.space.id, input: { serviceId: f.service.id, startsAt: '2027-01-13T16:00:00Z', guestName: 'Luis', guestEmail: 'luis@example.test' } })
    assert.equal(await meetingRow(created.booking.id), undefined, 'not projected yet')
    const swept = await meetings.syncDue({ limit: 1000 })
    assert.ok(swept.created >= 1, JSON.stringify(swept))
    assert.ok(await meetingRow(created.booking.id))
    await f.admin('PATCH', `/bookings/services/${f.service.id}`, { meeting: { kind: 'none' } })
    await meetings.syncDue({ limit: 1000 })
    assert.ok((await meetingRow(created.booking.id)).link_revoked_at, 'service no longer online: link revoked')

    const other = await setup()
    assert.equal((await other.admin('GET', `/bookings/reservations/${created.booking.id}`)).status, 404)
    assert.equal(await meetings.staffMeeting(other.company.id, created.booking.id, other.user.id), null)
  })

  it('confirmation emails carry the guest link; cancellation emails never do', async () => {
    const f = await setup()
    const made = await book(publicApi(), f)
    const row = await bookingOf(made.body.data.reference)
    await f.admin('POST', `/bookings/reservations/${row.id}/cancel`, {}, { 'Idempotency-Key': key() })
    const sent = []
    const notifier = createBookingsNotifier({ prisma: db, env: ENV, meetings, sendMail: async (mail) => { sent.push(mail) } })
    // Only this booking's emails: older rows of other tests stay pending for nobody.
    await db.$executeRaw`UPDATE booking_notification SET next_attempt_at = now() + interval '1 day' WHERE booking_id <> ${row.id}::uuid AND status = 'pending'`
    await notifier.processDue({ limit: 50 })
    const confirmed = sent.find((m) => /confirmada/i.test(m.subject))
    const cancelled = sent.find((m) => /cancelada/i.test(m.subject))
    assert.ok(confirmed && cancelled, sent.map((m) => m.subject).join(' | '))
    // The booking is cancelled by the time the worker sends: no live link in any email.
    assert.ok(!/\/p\/call\//.test(confirmed.text) && !/\/p\/call\//.test(cancelled.text))
    const live = await setup()
    const ok = await book(publicApi(), live)
    const liveRow = await bookingOf(ok.body.data.reference)
    await db.$executeRaw`UPDATE booking_notification SET next_attempt_at = now() + interval '1 day' WHERE booking_id <> ${liveRow.id}::uuid AND status = 'pending'`
    sent.length = 0
    await notifier.processDue({ limit: 50 })
    const mail = sent.find((m) => /confirmada/i.test(m.subject))
    assert.match(mail.text, /Unirse a la reunión: https:\/\/app\.example\.test\/p\/call\/[0-9a-f]{64}/)
    assert.match(mail.html, /Unirse a la reunión/)
  })
})
