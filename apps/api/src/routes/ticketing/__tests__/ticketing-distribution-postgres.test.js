// runly.ticketing F6E distribution on a real disposable PostgreSQL (TICKETING_TEST_DATABASE_URL
// or BOOKINGS_TEST_DATABASE_URL, localhost only): public portal (publication gating, free
// tickets, limits, last seats under concurrency, idempotency, isolation), the credential vault
// (AES-256-GCM, AAD, rotation, deletion), ticket emails and resend vs reissue, admission of a
// portal ticket, Calendar projection of functions, Automations contracts and frame policy.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { automationEvents } from '../../../../../../packages/module-compiler/src/automations.js'
import { createBookingsCommandService } from '../../bookings/bookings-command-service.js'
import { createTicketingRouter } from '../ticketing-routes.js'
import { createTicketingCommandService } from '../ticketing-command-service.js'
import { createTicketingCheckinService } from '../ticketing-checkin-service.js'
import { createTicketingPublicRouter } from '../ticketing-public-routes.js'
import { createTicketingPublicService } from '../ticketing-public-service.js'
import { createTicketingNotifier } from '../ticketing-notifications.js'
import { createTicketingCalendarProjection } from '../ticketing-calendar.js'
import { createTicketingVault } from '../ticketing-vault.js'
import { hashSecret, parseCredential } from '../ticketing-core.js'

const url = process.env.TICKETING_TEST_DATABASE_URL || process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const H = 3600000
const KEY_A = crypto.randomBytes(32).toString('base64'), KEY_B = crypto.randomBytes(32).toString('base64')
const ENV = { TICKETING_LINK_SECRET: 'tk-dist-secret', PUBLIC_APP_URL: 'https://app.example.test', CORS_ORIGIN: 'https://app.example.test', TICKETING_CREDENTIAL_KEYS: `ka:${KEY_A}` }
const OPEN = { reads: [10000, 100], creates: [10000, 100], eventCreates: [10000, 100], resends: [10000, 100] }
const ALL = ['ticketing.access', 'ticketing.events.manage', 'ticketing.checkin']

