// Verification of runly.ticketing F6B (engine and API, no screens yet) on a disposable
// stack: real Supabase, every migration + seed, the API of the working tree with real
// auth. Nothing touches 4010/5173 or the regular database.
//   node scripts/verify-ticketing-core.mjs [--keep]
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { LINK_SECRET, bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'
import { createBookingsCommandService } from '../apps/api/src/routes/bookings/bookings-command-service.js'
import { createTicketingCommandService } from '../apps/api/src/routes/ticketing/ticketing-command-service.js'
import { ticketingMap } from '../apps/api/src/manifests/official/feature-modules.js'

const results = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep'), web: false })
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: s.dbUrl, max: 10 }) })
const tickets = createTicketingCommandService({ prisma: db, engine: createBookingsCommandService({ prisma: db }) })
const PW = `Tk-${s.run}-Aa1!x`
const key = () => `verify-ticketing-${crypto.randomUUID()}`
const at = (hours) => new Date(Date.now() + hours * 3600000).toISOString()

function suites(label, files, env) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, ...env }, encoding: 'utf8' })
  const tally = (k) => Number((run.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok(label, run.status === 0 && tally('fail') === 0 && tally('pass') > 0, `pass=${tally('pass')} fail=${tally('fail')}`)
}

try {
  // ---- PostgreSQL suites on this same database ---------------------------------------
  const { readdirSync } = await import('node:fs')
  const dir = (d) => readdirSync(d).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`)
  suites('PostgreSQL suite: ticketing core (concurrency, idempotency, isolation, credentials, outbox, rollback)', dir('apps/api/src/routes/ticketing/__tests__'), { TICKETING_TEST_DATABASE_URL: s.dbUrl })
  suites('PostgreSQL suites: Booking Engine regression (engine, backoffice, portal, calendar, POS, website)', dir('apps/api/src/routes/bookings/__tests__'), { BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET })

  // ---- Module: seeded installable (not core), installed through the catalog API -------
  const seeded = (await s.q(`SELECT core, status, uninstallable FROM runly_module WHERE key = 'runly.ticketing'`)).rows[0]
  ok('seed registers runly.ticketing as an installable official module (core: false)', seeded && seeded.core === false && seeded.status === 'UNINSTALLED' && seeded.uninstallable === true, JSON.stringify(seeded))
  const A = await s.createCompany('Teatro Verificacion'), B = await s.createCompany('Otra Empresa')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const owner = await s.createUser(`tk-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Empresa')
  const install = await s.client(await s.login(owner), A)('POST', '/modules/install', { manifest: ticketingMap })
  const mod = (await s.q(`SELECT core, status, enabled FROM runly_module WHERE key = 'runly.ticketing'`)).rows[0]
  ok('admin installs Boletos from the module catalog API', install.status === 201 && mod.status === 'INSTALLED' && mod.enabled && mod.core === false, `${install.status} ${JSON.stringify(mod)} ${install.status !== 201 ? JSON.stringify(install.body).slice(0, 200) : ''}`)
  const perms = (await s.q(`SELECT key FROM permission WHERE key LIKE 'ticketing.%' AND active ORDER BY key`)).rows.map((r) => r.key)
  ok('ticketing permissions active after install', perms.join() === 'ticketing.access,ticketing.admin,ticketing.checkin,ticketing.events.manage', perms.join())
  const rls = (await s.q(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND (c.relname = 'ticket' OR c.relname LIKE 'ticket\\_%') AND c.relkind = 'r' AND NOT c.relrowsecurity`)).rows[0].n
  ok('row level security on every ticketing table (no direct Supabase client access)', rls === 0, `${rls} without RLS`)

  // ---- Real API with real auth -----------------------------------------------------------
  const organizerRole = await s.createRole(A, 'tk-organizer', ['ticketing.access', 'ticketing.events.manage'])
  const plainRole = await s.createRole(A, 'tk-plain', [])
  const bRole = await s.createRole(B, 'tk-b', ['ticketing.access', 'ticketing.events.manage'])
  const organizer = await s.createUser(`tk-org-${s.run}@example.test`, PW, A, organizerRole, 'Organizadora')
  const nobody = await s.createUser(`tk-plain-${s.run}@example.test`, PW, A, plainRole, 'Sin permiso')
  const outsider = await s.createUser(`tk-out-${s.run}@example.test`, PW, B, bRole, 'Otra empresa')
  const api = s.client(await s.login(organizer), A), plain = s.client(await s.login(nobody), A), other = s.client(await s.login(outsider), B)

  const event = (await api('POST', '/ticketing/events', { title: 'Concierto de verificación', slug: `concierto-${s.run}`, timezone: 'America/Mexico_City', durationMinutes: 150, policy: { maxPerOrder: 20 } })).body?.data
  const session = event && (await api('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: at(72), capacity: 20 })).body?.data
  const type = event && (await api('POST', `/ticketing/events/${event.id}/types`, { name: 'General', perOrderMax: 20 })).body?.data
  ok('organizer creates an event, a function on the engine and a free type', event?.id && session?.capacity === 20 && type?.priceMode === 'free')
  const space = event && (await s.q(`SELECT mode FROM booking_space WHERE id = $1`, [event.spaceId])).rows[0]
  ok('the function is a booking_session in the event\'s own booking space', space?.mode === 'internal' && (await s.q(`SELECT 1 FROM booking_session WHERE id = $1`, [session.bookingSessionId])).rowCount === 1)

  const k = key(), body = { sessionId: session.id, items: [{ typeId: type.id, quantity: 15 }], buyer: { name: 'Comprador Uno', email: 'comprador@example.test' } }
  const first = await api('POST', '/ticketing/orders', body, { 'Idempotency-Key': k })
  const again = await api('POST', '/ticketing/orders', body, { 'Idempotency-Key': k })
  const reused = await api('POST', '/ticketing/orders', { ...body, items: [{ typeId: type.id, quantity: 1 }] }, { 'Idempotency-Key': k })
  ok('free order of 15: issued with 15 credentials', first.status === 201 && first.body.data.tickets.length === 15 && first.body.credentials.length === 15, String(first.status))
  ok('idempotent retry replays the same order (200), no new tickets', again.status === 200 && again.body.data.id === first.body.data.id && again.body.replayed === true)
  ok('same key with another payload is 422', reused.status === 422 && reused.body.code === 'IDEMPOTENCY_KEY_REUSED', String(reused.status))

  const burst = await Promise.all(Array.from({ length: 50 }, () => api('POST', '/ticketing/orders', { sessionId: session.id, items: [{ typeId: type.id, quantity: 1 }] }, { 'Idempotency-Key': key() })))
  const won = burst.filter((r) => r.status === 201).length, full = burst.filter((r) => r.status === 409 && r.body?.code === 'SESSION_FULL').length
  const seats = (await s.q(`SELECT seats_taken, capacity FROM booking_session WHERE id = $1`, [session.bookingSessionId])).rows[0]
  const issuedTickets = (await s.q(`SELECT count(*)::int AS n FROM ticket WHERE session_id = $1 AND status = 'ISSUED'`, [session.id])).rows[0].n
  ok('50 simultaneous HTTP buyers for the last 5 seats: exactly 5 issued, 45 refused', won === 5 && full === 45, `201=${won} 409=${full} other=${50 - won - full}`)
  ok('no oversale: 20/20 seats and 20 valid tickets', seats.seats_taken === 20 && issuedTickets === 20, `${seats.seats_taken}/${seats.capacity}, tickets=${issuedTickets}`)

  ok('user without ticketing.access is refused (403)', (await plain('GET', '/ticketing/events')).status === 403)
  ok('another company cannot see or sell this event (404)', (await other('GET', `/ticketing/events/${event.id}`)).status === 404 && (await other('POST', '/ticketing/orders', { sessionId: session.id, items: [{ typeId: type.id, quantity: 1 }] }, { 'Idempotency-Key': key() })).status === 404)

  const ticket = first.body.data.tickets[0], oldQr = first.body.credentials.find((c) => c.ticketId === ticket.id).qr
  const reissued = await api('POST', `/ticketing/tickets/${ticket.id}/reissue`, {}, { 'Idempotency-Key': key() })
  const oldCheck = await tickets.verifyCredential({ companyId: A, text: oldQr })
  const newCheck = await tickets.verifyCredential({ companyId: A, text: reissued.body?.credential?.qr })
  ok('reissue: the replaced QR is no longer valid, the new one is', reissued.status === 200 && oldCheck.valid === false && newCheck.valid === true, `${oldCheck.reason}/${newCheck.reason}`)
  ok('other company cannot validate this company\'s QR', (await tickets.verifyCredential({ companyId: B, text: reissued.body?.credential?.qr })).valid === false)
  const stored = (await s.q(`SELECT credential_hash FROM ticket WHERE id = $1`, [ticket.id])).rows[0].credential_hash
  ok('only the SHA-256 of the secret is stored', /^[0-9a-f]{64}$/.test(stored) && !oldQr.includes(stored) && !reissued.body.credential.qr.includes(stored))

  const outbox = (await s.q(`SELECT event, payload FROM domain_event_outbox WHERE company_id = $1 AND event LIKE 'ticketing.%'`, [A])).rows
  const text = JSON.stringify(outbox.map((e) => e.payload))
  ok('outbox ticketing.* events without personal data', outbox.length >= 7 && !/Comprador|comprador@|example\.test/.test(text) && outbox.every((e) => !('contactId' in e.payload) && !('buyerName' in e.payload)), `${outbox.length} events`)
  const cancel = await api('POST', `/ticketing/orders/${first.body.data.id}/cancel`, { reason: 'verificación' }, { 'Idempotency-Key': key() })
  const freed = (await s.q(`SELECT seats_taken FROM booking_session WHERE id = $1`, [session.bookingSessionId])).rows[0].seats_taken
  ok('cancelling the order of 15 frees its seats and voids its QRs', cancel.status === 200 && freed === 5 && (await tickets.verifyCredential({ companyId: A, text: reissued.body.credential.qr })).valid === false, `seats=${freed}`)
  ok('API did not log server errors', !/\[runly\.ticketing\]/.test(s.apiLog?.join?.('') ?? ''))
} catch (error) {
  ok('verification finished without exceptions', false, error.stack?.split('\n').slice(0, 3).join(' | '))
} finally {
  await db.$disconnect().catch(() => {})
  await s.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
}
