// runly.bookings v1.2 R3: "Agregar a mi calendario", the signed .ics link and the iTIP
// email attachments against a real, disposable PostgreSQL (BOOKINGS_TEST_DATABASE_URL, localhost only).
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ical from 'node-ical'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsPortalRouter } from '../bookings-public-routes.js'
import { createBookingsCommandService } from '../bookings-command-service.js'
import { createBookingsMeetings } from '../bookings-meetings.js'
import { createBookingsNotifier } from '../bookings-notifications.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const ENV = {
  BOOKINGS_LINK_SECRET: 'calendar-files-secret', PUBLIC_APP_URL: 'https://app.example.test', RUNLY_API_URL: 'https://api.example.test', CORS_ORIGIN: 'https://app.example.test',
  LIVEKIT_MODE: 'external', LIVEKIT_URL: 'ws://127.0.0.1:9', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-test-secret-test-secret',
}
const OPEN = { reads: [10000, 100], creates: [10000, 100], pageCreates: [10000, 100], manageWrites: [10000, 100] }

describe('runly.bookings personal calendars (v1.2 R3) on real PostgreSQL', { skip: !url }, () => {
  let db, meetings, n = 0
  const tag = () => `cf-${Date.now()}-${++n}`
  const key = () => `${crypto.randomUUID()}-${++n}`
  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 20 }) })
    Object.assign(process.env, { BOOKINGS_LINK_SECRET: ENV.BOOKINGS_LINK_SECRET })
    meetings = createBookingsMeetings({ prisma: db, env: ENV, log: () => {} })
  })
  after(async () => { await db?.$disconnect() })

  const http = (app) => async (method, path, body, headers = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* calendar file */ }
    return { status: res.status, body: json, text, type: res.headers.get('content-type') }
  }
  const pub = (() => { let api; return () => (api ??= (() => { const app = new Hono(); app.route('', createBookingsPortalRouter({ prisma: db, env: ENV, limits: OPEN, meetings, getBrand: async () => null })); return http(app) })()) })()
  // The public router mounts paths absolutely; the .ics link points at the API origin.
  const fetchIcs = (link) => pub()('GET', new URL(link).pathname)

  async function setup({ policy = {}, meeting = { kind: 'none' }, timezone = 'America/Mexico_City' } = {}) {
    const company = await db.company.create({ data: { name: `Clínica, Sur; ${tag()}`, slug: tag(), contactEmail: 'hola@clinica.example' } })
    const user = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Admin', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: company.id, userId: user.id } })
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', company.id); c.set('userContext', { isAdmin: true, permissionSet: new Set(), profile: { id: user.id } }); return next() })
    app.route('', createBookingsRouter({ prisma: db, env: ENV, requirePermission: () => async (_c, next) => next(), commands: createBookingsCommandService({ prisma: db }), meetings }))
    const admin = http(app)
    const space = (await admin('POST', '/bookings/spaces', { name: 'Consultorio', slug: tag(), timezone, policy: { horizonDays: 730, ...policy } })).body.data
    const resource = (await admin('POST', '/bookings/resources', { name: 'Dra. Luna', type: 'staff', userId: user.id })).body.data
    await admin('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [resource.id] })
    const service = (await admin('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60, meeting })).body.data
    await admin('PUT', `/bookings/services/${service.id}/resources`, { resourceIds: [resource.id] })
    await admin('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '08:00', endTime: '20:00' })) })
    const slug = `c-${tag()}`.slice(0, 60)
    const page = (await admin('POST', `/bookings/spaces/${space.id}/pages`, { slug, title: 'Agenda', serviceIds: [service.id], published: true, privacyNotice: 'Solo para tu cita.', location: 'Av. Reforma 100, CDMX' })).body.data
    await admin('PATCH', `/bookings/spaces/${space.id}`, { published: true })
    const made = await pub()('POST', `/public/bookings/pages/${slug}/reservations`, { serviceId: service.id, startsAt: '2027-01-11T16:00:00Z', guestName: 'Ana Pérez', guestEmail: 'ana@example.test', acceptedPolicyVersion: page.policyVersion }, { 'Idempotency-Key': key() })
    assert.equal(made.status, 201, JSON.stringify(made.body))
    const booking = (await db.$queryRaw`SELECT * FROM booking WHERE reference = ${made.body.data.reference}`)[0]
    return { company, admin, booking, made, manageToken: made.body.manageToken }
  }
  const manage = (f) => pub()('GET', '/public/bookings/manage', null, { 'X-Booking-Token': f.manageToken })
  const eventOf = (text) => { const data = ical.sync.parseICS(text); return { method: data.vcalendar?.method, event: Object.values(data).find((v) => v.type === 'VEVENT') } }
  async function emails(bookingId) {
    const sent = []
    await db.$executeRaw`UPDATE booking_notification SET next_attempt_at = now() + interval '1 day' WHERE booking_id <> ${bookingId}::uuid AND status = 'pending'`
    await createBookingsNotifier({ prisma: db, env: ENV, meetings, sendMail: async (mail) => { sent.push(mail) } }).processDue({ limit: 50 })
    return sent
  }

  it('a confirmed booking gets Google, Outlook and a signed .ics; none carries the manage token', async () => {
    const f = await setup()
    const cal = f.made.body.data.calendar
    assert.ok(cal?.google && cal.outlook && cal.ics, JSON.stringify(cal))
    for (const link of Object.values(cal)) assert.ok(!link.includes(f.manageToken) && !link.includes(encodeURIComponent(f.manageToken)), 'manage token never in calendar links')
    assert.match(cal.ics, new RegExp(`^https://api\\.example\\.test/public/bookings/calendar/${f.booking.id}/[A-Za-z0-9_-]{43}\\.ics$`))
    const file = await fetchIcs(cal.ics)
    assert.equal(file.status, 200)
    assert.match(file.type, /^text\/calendar/)
    const { method, event } = eventOf(file.text)
    assert.equal(method, 'REQUEST')
    assert.equal(event.uid, `booking-${f.booking.id}@app.example.test`)
    assert.equal(new Date(event.start).toISOString(), '2027-01-11T16:00:00.000Z')
    assert.equal(event.location, 'Av. Reforma 100, CDMX')
    assert.ok(!/manage|gestion|X-Booking/i.test(file.text) && !file.text.includes(f.manageToken), 'no manage link inside the file')
    assert.ok(!file.text.includes('Dra. Luna') && !file.text.includes('Admin'), 'no staff data')
    assert.deepEqual((await manage(f)).body.data.booking.calendar, cal)
  })

  it('pending bookings are not offered as events; forged, rotated or expired links are refused', async () => {
    const pending = await setup({ policy: { requiresApproval: true } })
    assert.equal(pending.made.body.data.calendar, null)
    const forged = `/public/bookings/calendar/${pending.booking.id}/${'A'.repeat(43)}.ics`
    assert.equal((await pub()('GET', forged)).status, 404)
    const f = await setup()
    const link = f.made.body.data.calendar.ics
    assert.equal((await pub()('GET', `/public/bookings/calendar/not-a-uuid/${'A'.repeat(43)}.ics`)).status, 404)
    await f.admin('POST', `/bookings/reservations/${f.booking.id}/manage-link`)
    assert.equal((await fetchIcs(link)).status, 404, 'a rotated manage link kills the calendar link')
    const g = await setup()
    await db.$executeRaw`UPDATE booking SET manage_token_expires_at = now() - interval '1 minute' WHERE id = ${g.booking.id}::uuid`
    assert.equal((await fetchIcs(g.made.body.data.calendar.ics)).status, 404, 'expired')
  })

  it('reschedule keeps the UID and raises SEQUENCE; cancel serves METHOD:CANCEL', async () => {
    const f = await setup({ timezone: 'America/New_York' })
    const link = f.made.body.data.calendar.ics
    const before = eventOf((await fetchIcs(link)).text).event
    const moved = await pub()('POST', '/public/bookings/manage/reschedule', { startsAt: '2027-03-15T13:00:00Z' }, { 'X-Booking-Token': f.manageToken, 'Idempotency-Key': key() })
    assert.equal(moved.status, 200, JSON.stringify(moved.body))
    const after = eventOf((await fetchIcs(link)).text)
    assert.equal(after.event.uid, before.uid)
    assert.ok(Number(after.event.sequence) > Number(before.sequence))
    assert.equal(new Date(after.event.start).toISOString(), '2027-03-15T13:00:00.000Z', 'right instant after the DST change in New York')
    await pub()('POST', '/public/bookings/manage/cancel', {}, { 'X-Booking-Token': f.manageToken, 'Idempotency-Key': key() })
    const cancelled = eventOf((await fetchIcs(link)).text)
    assert.equal(cancelled.method, 'CANCEL')
    assert.equal(cancelled.event.status, 'CANCELLED')
    assert.equal(cancelled.event.uid, before.uid)
    assert.equal((await manage(f)).body.data.booking.calendar, null, 'no "add" button once cancelled')
  })

  it('emails: confirmation adds, reschedule updates, cancellation cancels; retries render the same event', async () => {
    const f = await setup()
    const first = await emails(f.booking.id)
    const confirmed = first.find((m) => /confirmada/i.test(m.subject))
    assert.equal(confirmed.attachments?.[0]?.contentType, 'text/calendar; charset=utf-8; method=REQUEST')
    assert.match(confirmed.html, /Agregar a mi calendario/)
    assert.ok(!confirmed.attachments[0].content.includes(f.manageToken))
    const added = eventOf(confirmed.attachments[0].content).event
    // A retry of the same notification renders the same UID and SEQUENCE (no duplicate events).
    await db.$executeRaw`UPDATE booking_notification SET status = 'pending', next_attempt_at = now() WHERE booking_id = ${f.booking.id}::uuid AND kind = 'confirmed'`
    const retry = (await emails(f.booking.id)).find((m) => /confirmada/i.test(m.subject))
    const again = eventOf(retry.attachments[0].content).event
    assert.equal(again.uid, added.uid)
    assert.equal(Number(again.sequence), Number(added.sequence))

    await pub()('POST', '/public/bookings/manage/reschedule', { startsAt: '2027-01-12T17:00:00Z' }, { 'X-Booking-Token': f.manageToken, 'Idempotency-Key': key() })
    const update = (await emails(f.booking.id)).find((m) => /reprogramada/i.test(m.subject))
    const updated = eventOf(update.attachments[0].content)
    assert.equal(updated.method, 'REQUEST')
    assert.equal(updated.event.uid, added.uid)
    assert.ok(Number(updated.event.sequence) > Number(added.sequence))

    await pub()('POST', '/public/bookings/manage/cancel', {}, { 'X-Booking-Token': f.manageToken, 'Idempotency-Key': key() })
    const cancel = (await emails(f.booking.id)).find((m) => /cancelada/i.test(m.subject))
    assert.equal(cancel.attachments?.[0]?.contentType, 'text/calendar; charset=utf-8; method=CANCEL')
    const gone = eventOf(cancel.attachments[0].content)
    assert.equal(gone.method, 'CANCEL')
    assert.equal(gone.event.uid, added.uid)
    assert.ok(Number(gone.event.sequence) > Number(updated.event.sequence))
    assert.ok(!/Agregar a mi calendario/.test(cancel.html))
  })

  it('Runly Chat appointments put only the guest lobby link in the event', async () => {
    const f = await setup({ meeting: { kind: 'runly' } })
    const text = (await fetchIcs(f.made.body.data.calendar.ics)).text
    const m = (await db.$queryRaw`SELECT m.conversation_id, l.token, l.code FROM booking_meeting m JOIN call_link l ON l.id = m.call_link_id WHERE m.booking_id = ${f.booking.id}::uuid`)[0]
    const { event } = eventOf(text)
    assert.equal(event.url, `https://app.example.test/p/call/${m.token}`)
    assert.equal(event.location, 'En línea')
    assert.ok(!text.includes(m.conversation_id) && !text.includes(m.code), 'no channel id or meeting ID')
    assert.ok(new URL(f.made.body.data.calendar.google).searchParams.get('details').includes(`/p/call/${m.token}`))
  })
})
