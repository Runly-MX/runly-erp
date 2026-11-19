// runly.bookings phase 3: public portal, manage links, notifications and hold
// expiry against a real, disposable PostgreSQL (BOOKINGS_TEST_DATABASE_URL, localhost only).
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsRouter } from '../bookings-routes.js'
import { createBookingsPortalRouter } from '../bookings-public-routes.js'
import { createBookingsCommandService } from '../bookings-command-service.js'
import { createBookingsNotifier } from '../bookings-notifications.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const ENV = { BOOKINGS_LINK_SECRET: 'portal-test-secret', PUBLIC_APP_URL: 'https://app.example.test', CORS_ORIGIN: 'https://app.example.test' }
const OPEN = { reads: [10000, 100], creates: [10000, 100], pageCreates: [10000, 100], manageWrites: [10000, 100] }
const H = 3600000
const BASE = Date.parse('2027-01-01T00:00:00Z')

describe('runly.bookings public portal on real PostgreSQL', { skip: !url }, () => {
  let db, n = 0
  const clock = { now: BASE }
  const tag = () => `pt-${Date.now()}-${++n}`
  const key = () => `${crypto.randomUUID()}-${++n}`

  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 25 }) })
    Object.assign(process.env, { BOOKINGS_LINK_SECRET: ENV.BOOKINGS_LINK_SECRET })
  })
  after(async () => { await db?.$disconnect() })

  function http(app) {
    return async (method, path, body, headers = {}) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: res.status, body: await res.json().catch(() => null), headers: res.headers }
    }
  }
  const publicApi = (limits = OPEN) => {
    const app = new Hono()
    app.route('', createBookingsPortalRouter({ prisma: db, env: ENV, now: () => clock.now, limits, getBrand: async () => ({ name: 'Marca Prueba', logoUrl: null, primaryColor: '#0f766e' }) }))
    return http(app)
  }
  function adminApi(companyId, user) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', companyId); c.set('userContext', { isAdmin: true, permissionSet: new Set(), profile: { id: user.id } }); return next() })
    app.route('', createBookingsRouter({ prisma: db, env: ENV, requirePermission: () => async (_c, next) => next(), commands: createBookingsCommandService({ prisma: db, now: () => clock.now }) }))
    return http(app)
  }

  async function setup({ policy = {}, service = {}, resources = 1, page = {}, timezone = 'America/Mexico_City', rules } = {}) {
    const company = await db.company.create({ data: { name: `Empresa ${tag()}`, slug: tag() } })
    const user = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Admin', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: company.id, userId: user.id } })
    const admin = adminApi(company.id, user)
    const space = (await admin('POST', '/bookings/spaces', { name: 'Clínica', slug: tag(), timezone, policy: { horizonDays: 730, ...policy } })).body.data
    const resourceIds = []
    for (let i = 0; i < resources; i++) resourceIds.push((await admin('POST', '/bookings/resources', { name: `Dra. ${i + 1}`, type: 'staff' })).body.data.id)
    await admin('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds })
    const svc = (await admin('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60, ...service })).body.data
    await admin('PUT', `/bookings/services/${svc.id}/resources`, { resourceIds })
    await admin('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: rules ?? [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' })) })
    const slug = `p-${tag()}`.slice(0, 60)
    const created = await admin('POST', `/bookings/spaces/${space.id}/pages`, { slug, title: 'Reserva tu cita', serviceIds: [svc.id], published: true, privacyNotice: 'Usamos tus datos solo para tu cita.', cancellationPolicy: 'Cancela con 24 h.', ...page })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    await admin('PATCH', `/bookings/spaces/${space.id}`, { published: true })
    return { company, user, admin, space, service: svc, resourceIds, page: created.body.data, slug }
  }
  const book = (api, f, body = {}, headers = {}) => api('POST', `/public/bookings/pages/${f.slug}/reservations`, {
    serviceId: f.service.id, startsAt: '2027-01-11T16:00:00Z', guestName: 'Ana Pérez', guestEmail: 'ana@example.test', acceptedPolicyVersion: f.page.policyVersion, ...body,
  }, { 'Idempotency-Key': key(), ...headers })
  const notifications = (bookingRef) => db.$queryRaw`SELECT n.kind FROM booking_notification n JOIN booking b ON b.id = n.booking_id WHERE b.reference = ${bookingRef} ORDER BY n.created_at`

  it('publication gates the portal; previews are read-only; only published data leaves the server', async () => {
    const f = await setup({ page: { published: false } })
    const pub = publicApi()
    assert.equal((await pub('GET', `/public/bookings/pages/${f.slug}`)).status, 404)
    const preview = (await f.admin('POST', `/bookings/pages/${f.page.id}/preview`)).body.data.url
    const vista = new URL(preview).searchParams.get('vista')
    const shown = await pub('GET', `/public/bookings/pages/${f.slug}?vista=${encodeURIComponent(vista)}`)
    assert.equal(shown.status, 200)
    assert.equal(shown.body.data.bookable, false)
    assert.equal((await pub('GET', `/public/bookings/pages/${f.slug}?vista=1.forged`)).status, 404)
    assert.equal((await book(pub, f)).status, 404)
    await f.admin('PATCH', `/bookings/pages/${f.page.id}`, { published: true })
    await f.admin('PATCH', `/bookings/spaces/${f.space.id}`, { published: false })
    assert.equal((await pub('GET', `/public/bookings/pages/${f.slug}`)).status, 404, 'space unpublished')
    await f.admin('PATCH', `/bookings/spaces/${f.space.id}`, { published: true })
    const page = (await pub('GET', `/public/bookings/pages/${f.slug}`)).body.data
    assert.equal(page.bookable, true)
    assert.deepEqual(page.services.map((s) => s.name), ['Consulta'])
    assert.equal(page.services[0].resources, undefined, 'resource names hidden unless the page allows choosing')
    assert.equal(page.company.name, 'Marca Prueba')
    const slots = (await pub('GET', `/public/bookings/pages/${f.slug}/availability?serviceId=${f.service.id}&from=2027-01-11T06:00:00Z&to=2027-01-12T06:00:00Z`)).body.data
    assert.deepEqual(Object.keys(slots.slots[0]).sort(), ['endsAt', 'startsAt'])
    assert.equal(slots.slots.length, 9)
    // Origin guard and unknown slugs.
    assert.equal((await pub('GET', `/public/bookings/pages/${f.slug}`, null, { Origin: 'https://evil.example' })).status, 403)
    assert.equal((await pub('GET', `/public/bookings/pages/${f.slug}`, null, { Origin: 'https://app.example.test' })).status, 200)
    assert.equal((await pub('GET', '/public/bookings/pages/no-existe-xyz')).status, 404)
  })

  it('a customer books, replays safely, manages with the link, reschedules and cancels', async () => {
    const f = await setup({ policy: { cancelUntilMinutes: 1440, rescheduleUntilMinutes: 120 } })
    const pub = publicApi()
    assert.equal((await book(pub, f, { website: 'spam' })).status, 400, 'honeypot')
    assert.equal((await pub('POST', `/public/bookings/pages/${f.slug}/reservations`, { serviceId: f.service.id, startsAt: '2027-01-11T16:00:00Z', guestName: 'Ana', guestEmail: 'a@example.test', acceptedPolicyVersion: 1 })).body.code, 'IDEMPOTENCY_KEY_REQUIRED')
    assert.equal((await book(pub, f, { acceptedPolicyVersion: 99 })).body.code, 'POLICY_CHANGED')
    const k = key()
    const first = await book(pub, f, {}, { 'Idempotency-Key': k })
    assert.equal(first.status, 201, JSON.stringify(first.body))
    assert.equal(first.body.data.status, 'CONFIRMED')
    assert.match(first.body.data.reference, /^[0-9A-F]{8}$/)
    assert.equal(first.body.data.id, undefined, 'no internal id in public responses')
    const replay = await book(pub, f, {}, { 'Idempotency-Key': k })
    assert.equal(replay.status, 200)
    assert.equal(replay.body.manageToken, first.body.manageToken)
    assert.equal(replay.body.data.reference, first.body.data.reference)
    assert.equal((await db.booking.count({ where: { companyId: f.company.id } })), 1)
    assert.deepEqual((await notifications(first.body.data.reference)).map((r) => r.kind), ['confirmed'])
    const row = await db.booking.findFirst({ where: { companyId: f.company.id } })
    assert.notEqual(row.manageTokenHash, first.body.manageToken, 'only a hash is stored')
    assert.equal(row.channel, 'portal')
    assert.equal(row.policyAcceptance.version, f.page.policyVersion)

    const token = { 'X-Booking-Token': first.body.manageToken }
    assert.equal((await pub('GET', '/public/bookings/manage', null, { 'X-Booking-Token': 'x'.repeat(43) })).status, 404)
    assert.equal((await pub('GET', '/public/bookings/manage', null, { 'X-Booking-Token': 'short' })).status, 404)
    const view = (await pub('GET', '/public/bookings/manage', null, token)).body.data
    assert.deepEqual(view.actions, ['cancel', 'reschedule'])
    // Reschedule through the link, then the slot it left is free again.
    const moved = await pub('POST', '/public/bookings/manage/reschedule', { startsAt: '2027-01-11T18:00:00Z' }, { ...token, 'Idempotency-Key': key() })
    assert.equal(moved.status, 200, JSON.stringify(moved.body))
    assert.equal(new Date(moved.body.data.booking.startsAt).toISOString(), '2027-01-11T18:00:00.000Z')
    assert.equal((await book(pub, f, { guestEmail: 'otra@example.test' })).status, 201)
    // Cut-offs are enforced by the server: within 2 h no reschedule, within 24 h no cancel.
    clock.now = Date.parse('2027-01-11T17:00:00Z')
    assert.deepEqual((await pub('GET', '/public/bookings/manage', null, token)).body.data.actions, [])
    assert.equal((await pub('POST', '/public/bookings/manage/cancel', {}, { ...token, 'Idempotency-Key': key() })).body.code, 'POLICY_WINDOW_CLOSED')
    assert.equal((await pub('POST', '/public/bookings/manage/reschedule', { startsAt: '2027-01-11T20:00:00Z' }, { ...token, 'Idempotency-Key': key() })).body.code, 'RESCHEDULE_UNAVAILABLE')
    clock.now = BASE
    const cancelKey = key()
    const cancelled = await pub('POST', '/public/bookings/manage/cancel', {}, { ...token, 'Idempotency-Key': cancelKey })
    assert.equal(cancelled.body.data.booking.status, 'CANCELLED')
    assert.equal((await pub('POST', '/public/bookings/manage/cancel', {}, { ...token, 'Idempotency-Key': cancelKey })).status, 200, 'replayed')
    assert.equal(await db.bookingAllocation.count({ where: { bookingId: row.id, active: true } }), 0)
    assert.deepEqual((await notifications(first.body.data.reference)).map((r) => r.kind), ['confirmed', 'rescheduled', 'cancelled'])
    const historyKinds = await db.bookingHistory.findMany({ where: { bookingId: row.id }, orderBy: { createdAt: 'asc' }, select: { action: true, actorKind: true } })
    assert.deepEqual(historyKinds.map((h) => `${h.action}:${h.actorKind}`), ['create:portal', 'reschedule:portal', 'cancelled:portal'])
    // The admin sees the change from the backoffice.
    const fromAdmin = (await f.admin('GET', `/bookings/reservations/${row.id}`)).body.data
    assert.equal(fromAdmin.status, 'CANCELLED')
  })

  it('links can be rotated, expire, and survive unpublishing for view and cancel only', async () => {
    const f = await setup()
    const pub = publicApi()
    const created = await book(pub, f)
    const old = { 'X-Booking-Token': created.body.manageToken }
    const row = await db.booking.findFirst({ where: { companyId: f.company.id } })
    assert.equal((await f.admin('POST', `/bookings/reservations/${row.id}/manage-link`)).status, 200)
    assert.equal((await pub('GET', '/public/bookings/manage', null, old)).status, 404, 'rotated link stops working')
    const { manageToken } = await import('../bookings-links.js')
    const fresh = { 'X-Booking-Token': manageToken(row.id, 2, ENV) }
    assert.equal((await pub('GET', '/public/bookings/manage', null, fresh)).status, 200)
    assert.deepEqual((await notifications(created.body.data.reference)).map((r) => r.kind), ['confirmed', 'manage_link'])
    // Unpublished page: still visible and cancellable, no longer reschedulable.
    await f.admin('PATCH', `/bookings/pages/${f.page.id}`, { published: false })
    assert.deepEqual((await pub('GET', '/public/bookings/manage', null, fresh)).body.data.actions, ['cancel'])
    assert.equal((await book(pub, f, { startsAt: '2027-01-12T16:00:00Z' })).status, 404)
    // Expired link.
    await db.$executeRaw`UPDATE booking SET manage_token_expires_at = now() - interval '1 minute' WHERE id = ${row.id}::uuid`
    assert.equal((await pub('GET', '/public/bookings/manage', null, fresh)).status, 404)
  })

  it('races for the last slot or seats never overbook; ids from another company are refused', async () => {
    const f = await setup()
    const pub = publicApi()
    const race = await Promise.all(Array.from({ length: 12 }, (_, i) => book(pub, f, { guestEmail: `c${i}@example.test` })))
    assert.equal(race.filter((r) => r.status === 201).length, 1)
    assert.ok(race.filter((r) => r.status !== 201).every((r) => r.body.code === 'SLOT_TAKEN'))
    const s = await setup({ service: { kind: 'session', capacity: 3, maxParty: 2 } })
    const session = (await s.admin('POST', `/bookings/spaces/${s.space.id}/sessions`, { serviceId: s.service.id, startsAt: '2027-01-12T16:00:00Z' })).body.data
    const seats = await Promise.all(Array.from({ length: 8 }, (_, i) => book(pub, s, { startsAt: undefined, sessionId: session.id, guestEmail: `s${i}@example.test` })))
    assert.equal(seats.filter((r) => r.status === 201).length, 3)
    assert.equal((await db.bookingSession.findUnique({ where: { id: session.id } })).seatsTaken, 3)
    // A service or resource of another company through this page's slug.
    assert.equal((await book(pub, f, { serviceId: s.service.id })).body.code, 'SERVICE_UNAVAILABLE')
    assert.equal((await book(pub, f, { resourceId: s.resourceIds[0], startsAt: '2027-01-13T16:00:00Z' })).body.code, 'RESOURCE_UNAVAILABLE')
  })

  it('pending holds, notifications outbox and rate limits', async () => {
    const f = await setup({ policy: { requiresApproval: true, holdMinutes: 30 } })
    const pub = publicApi()
    clock.now = Date.now() - 2 * H
    const pending = await book(pub, f)
    clock.now = BASE
    assert.equal(pending.body.data.status, 'PENDING')
    assert.deepEqual((await notifications(pending.body.data.reference)).map((r) => r.kind), ['pending'])
    const commands = createBookingsCommandService({ prisma: db })
    const sweeps = await Promise.all([commands.expireAllHolds(), commands.expireAllHolds(), commands.expireAllHolds()])
    assert.ok(sweeps.reduce((t, r) => t + r.expired, 0) >= 1)
    const row = await db.booking.findFirst({ where: { companyId: f.company.id } })
    assert.equal(row.status, 'EXPIRED')
    assert.equal(await db.bookingHistory.count({ where: { bookingId: row.id, action: 'expire' } }), 1)
    assert.equal(await db.bookingAllocation.count({ where: { bookingId: row.id, active: true } }), 0)
    assert.equal((await book(pub, f, { guestEmail: 'b@example.test' })).status, 201, 'slot is free again')

    // Outbox: claimed once even by concurrent workers; failures retry; no SMTP is "skipped".
    const sent = []
    const ok = createBookingsNotifier({ prisma: db, env: ENV, sendMail: async (mail) => { sent.push(mail) } })
    await db.$executeRaw`UPDATE booking_notification SET status = 'sent' WHERE company_id <> ${f.company.id}::uuid AND status IN ('pending', 'sending')`
    const [a, b] = await Promise.all([ok.processDue({ limit: 50 }), ok.processDue({ limit: 50 })])
    assert.equal(a.sent + b.sent, sent.length)
    assert.equal(sent.length, 2)
    assert.match(sent[0].html, /gestion#[A-Za-z0-9_-]{43}/)
    assert.ok(sent.every((m) => m.to.endsWith('@example.test') && /·/.test(m.subject)))
    await f.admin('POST', `/bookings/reservations/${(await db.booking.findFirst({ where: { companyId: f.company.id, status: 'PENDING' } })).id}/confirm`, {})
    const failing = createBookingsNotifier({ prisma: db, env: ENV, sendMail: async () => { throw new Error('connection refused') } })
    assert.equal((await failing.processDue()).retrying, 1)
    const retry = await db.bookingNotification.findFirst({ where: { companyId: f.company.id, kind: 'confirmed' } })
    assert.equal(retry.status, 'pending')
    assert.ok(retry.nextAttemptAt > new Date())
    await db.$executeRaw`UPDATE booking_notification SET next_attempt_at = now() WHERE id = ${retry.id}::uuid`
    const noSmtp = createBookingsNotifier({ prisma: db, env: ENV, sendMail: async () => { throw new Error('SMTP no configurado (empresa, sitio web ni plataforma)') } })
    assert.equal((await noSmtp.processDue()).skipped, 1)

    // Real limits: the 7th booking attempt from one client on one page is refused.
    const limitedApi = publicApi({ ...OPEN, creates: [6, 1 / 120] })
    const attempts = []
    for (let i = 0; i < 7; i++) attempts.push((await book(limitedApi, f, { startsAt: `2027-01-2${i % 7}T16:00:00Z`, guestEmail: `r${i}@example.test` })).status)
    assert.equal(attempts[6], 429)
  })

  it('distribution: frame policy per URL, authorized origins, limits shared by API instances', async () => {
    const f = await setup({ page: { embedOrigins: ['https://www.clinica-socia.mx'] } })
    const pub = publicApi()
    const policy = async (uri, host = 'app.example.test') => {
      const res = await pub('GET', '/public/bookings/frame-policy', null, { host, 'x-original-uri': uri })
      return res.status === 204 ? res.headers.get('x-booking-frame-ancestors') : res.status
    }
    assert.equal(await policy(`/app/p/reservar/${f.slug}?embed=1`, 'www.sitio-cliente.mx'), 403, 'a website host never gets the SPA')
    assert.equal(await policy('/app/p/reservar/gestion'), "'none'")
    assert.equal(await policy(`/app/p/reservar/${f.slug}`), "'self'")
    assert.equal(await policy(`/app/p/reservar/${f.slug}?embed=1`), "'self' https://www.clinica-socia.mx")
    assert.equal(await policy('/app/p/reservar/no-existe-esta?embed=1'), "'self'")
    // The company's own published websites are authorized too; another company's are not.
    const other = await setup()
    const domain = async (company, hostname) => {
      const site = await db.websiteSite.create({ data: { companyId: company.id, name: 'Sitio' } })
      await db.$executeRaw`INSERT INTO website_domain (hostname, company_id, site_id, kind, state, ready) VALUES (${hostname}, ${company.id}::uuid, ${site.id}::uuid, 'custom', 'assigned', true)`
    }
    await domain(f.company, `reservas-${f.slug}.example.test`)
    await domain(other.company, `ajeno-${f.slug}.example.test`)
    const allowed = (await pub('GET', `/public/bookings/pages/${f.slug}`)).body.data.embed.allowedOrigins
    assert.deepEqual(allowed, ['https://www.clinica-socia.mx', `https://reservas-${f.slug}.example.test`])
    assert.equal(await policy(`/app/p/reservar/${f.slug}?embed=1`), `'self' ${allowed.join(' ')}`)

    // Two API processes, one limit: the 7th attempt is refused even when spread across both.
    const limits = { ...OPEN, creates: [6, 1 / 120] }
    const [a, b] = [publicApi(limits), publicApi(limits)]
    const statuses = []
    for (let i = 0; i < 7; i++) statuses.push((await book(i % 2 ? b : a, f, { startsAt: `2027-02-0${i + 1}T16:00:00Z`, guestEmail: `m${i}@example.test` })).status)
    assert.deepEqual(statuses.slice(0, 6).every((s) => s === 201), true, statuses.join(','))
    assert.equal(statuses[6], 429)
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM booking_rate_bucket WHERE key LIKE '%:%.%'`)[0].n, 0, 'no raw IPs or slugs at rest')
  })

  it('DST: a New York page lists only real hours on the spring-forward day', async () => {
    const f = await setup({ timezone: 'America/New_York', rules: [{ weekday: 0, startTime: '01:00', endTime: '04:00' }] })
    const slots = (await publicApi()('GET', `/public/bookings/pages/${f.slug}/availability?serviceId=${f.service.id}&from=2027-03-14T00:00:00Z&to=2027-03-15T00:00:00Z`)).body.data.slots
    assert.deepEqual(slots.map((s) => new Date(s.startsAt).toISOString()), ['2027-03-14T06:00:00.000Z', '2027-03-14T07:00:00.000Z'])
  })
})
