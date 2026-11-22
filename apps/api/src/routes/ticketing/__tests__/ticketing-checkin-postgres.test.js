// runly.ticketing F6D check-in on a real disposable PostgreSQL (TICKETING_TEST_DATABASE_URL
// or BOOKINGS_TEST_DATABASE_URL, localhost only): admission once under concurrent gates,
// forged/replaced/cancelled credentials, wrong function, admission window, permissions,
// isolation, validate-vs-admit, typed codes, append-only audit, rate limits.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createBookingsCommandService } from '../../bookings/bookings-command-service.js'
import { createTicketingRouter } from '../ticketing-routes.js'
import { createTicketingCommandService } from '../ticketing-command-service.js'
import { createTicketingCheckinService } from '../ticketing-checkin-service.js'

const url = process.env.TICKETING_TEST_DATABASE_URL || process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const H = 3600000
const ALL = ['ticketing.access', 'ticketing.events.manage', 'ticketing.checkin']

describe('runly.ticketing check-in (F6D) on real PostgreSQL', { skip: !url }, () => {
  let db, engine, cmd, n = 0
  const tag = () => `tkc-${Date.now()}-${++n}`
  const key = () => `tkc-key-${crypto.randomUUID()}`
  const at = (hours) => new Date(Date.now() + hours * H).toISOString()

  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 30 }) })
    engine = createBookingsCommandService({ prisma: db })
    cmd = createTicketingCommandService({ prisma: db, engine })
  })
  after(async () => { await db?.$disconnect() })

  function api(companyId, userId, grants = ALL, extra = {}) {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('companyId', companyId); c.set('userContext', { isAdmin: false, permissionSet: new Set(grants), profile: { id: userId } }); return next() })
    const requirePermission = (k) => async (c, next) => (c.get('userContext').permissionSet.has(k) ? next() : c.json({ error: 'Sin permiso' }, 403))
    app.route('', createTicketingRouter({ prisma: db, requirePermission, engine, commands: cmd, scanLimit: [1000, 1000], ...extra }))
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
  // A function whose doors are open now (starts in 30 min, admission from 120 min before).
  async function fixture({ startsInHours = 0.5 } = {}) {
    const company = await db.company.create({ data: { name: `Foro ${tag()}`, slug: tag() } })
    const organizer = await person(company.id, 'Organizadora')
    const http = api(company.id, organizer.id)
    const event = (await http('POST', '/ticketing/events', { title: 'Festival', slug: tag(), timezone: 'America/Mexico_City', durationMinutes: 120 })).body.data
    const session = (await http('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: at(startsInHours), capacity: 50 })).body.data
    const type = (await http('POST', `/ticketing/events/${event.id}/types`, { name: 'General' })).body.data
    assert.ok(session?.id && type?.id, 'fixture')
    return { company, organizer, http, event, session, type }
  }
  async function issue(f, quantity = 1, sessionId = f.session.id) {
    const r = await cmd.reserve({ companyId: f.company.id, actorId: f.organizer.id, input: { sessionId, channel: 'box_office', items: [{ typeId: f.type.id, quantity }], buyer: { name: 'Ana Pérez' } } })
    return r.credentials
  }
  const scan = (f, body, http = f.http, sessionId = f.session.id) => http('POST', `/ticketing/checkin/sessions/${sessionId}/scan`, { deviceId: 'gate-a-0001', ...body })
  const admissions = async (ticketId) => (await db.$queryRaw`SELECT result, reason FROM ticket_admission WHERE ticket_id = ${ticketId}::uuid ORDER BY scanned_at`)

  it('a valid QR is admitted once; the second scan is "already used" with the first entry', async () => {
    const f = await fixture()
    const [c] = await issue(f)
    const first = await scan(f, { text: c.qr })
    assert.equal(first.status, 200, JSON.stringify(first.body))
    assert.deepEqual([first.body.data.result, first.body.data.reason, first.body.data.ticket.typeName, first.body.data.ticket.holderName], ['admitted', 'ok', 'General', 'Ana Pérez'])
    assert.equal(first.body.data.ticket.credentialHash, undefined)
    const again = await scan(f, { text: c.qr, deviceId: 'gate-b-0002' })
    assert.deepEqual([again.body.data.result, again.body.data.reason], ['rejected', 'already_used'])
    assert.equal(again.body.data.firstAdmission.deviceId, 'gate-a-0001')
    assert.equal(again.body.data.firstAdmission.operatorName, 'Organizadora')
    assert.equal((await db.$queryRaw`SELECT status FROM ticket WHERE id = ${c.ticketId}::uuid`)[0].status, 'USED')
    const board = (await f.http('GET', `/ticketing/checkin/sessions/${f.session.id}`)).body.data
    assert.deepEqual(board.stats, { admitted: 1, pending: 0, rejected: 1 })
    assert.deepEqual(board.recent.map((r) => r.reason), ['already_used', 'ok'])
  })

  it('two gates scanning the same QR at the same time: exactly one admission (and 20 gates too)', async () => {
    const f = await fixture()
    const [c, d] = await issue(f, 2)
    const pair = await Promise.all([scan(f, { text: c.qr, deviceId: 'gate-a-0001' }), scan(f, { text: c.qr, deviceId: 'gate-b-0002' })])
    assert.deepEqual(pair.map((r) => r.body.data.reason).sort(), ['already_used', 'ok'])
    const crowd = await Promise.all(Array.from({ length: 20 }, (_, i) => scan(f, { text: d.qr, deviceId: `gate-${String(i).padStart(6, '0')}` })))
    assert.equal(crowd.filter((r) => r.body.data.result === 'admitted').length, 1)
    assert.equal(crowd.filter((r) => r.body.data.reason === 'already_used').length, 19)
    assert.equal((await admissions(d.ticketId)).filter((a) => a.result === 'admitted').length, 1)
    // The database itself refuses a second admitted row for one ticket.
    await assert.rejects(db.$executeRaw`INSERT INTO ticket_admission (company_id, ticket_id, session_id, result, reason) VALUES (${f.company.id}::uuid, ${d.ticketId}::uuid, ${f.session.id}::uuid, 'admitted', 'ok')`)
  })

  it('forged, malformed and foreign QRs get the same "unknown" answer and reveal nothing', async () => {
    const f = await fixture(), g = await fixture()
    const [c] = await issue(f), [other] = await issue(g)
    const forged = `RT1.${c.ticketId}.${crypto.randomBytes(32).toString('base64url')}`
    for (const text of [forged, 'hola', `RT1.${crypto.randomUUID()}.${crypto.randomBytes(32).toString('base64url')}`, other.qr]) {
      const r = await scan(f, { text })
      assert.deepEqual([r.status, r.body.data.result, r.body.data.reason, r.body.data.ticket], [200, 'rejected', 'unknown', null], text.slice(0, 12))
    }
    assert.equal((await db.$queryRaw`SELECT status FROM ticket WHERE id = ${other.ticketId}::uuid`)[0].status, 'ISSUED')
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_admission WHERE company_id = ${g.company.id}::uuid`)[0].n, 0)
    assert.ok((await scan(f, { text: c.qr })).body.data.result === 'admitted', 'the genuine QR still works')
  })

  it('reissue and transfer: the earlier QR answers "replaced", the new one admits', async () => {
    const f = await fixture()
    const [c, d] = await issue(f, 2)
    const re = await f.http('POST', `/ticketing/tickets/${c.ticketId}/reissue`, {}, { 'Idempotency-Key': key() })
    assert.equal((await scan(f, { text: c.qr })).body.data.reason, 'revoked')
    const moved = await f.http('POST', `/ticketing/tickets/${d.ticketId}/transfer`, { holderName: 'Luis Gómez' }, { 'Idempotency-Key': key() })
    const old = (await scan(f, { text: d.qr })).body.data
    assert.deepEqual([old.reason, old.ticket.holderName], ['revoked', 'Luis Gómez'])
    assert.equal((await scan(f, { text: re.body.credential.qr })).body.data.result, 'admitted')
    assert.equal((await scan(f, { text: moved.body.credential.qr })).body.data.result, 'admitted')
  })

  it('a reissue racing a scan of the old QR never lets both succeed', async () => {
    const f = await fixture()
    const creds = await issue(f, 10)
    for (const c of creds) {
      const [r, s] = await Promise.all([
        cmd.reissue({ companyId: f.company.id, actorId: f.organizer.id, ticketId: c.ticketId }).then((v) => ({ ok: true, v }), (e) => ({ ok: false, code: e.code })),
        scan(f, { text: c.qr }),
      ])
      const admitted = s.body.data.result === 'admitted'
      assert.ok(admitted !== r.ok, `reissue ${r.ok ? 'ok' : r.code} and scan ${s.body.data.reason}`)
      if (!admitted) assert.equal(s.body.data.reason, 'revoked')
      else assert.equal(r.code, 'TICKET_NOT_ISSUED')
    }
  })

  it('a cancelled ticket answers "cancelled"; an unpaid one "not issued"', async () => {
    const f = await fixture()
    const [c] = await issue(f)
    const ticket = (await db.$queryRaw`SELECT order_id FROM ticket WHERE id = ${c.ticketId}::uuid`)[0]
    assert.equal((await f.http('POST', `/ticketing/orders/${ticket.order_id}/cancel`, {}, { 'Idempotency-Key': key() })).status, 200)
    const r = (await scan(f, { text: c.qr })).body.data
    assert.deepEqual([r.result, r.reason], ['rejected', 'cancelled'])
    const unpaid = (await db.$queryRaw`
      INSERT INTO ticket (company_id, order_id, session_id, type_id, status) VALUES (${f.company.id}::uuid, ${ticket.order_id}::uuid, ${f.session.id}::uuid, ${f.type.id}::uuid, 'PENDING_PAYMENT') RETURNING code`)[0]
    assert.equal((await scan(f, { code: unpaid.code })).body.data.reason, 'not_issued')
  })

  it('a ticket of another function of the event is "wrong session" and says which one', async () => {
    const f = await fixture()
    const later = (await f.http('POST', `/ticketing/events/${f.event.id}/sessions`, { startsAt: at(72), capacity: 10 })).body.data
    const [c] = await issue(f, 1, later.id)
    const r = (await scan(f, { text: c.qr })).body.data
    assert.deepEqual([r.result, r.reason], ['rejected', 'wrong_session'])
    assert.equal(new Date(r.ticketSession.startsAt).toISOString(), new Date(later.startsAt).toISOString())
    assert.equal((await db.$queryRaw`SELECT status FROM ticket WHERE id = ${c.ticketId}::uuid`)[0].status, 'ISSUED')
  })

  it('outside the admission window: not yet open, and already closed', async () => {
    const f = await fixture({ startsInHours: 48 })
    const [c] = await issue(f)
    const early = (await scan(f, { text: c.qr })).body.data
    assert.deepEqual([early.reason, Boolean(early.window?.opensAt)], ['outside_window', true])
    const late = api(f.company.id, f.organizer.id, ALL, { checkin: createTicketingCheckinService({ prisma: db, now: () => Date.now() + 50 * H }) })
    assert.equal((await scan(f, { text: c.qr }, late)).body.data.reason, 'outside_window')
    const open = api(f.company.id, f.organizer.id, ALL, { checkin: createTicketingCheckinService({ prisma: db, now: () => Date.now() + 47.5 * H }) })
    assert.equal((await scan(f, { text: c.qr }, open)).body.data.result, 'admitted')
  })

  it('permissions: ticketing.checkin and a place on the event team are both required; other companies see nothing', async () => {
    const f = await fixture(), g = await fixture()
    const [c] = await issue(f)
    const doorman = await person(f.company.id, 'Portero')
    const noGrant = api(f.company.id, doorman.id, ['ticketing.access'])
    assert.equal((await scan(f, { text: c.qr }, noGrant)).status, 403)
    const notOnTeam = api(f.company.id, doorman.id, ['ticketing.checkin'])
    assert.equal((await scan(f, { text: c.qr }, notOnTeam)).body.code, 'FORBIDDEN')
    assert.deepEqual((await notOnTeam('GET', '/ticketing/checkin/sessions')).body.data, [])
    const foreign = g.http
    assert.equal((await scan(f, { text: c.qr }, foreign)).status, 404)
    assert.equal((await foreign('GET', `/ticketing/checkin/sessions/${f.session.id}`)).status, 404)
    assert.equal((await f.http('PUT', `/ticketing/events/${f.event.id}/members/${doorman.id}`, { role: 'viewer' })).status, 200)
    assert.deepEqual((await notOnTeam('GET', '/ticketing/checkin/sessions')).body.data.map((s) => s.id), [f.session.id])
    const r = (await scan(f, { text: c.qr }, notOnTeam)).body.data
    assert.equal(r.result, 'admitted')
    assert.equal((await db.$queryRaw`SELECT operator_id FROM ticket_admission WHERE ticket_id = ${c.ticketId}::uuid`)[0].operator_id, doorman.id)
  })

  it('validate does not consume the entry; a typed code admits and is audited as such; the audit is append-only', async () => {
    const f = await fixture()
    const [c] = await issue(f)
    const check = (await scan(f, { text: c.qr, admit: false })).body.data
    assert.deepEqual([check.result, check.reason], ['valid', 'ok'])
    assert.equal((await admissions(c.ticketId)).length, 0)
    const typed = (await scan(f, { code: c.code.toLowerCase() })).body.data
    assert.equal(typed.result, 'admitted')
    const row = (await db.$queryRaw`SELECT id, method FROM ticket_admission WHERE ticket_id = ${c.ticketId}::uuid`)[0]
    assert.equal(row.method, 'code')
    await assert.rejects(db.$executeRaw`UPDATE ticket_admission SET reason = 'unknown' WHERE id = ${row.id}::uuid`, /append-only/)
    await assert.rejects(db.$executeRaw`DELETE FROM ticket_admission WHERE id = ${row.id}::uuid`, /append-only/)
    assert.equal((await scan(f, { code: 'FFFFFFFFFF' })).body.data.reason, 'unknown')
    assert.equal((await scan(f, { code: 'no-es' })).status, 400)
  })

  it('rate limit per operator and device answers 429 without touching the ticket', async () => {
    const f = await fixture()
    const [c] = await issue(f)
    const tight = api(f.company.id, f.organizer.id, ALL, { scanLimit: [3, 0.01] })
    const codes = []
    for (let i = 0; i < 4; i++) codes.push((await scan(f, { text: 'hola', deviceId: `dev-${f.company.id.slice(0, 8)}` }, tight)).status)
    assert.deepEqual(codes, [200, 200, 200, 429])
    assert.equal((await scan(f, { text: c.qr }, tight)).status, 429)
    assert.equal((await db.$queryRaw`SELECT status FROM ticket WHERE id = ${c.ticketId}::uuid`)[0].status, 'ISSUED')
  })
})