describe('runly.ticketing distribution (F6E) on real PostgreSQL', { skip: !url }, () => {
  let db, engine, cmd, vault, n = 0
  const tag = () => `tkd-${Date.now()}-${++n}`
  const key = () => `tkd-key-${crypto.randomUUID()}`
  const at = (hours) => new Date(Date.now() + hours * H).toISOString()

  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 40 }) })
    engine = createBookingsCommandService({ prisma: db })
    vault = createTicketingVault({ env: ENV })
    cmd = createTicketingCommandService({ prisma: db, engine, env: ENV, vault })
  })
  after(async () => { await db?.$disconnect() })

  const http = (app) => async (method, path, body, headers = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers }
  }
  function staff(companyId, userId, grants = ALL) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', companyId); c.set('userContext', { isAdmin: false, permissionSet: new Set(grants), profile: { id: userId } }); return next() })
    const requirePermission = (k) => async (c, next) => (c.get('userContext').permissionSet.has(k) ? next() : c.json({ error: 'Sin permiso' }, 403))
    app.route('', createTicketingRouter({ prisma: db, requirePermission, engine, commands: cmd, env: ENV, scanLimit: [1000, 1000] }))
    return http(app)
  }
  let publicApi = null
  const pub = () => (publicApi ??= http(new Hono().route('', createTicketingPublicRouter({ prisma: db, env: ENV, commands: cmd, limits: OPEN, getBrand: async () => null }))))

  async function fixture({ publish = true, capacity = 50, salesOpen = true, policy = {} } = {}) {
    const company = await db.company.create({ data: { name: `Foro ${tag()}`, slug: tag() } })
    const organizer = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Organizadora', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: company.id, userId: organizer.id } })
    const api = staff(company.id, organizer.id)
    const slug = tag()
    const event = (await api('POST', '/ticketing/events', { title: 'Festival «Sol»', slug, timezone: 'America/Mexico_City', durationMinutes: 120, policy: { maxPerOrder: 6, ...policy } })).body.data
    const session = (await api('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: at(48), capacity })).body.data
    const free = (await api('POST', `/ticketing/events/${event.id}/types`, { name: 'General', perOrderMax: 4 })).body.data
    assert.ok(event?.id && session?.id && free?.id, 'fixture')
    if (publish) assert.equal((await api('PATCH', `/ticketing/events/${event.id}`, { published: true, salesOpen })).status, 200)
    return { company, organizer, api, event, session, free, slug }
  }
  const order = (f, body = {}, headers = {}) => pub()('POST', `/public/ticketing/events/${f.slug}/orders`, {
    sessionId: f.session.id, items: [{ typeId: f.free.id, quantity: 2 }], buyer: { name: 'Ana Pérez', email: 'ana@example.test' },
    holders: [{ name: 'Ana Pérez' }, { name: 'Luis Mora', email: 'luis@example.test' }], acceptedPolicyVersion: f.event.policyVersion, ...body,
  }, { 'Idempotency-Key': key(), ...headers })

  it('publication gates the portal; previews are read-only; private data never leaves', async () => {
    const f = await fixture({ publish: false })
    assert.equal((await pub()('GET', `/public/ticketing/events/${f.slug}`)).status, 404)
    const preview = new URL((await f.api('POST', `/ticketing/events/${f.event.id}/preview`)).body.data.url).searchParams.get('vista')
    const shown = await pub()('GET', `/public/ticketing/events/${f.slug}?vista=${encodeURIComponent(preview)}`)
    assert.equal(shown.status, 200)
    assert.equal(shown.body.data.preview, true)
    assert.equal((await order(f)).status, 404, 'no tickets from a preview')
    assert.equal((await pub()('GET', `/public/ticketing/events/${f.slug}?vista=9999999999.forged`)).status, 404)
    await f.api('PATCH', `/ticketing/events/${f.event.id}`, { published: true, salesOpen: true })
    const page = (await pub()('GET', `/public/ticketing/events/${f.slug}`)).body.data
    assert.equal(page.status, 'on_sale')
    assert.deepEqual(page.sessions.map((s) => s.state), ['available'])
    assert.deepEqual(Object.keys(page).sort(), ['company', 'coverUrl', 'description', 'embed', 'policies', 'preview', 'salesOpen', 'sessions', 'slug', 'status', 'timezone', 'title', 'types', 'venue'])
    assert.ok(!JSON.stringify(page).includes(f.company.id) && !JSON.stringify(page).includes(f.event.id), 'no internal ids of company or event')
    assert.equal((await pub()('GET', `/public/ticketing/events/${f.slug}`, null, { Origin: 'https://evil.example' })).status, 403)
  })

  it('a visitor gets free tickets once; limits, closed sales, paid types and policy changes are refused', async () => {
    const f = await fixture()
    const k = key()
    const first = await order(f, {}, { 'Idempotency-Key': k })
    assert.equal(first.status, 201, JSON.stringify(first.body))
    assert.equal(first.body.credentials.length, 2)
    assert.match(first.body.manageToken, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(first.body.data.tickets.length, 2)
    assert.ok(!JSON.stringify(first.body.data).includes('code') && !JSON.stringify(first.body.data).includes('credential'), 'order view without codes or hashes')
    const replay = await order(f, {}, { 'Idempotency-Key': k })
    assert.equal(replay.status, 200)
    assert.deepEqual([replay.body.replayed, replay.body.credentials.length, replay.body.data.reference], [true, 0, first.body.data.reference])
    assert.equal((await order(f, { items: [{ typeId: f.free.id, quantity: 5 }] })).body.code, 'TYPE_ORDER_LIMIT')
    assert.equal((await order(f, { acceptedPolicyVersion: 99 })).body.code, 'POLICY_CHANGED')
    assert.equal((await order(f, { website: 'bot' })).status, 400, 'honeypot')
    const product = await db.catalogProduct.create({ data: { companyId: f.company.id, name: 'VIP', slug: tag(), price: 500, currency: 'MXN' } }).catch(() => null)
    if (product) {
      const paid = (await f.api('POST', `/ticketing/events/${f.event.id}/types`, { name: 'VIP', priceMode: 'pos', catalogProductId: product.id })).body.data
      assert.equal((await order(f, { items: [{ typeId: paid.id, quantity: 1 }] })).body.code, 'PAID_AT_BOX_OFFICE')
      const page = (await pub()('GET', `/public/ticketing/events/${f.slug}`)).body.data
      assert.equal(page.types.find((t) => t.id === paid.id).free, false)
    }
    await f.api('PATCH', `/ticketing/events/${f.event.id}`, { salesOpen: false })
    assert.equal((await order(f)).body.code, 'SALES_CLOSED')
    assert.equal((await pub()('GET', `/public/ticketing/events/${f.slug}`)).body.data.status, 'closed')
  })

  it('40 visitors for the last 5 seats: exactly 5 tickets, no oversell', async () => {
    const f = await fixture({ capacity: 5 })
    const runs = await Promise.all(Array.from({ length: 40 }, (_, i) => order(f, { items: [{ typeId: f.free.id, quantity: 1 }], holders: [{ name: `P${i}` }], buyer: { name: `Persona ${i}`, email: `p${i}@example.test` } })))
    assert.equal(runs.filter((r) => r.status === 201).length, 5, runs.map((r) => r.body?.code ?? r.status).join(','))
    assert.ok(runs.filter((r) => r.status !== 201).every((r) => ['SESSION_FULL', 'SOLD_OUT', 'CONFLICT_RETRY'].includes(r.body?.code)))
    const seats = (await db.$queryRaw`SELECT b.seats_taken, b.capacity FROM booking_session b JOIN ticket_session s ON s.booking_session_id = b.id WHERE s.id = ${f.session.id}::uuid`)[0]
    assert.deepEqual([seats.seats_taken, seats.capacity], [5, 5])
    assert.equal((await pub()('GET', `/public/ticketing/events/${f.slug}`)).body.data.sessions[0].state, 'sold_out')
  })

  it('vault: sealed with AES-256-GCM bound to company, ticket and version; DB alone yields nothing; rotation keeps old rows readable', async () => {
    const f = await fixture()
    const { credentials } = (await order(f)).body
    const t = parseCredential(credentials[0].qr)
    const row = (await db.$queryRaw`SELECT * FROM ticket_credential_secret WHERE ticket_id = ${t.ticketId}::uuid`)[0]
    assert.equal(row.key_id, 'ka')
    assert.equal(row.nonce.length, 12)
    assert.ok(!Buffer.from(row.ciphertext).toString('utf8').includes(t.secret) && !Buffer.from(row.ciphertext).toString('base64url').includes(t.secret))
    assert.equal(await vault.reveal(db, { companyId: f.company.id, ticketId: t.ticketId }), t.secret)
    const other = parseCredential(credentials[1].qr)
    assert.throws(() => vault.open({ ...row, ticket_id: other.ticketId }), 'a ciphertext moved to another ticket never opens')
    assert.throws(() => vault.open({ ...row, credential_version: 2 }), 'nor for another version')
    assert.throws(() => createTicketingVault({ env: { TICKETING_CREDENTIAL_KEYS: `ka:${KEY_B}` } }).open(row), 'a wrong key never opens')
    assert.throws(() => createTicketingVault({ env: {} }).open(row), 'no key, no secret')
    // Rotation: a new first key seals, the old one still opens.
    const rotated = createTicketingVault({ env: { TICKETING_CREDENTIAL_KEYS: `kb:${KEY_B},ka:${KEY_A}` } })
    assert.equal(rotated.open(row), t.secret)
    assert.equal(rotated.currentKeyId, 'kb')
    assert.throws(() => createTicketingVault({ env: { TICKETING_CREDENTIAL_KEYS: 'bad' } }), /TICKETING_CREDENTIAL_KEYS/)
  })

  it('emails: buyer gets the order, a holder with an address gets theirs; QR inline, no secret in text; resend keeps the QR, reissue replaces it', async () => {
    const f = await fixture()
    const made = (await order(f)).body
    const queued = await db.$queryRaw`SELECT kind, recipient, cardinality(ticket_ids) AS n FROM ticket_notification n JOIN ticket_order o ON o.id = n.order_id WHERE o.reference = ${made.data.reference} ORDER BY recipient`
    assert.deepEqual(queued.map((q) => [q.kind, q.recipient, q.n]), [['issued', 'ana@example.test', 2], ['issued', 'luis@example.test', 1]])
    const sent = []
    const notifier = createTicketingNotifier({ prisma: db, env: ENV, vault, sendMail: async (mail) => { sent.push(mail) } })
    await db.$executeRaw`UPDATE ticket_notification SET next_attempt_at = now() + interval '1 day' WHERE order_id <> (SELECT id FROM ticket_order WHERE reference = ${made.data.reference}) AND status = 'pending'`
    await notifier.processDue({ limit: 50 })
    const buyerMail = sent.find((m) => m.to === 'ana@example.test')
    assert.equal(buyerMail.attachments.length, 2)
    assert.ok(buyerMail.attachments.every((a) => a.cid && a.contentType === 'image/png' && a.content.length > 200))
    for (const c of made.credentials) {
      const secret = parseCredential(c.qr).secret
      assert.ok(!buyerMail.html.includes(secret) && !buyerMail.text.includes(secret), 'the QR travels only as an image')
    }
    assert.match(buyerMail.html, /cid:ticket-qr-1@runly/)
    assert.match(buyerMail.text, /Ver mis boletos: https:\/\/app\.example\.test\/app\/p\/mis-boletos#/)

    // Resend from the buyer's link: same credential hash, a new email.
    const ticketId = parseCredential(made.credentials[0].qr).ticketId
    const before = (await db.$queryRaw`SELECT credential_hash, credential_version FROM ticket WHERE id = ${ticketId}::uuid`)[0]
    const resend = await pub()('POST', '/public/ticketing/orders/resend', { ticketIds: [ticketId] }, { 'X-Ticket-Token': made.manageToken })
    assert.equal(resend.status, 200, JSON.stringify(resend.body))
    const after = (await db.$queryRaw`SELECT credential_hash, credential_version FROM ticket WHERE id = ${ticketId}::uuid`)[0]
    assert.deepEqual(after, before, 'resend never changes the credential')
    assert.equal(after.credential_hash, hashSecret(parseCredential(made.credentials[0].qr).secret))
    sent.length = 0
    await notifier.processDue({ limit: 50 })
    assert.equal(sent.filter((m) => /reenvío/.test(m.subject)).length, 1)
    // Another order's link, or none, gets nothing.
    assert.equal((await pub()('POST', '/public/ticketing/orders/resend', {}, { 'X-Ticket-Token': 'x'.repeat(43) })).status, 404)

    // Reissue by staff: new credential, the old QR stops admitting, the sealed copy follows.
    const reissued = await f.api('POST', `/ticketing/tickets/${ticketId}/reissue`, {}, { 'Idempotency-Key': key() })
    assert.equal(reissued.status, 200)
    assert.equal((await db.$queryRaw`SELECT credential_version FROM ticket_credential_secret WHERE ticket_id = ${ticketId}::uuid`)[0].credential_version, 2)
    assert.equal(await vault.reveal(db, { companyId: f.company.id, ticketId }), parseCredential(reissued.body.credential.qr).secret)
    const old = await cmd.verifyCredential({ companyId: f.company.id, text: made.credentials[0].qr })
    assert.equal(old.valid, false)
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS c FROM ticket_notification WHERE kind = 'reissued' AND ${ticketId}::uuid = ANY(ticket_ids)`)[0].c, 1)

    // A pre-F6E ticket (no sealed copy) is not resent silently: REISSUE_REQUIRED.
    await db.$executeRaw`DELETE FROM ticket_credential_secret WHERE ticket_id = ${ticketId}::uuid`
    assert.equal((await f.api('POST', `/ticketing/orders/${made.data.id ?? (await db.$queryRaw`SELECT id FROM ticket_order WHERE reference = ${made.data.reference}`)[0].id}/resend`, { ticketIds: [ticketId] })).body.code, 'REISSUE_REQUIRED')
    // Cancelling deletes the sealed copy.
    const orderId = (await db.$queryRaw`SELECT id FROM ticket_order WHERE reference = ${made.data.reference}`)[0].id
    const second = parseCredential(made.credentials[1].qr).ticketId
    await f.api('POST', `/ticketing/orders/${orderId}/cancel`, { ticketIds: [second] }, { 'Idempotency-Key': key() })
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS c FROM ticket_credential_secret WHERE ticket_id = ${second}::uuid`)[0].c, 0)
  })

  it('the buyer link shows status without codes, expires and never crosses companies', async () => {
    const f = await fixture(), g = await fixture()
    const made = (await order(f)).body
    const view = await pub()('GET', '/public/ticketing/orders', null, { 'X-Ticket-Token': made.manageToken })
    assert.equal(view.status, 200)
    assert.deepEqual(view.body.data.tickets.map((t) => t.status), ['ISSUED', 'ISSUED'])
    assert.ok(view.body.data.tickets.every((t) => t.resendable && !('code' in t)))
    assert.equal(view.body.data.event.slug, f.slug)
    // g's link does not open f's order and vice versa (the token resolves exactly one order).
    const other = (await order(g)).body
    assert.notEqual((await pub()('GET', '/public/ticketing/orders', null, { 'X-Ticket-Token': other.manageToken })).body.data.reference, made.data.reference)
    await db.$executeRaw`UPDATE ticket_order SET manage_token_expires_at = now() - interval '1 minute' WHERE reference = ${made.data.reference} AND company_id = ${f.company.id}::uuid`
    assert.equal((await pub()('GET', '/public/ticketing/orders', null, { 'X-Ticket-Token': made.manageToken })).status, 404)
    // Another company's event is not reachable with this company's session ids.
    assert.equal((await order(f, { sessionId: g.session.id })).status, 404)
  })

  it('a portal ticket is admitted by check-in once; Automations get ids only', async () => {
    const f = await fixture()
    await f.api('POST', `/ticketing/sessions/${f.session.id}/move`, { startsAt: at(0.5) })
    const made = (await order(f, { items: [{ typeId: f.free.id, quantity: 1 }], holders: [{ name: 'Ana Pérez' }] })).body
    const gate = createTicketingCheckinService({ prisma: db })
    const first = await gate.scan({ companyId: f.company.id, operatorId: f.organizer.id, sessionId: f.session.id, text: made.credentials[0].qr })
    assert.equal(first.result, 'admitted')
    const again = await gate.scan({ companyId: f.company.id, operatorId: f.organizer.id, sessionId: f.session.id, text: made.credentials[0].qr })
    assert.equal(again.reason, 'already_used')
    const ticketId = parseCredential(made.credentials[0].qr).ticketId
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS c FROM ticket_credential_secret WHERE ticket_id = ${ticketId}::uuid`)[0].c, 0, 'used tickets keep no sealed copy')
    const events = await db.$queryRaw`SELECT event, payload FROM domain_event_outbox WHERE company_id = ${f.company.id}::uuid AND event LIKE 'ticketing.%' ORDER BY created_at`
    assert.ok(events.some((e) => e.event === 'ticketing.ticket.admitted' && e.payload.id === ticketId))
    for (const e of events) {
      const text = JSON.stringify(e.payload)
      assert.ok(!/Ana|ana@|Luis|luis@|RT1\.|holder|email|phone/i.test(text), `${e.event} carries no personal data or credentials: ${text}`)
    }
    const triggers = automationEvents().map((e) => e.key)
    for (const k of ['ticketing.order.created', 'ticketing.ticket.cancelled', 'ticketing.ticket.reissued', 'ticketing.ticket.transferred', 'ticketing.ticket.admitted']) assert.ok(triggers.includes(k), k)
    for (const e of automationEvents().filter((x) => x.key.startsWith('ticketing.'))) assert.ok(e.payload.every((p) => !/name|email|phone|contact/i.test(p)), e.key)
  })

  it('Calendar mirrors each function once, follows moves and cancellations, never attendees', async () => {
    const f = await fixture()
    const projection = createTicketingCalendarProjection({ prisma: db, log: () => {} })
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => projection.project(f.session.id)))
    assert.equal(outcomes.filter((o) => o === 'created').length, 1, outcomes.join(','))
    const events = () => db.calendarEvent.findMany({ where: { sourceModule: 'runly.ticketing', sourceEntityId: f.session.id } })
    assert.equal((await events()).length, 1)
    assert.equal(await projection.project(f.session.id), 'current')
    await order(f)
    assert.equal(await projection.project(f.session.id), 'current', 'tickets do not touch the calendar')
    const moved = await f.api('POST', `/ticketing/sessions/${f.session.id}/move`, { startsAt: at(72) })
    assert.equal(moved.status, 200, JSON.stringify(moved.body))
    assert.equal(await projection.project(f.session.id), 'updated')
    const [ev] = await events()
    assert.equal(ev.startAt.toISOString(), new Date(moved.body.data.startsAt).toISOString())
    assert.ok(!/Ana|Luis|@/.test(`${ev.title} ${ev.description}`))
    // Seats of the orders moved with the function; the QR codes did not change.
    const bookings = await db.$queryRaw`SELECT b.starts_at FROM booking b JOIN ticket_order o ON o.booking_id = b.id WHERE o.session_id = ${f.session.id}::uuid`
    assert.ok(bookings.every((b) => b.starts_at.toISOString() === ev.startAt.toISOString()))
    // A function with live tickets cannot be cancelled; an empty one can, and Calendar shows it.
    assert.equal((await f.api('POST', `/ticketing/sessions/${f.session.id}/cancel`)).body.code, 'SESSION_HAS_TICKETS')
    const empty = (await f.api('POST', `/ticketing/events/${f.event.id}/sessions`, { startsAt: at(96), capacity: 10 })).body.data
    assert.equal((await f.api('POST', `/ticketing/sessions/${empty.id}/cancel`)).status, 200)
    await projection.project(empty.id)
    const cancelled = await db.calendarEvent.findFirst({ where: { sourceModule: 'runly.ticketing', sourceEntityId: empty.id } })
    assert.match(cancelled.title, /^Cancelada · /)
    assert.ok((await projection.syncDue({ limit: 1000 })).processed >= 0)
  })

  it('frame policy: embeds only on listed sites with ?embed=1, never for unpublished events', async () => {
    const f = await fixture()
    await f.api('PATCH', `/ticketing/events/${f.event.id}`, { embedOrigins: ['https://www.cliente.example'] })
    const svc = createTicketingPublicService({ prisma: db, commands: cmd, env: ENV })
    assert.equal(await svc.frameAncestors(`/app/p/boletos/${f.slug}`), "'self'")
    assert.equal(await svc.frameAncestors(`/app/p/boletos/${f.slug}?embed=1`), "'self' https://www.cliente.example")
    await f.api('PATCH', `/ticketing/events/${f.event.id}`, { published: false })
    assert.equal(await svc.frameAncestors(`/app/p/boletos/${f.slug}?embed=1`), "'self'")
    assert.equal((await f.api('PATCH', `/ticketing/events/${f.event.id}`, { embedOrigins: ['http://inseguro.example'] })).status, 400)
  })
})
