// Verification of Reservaciones v1.2 R2 (online appointments on Runly Chat/Llamadas) on a
// disposable full stack: real Supabase, every migration + seed, API and web of the working
// tree, real Chromium. LiveKit is configured but not running: the host "starts" the call
// with a database row (media itself is out of scope), everything else is the real flow.
// Nothing touches 4010/5173.
//   node scripts/verify-bookings-meetings.mjs [--keep]
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { LINK_SECRET, bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'

const LIVEKIT = { LIVEKIT_MODE: 'external', LIVEKIT_URL: 'ws://127.0.0.1:9', LIVEKIT_API_KEY: 'verify-key', LIVEKIT_API_SECRET: 'verify-secret-verify-secret-verify-secret' }
const results = [], errors = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep'), env: LIVEKIT })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const PW = `Mt-${s.run}-Aa1!x`
const BASE = `${s.urls.web}/app/m/runly.bookings`
const key = () => `verify-meet-${crypto.randomUUID()}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`) })
// Media devices do not exist in headless Chromium: the guest page's camera/mic errors are expected noise.
const watch = (page, who, { media = false } = {}) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[0349]|status of 410/.test(m.text()) && !(media && /device|media|getUserMedia|NotFound|Permission|livekit|websocket/i.test(m.text()))) errors.push(`${who} console: ${m.text().slice(0, 300)}`) })
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
function suites(label, files, env) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const tally = (k) => Number((run.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok(label, run.status === 0 && tally('fail') === 0 && tally('pass') > 0, `pass=${tally('pass')} fail=${tally('fail')}`)
  if (run.status !== 0) console.log(run.stdout.split('\n').filter((l) => /not ok|expected|actual|Error/.test(l)).slice(0, 30).join('\n'))
}
const until = async (fn, ms = 15000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(400)) { const v = await fn(); if (v) return v } return null }
const meetingOf = async (bookingId) => (await s.q(`
  SELECT m.conversation_id, m.revoked_at, l.token, l.expires_at, l.revoked_at AS link_revoked, l.access_mode, b.ends_at,
         -- call_link.expires_at is a UTC timestamp without zone (Prisma DateTime); compare in SQL, not in local time.
         l.expires_at = (b.ends_at AT TIME ZONE 'UTC') + interval '2 hours' AS window_ok
    FROM booking_meeting m JOIN call_link l ON l.id = m.call_link_id JOIN booking b ON b.id = m.booking_id WHERE m.booking_id = $1`, [bookingId])).rows[0]

try {
  const dir = async (d) => (await readdir(d)).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`)
  suites('PostgreSQL: Booking Engine suites incl. meetings (one room under concurrency, lobby, reschedule, revoke, sweep, emails)', await dir('apps/api/src/routes/bookings/__tests__'), { BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET })
  suites('PostgreSQL: Ticketing suites (regression, shares the engine)', await dir('apps/api/src/routes/ticketing/__tests__'), { TICKETING_TEST_DATABASE_URL: s.dbUrl })
  suites('Calls: guest link service unit tests (regression)', ['apps/api/src/routes/calls/__tests__/call-links-service.test.js'], {})

  // ---- Company, people, an online service ------------------------------------------------------
  const A = await s.createCompany('Clinica Remota'), B = await s.createCompany('Otra Clinica')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const staffRole = await s.createRole(A, 'mt-staff', ['bookings.access', 'chat.access'])
  const admin = await s.createUser(`mt-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Clinica')
  const doctor = await s.createUser(`mt-doc-${s.run}@example.test`, PW, A, staffRole, 'Dra. Luna')
  const bRole = await s.createRole(B, 'mt-b', ['bookings.access', 'bookings.spaces.manage'])
  const outsider = await s.createUser(`mt-out-${s.run}@example.test`, PW, B, bRole, 'Otra Empresa')
  const api = s.client(await s.login(admin), A), docApi = s.client(await s.login(doctor), A), otherApi = s.client(await s.login(outsider), B)
  const space = (await api('POST', '/bookings/spaces', { name: 'Consultas', slug: `consultas-${s.run}`, timezone: 'America/Mexico_City', policy: { horizonDays: 60 } })).body.data
  await api('PUT', `/bookings/spaces/${space.id}/members/${doctor.id}`, { role: 'agent' })
  const resource = (await api('POST', '/bookings/resources', { name: 'Dra. Luna', type: 'staff', userId: doctor.id })).body.data
  await api('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [resource.id] })
  const service = (await api('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta en línea', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60 })).body.data
  await api('PUT', `/bookings/services/${service.id}/resources`, { resourceIds: [resource.id] })
  await api('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '00:00', endTime: '12:00' }, { weekday, startTime: '12:00', endTime: '00:00' }]) })
  const slug = `consulta-${s.run}`
  const page = await api('POST', `/bookings/spaces/${space.id}/pages`, { slug, title: 'Consulta en línea', serviceIds: [service.id], published: true, privacyNotice: 'Usamos tus datos solo para tu cita.' })
  await api('PATCH', `/bookings/spaces/${space.id}`, { published: true })
  if (page.status !== 201) throw new Error(`page refused: ${JSON.stringify(page.body).slice(0, 200)}`)

  // ---- Admin turns the service into a Runly Chat meeting from the editor (desktop light) ------------
  const adminPage = watch(await s.loginPage(admin, A), 'admin')
  await adminPage.goto(`${BASE}/spaces/${space.id}/services/${service.id}`)
  const runlyChoice = adminPage.getByRole('radio', { name: /Runly Chat/ })
  ok('editor: "Dónde se atiende" offers Runly Chat (calls configured)', await visible(runlyChoice, 40000) && await runlyChoice.isEnabled())
  await runlyChoice.click()
  await shot(adminPage, '01-desktop-light-service-runly-chat')
  await adminPage.getByRole('button', { name: 'Guardar cambios' }).click()
  ok('editor: saved as an online service', await visible(adminPage.getByText('Servicio guardado.')) && (await s.q(`SELECT meeting->>'kind' AS k FROM booking_service WHERE id = $1`, [service.id])).rows[0].k === 'runly')

  // ---- Customer books on the phone (dark), without an account ---------------------------------------
  const ctx = await s.newContext({ phone: true, dark: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark: true }, version: 0 })) } catch { /* ignore */ } })
  const c = watch(await ctx.newPage(), 'customer phone')
  await c.goto(`${s.urls.web}/app/p/reservar/${slug}`)
  await c.getByRole('button', { name: 'Semana siguiente' }).click()
  const slot = c.getByRole('radiogroup', { name: 'Horario' }).getByRole('radio').nth(10)
  await slot.waitFor({ timeout: 30000 })
  await slot.click()
  await c.getByRole('button', { name: 'Continuar' }).click()
  await c.getByLabel('Nombre').fill('Ana Pérez')
  await c.getByLabel('Correo electrónico').fill('ana@example.test')
  await c.getByLabel(/^Teléfono/).fill('5551002000')
  await c.getByRole('button', { name: 'Revisar' }).click()
  await c.getByText('Acepto las políticas').click()
  await c.getByRole('button', { name: 'Confirmar reservación' }).click()
  const join = c.getByRole('link', { name: 'Unirse a la reunión' })
  ok('portal (phone): the confirmation shows "Unirse a la reunión"', await visible(c.getByRole('heading', { name: 'Reservación confirmada' }), 30000) && await visible(join))
  const joinUrl = await join.first().getAttribute('href')
  ok('the guest link is a lobby call link of this instance, nothing internal', /^http:\/\/127\.0\.0\.1:\d+\/p\/call\/[0-9a-f]{64}$/.test(joinUrl ?? ''), joinUrl)
  await shot(c, '02-phone-dark-confirmed-join')
  ok('portal (phone): no horizontal overflow', (await overflow(c)) <= 1)
  const booking = (await s.q(`SELECT id, reference, ends_at FROM booking WHERE space_id = $1 AND guest_email = 'ana@example.test'`, [space.id])).rows[0]
  const m1 = await until(() => meetingOf(booking.id))
  const members = (await s.q(`SELECT user_id FROM chat_conversation_members WHERE conversation_id = $1 AND left_at IS NULL`, [m1?.conversation_id])).rows
  ok('database: one private room with a lobby link, hosted by the doctor', m1?.access_mode === 'LOBBY' && joinUrl.endsWith(m1.token) && members.length === 1 && members[0].user_id === doctor.id
    && (await s.q(`SELECT count(*)::int AS n FROM chat_conversations WHERE metadata->>'bookingId' = $1 AND is_public = false`, [booking.id])).rows[0].n === 1)
  ok('nothing started in advance: no call exists for the room', (await s.q(`SELECT count(*)::int AS n FROM call WHERE conversation_id = $1`, [m1.conversation_id])).rows[0].n === 0)

  await c.getByRole('link', { name: 'Ver o gestionar mi reservación' }).click()
  ok('manage page: the join button is there too', await visible(c.getByRole('heading', { name: 'Tu reservación' })) && await visible(c.getByRole('link', { name: 'Unirse a la reunión' })))
  const manageToken = decodeURIComponent(new URL(c.url()).hash.slice(1))
  await shot(c, '03-phone-dark-manage-join')

  // ---- The doctor opens the room from the booking ----------------------------------------------------
  const doc = watch(await s.loginPage(doctor, A), 'doctor')
  await doc.goto(`${BASE}/reservations?space=${space.id}`)
  await doc.getByRole('row', { name: /Ana Pérez/ }).getByRole('button', { name: 'Abrir' }).click()
  const openRoom = doc.getByRole('button', { name: 'Abrir sala' })
  ok('backoffice: the host sees "Cita en línea · Runly Chat" with "Abrir sala"', await visible(doc.getByText('Cita en línea · Runly Chat')) && await visible(openRoom))
  await shot(doc, '04-desktop-light-booking-meeting')
  await openRoom.click()
  ok('"Abrir sala" opens the booking\'s meeting channel', await doc.waitForURL(new RegExp(m1.conversation_id), { timeout: 20000 }).then(() => true, () => false))
  ok('the admin (not a host) gets no channel id from the API', (await api('GET', `/bookings/reservations/${booking.id}`)).body?.data?.meeting?.conversationId === null)

  // ---- External guest: waits, then lands in the lobby when the host starts ------------------------
  const gctx = await s.newContext({ phone: true })
  const g = watch(await gctx.newPage(), 'guest', { media: true })
  // nginx serves /p/ as the SPA in production; the Vite preview only serves /app, where the same guest route lives.
  const guestUrl = joinUrl.replace('/p/call/', '/app/p/call/')
  await g.goto(guestUrl)
  await g.getByLabel('Tu nombre').fill('Ana Pérez')
  await g.getByRole('button', { name: 'Entrar' }).click()
  ok('guest: before the host starts, "La reunión aún no ha comenzado"', await visible(g.getByText('La reunión aún no ha comenzado'), 30000))
  await shot(g, '05-phone-guest-waiting')
  await s.q(`INSERT INTO call (conversation_id, kind, status, initiated_by_user_id, livekit_room_name, started_at) VALUES ($1, 'VIDEO', 'ACTIVE', $2, $3, now())`, [m1.conversation_id, doctor.id, `verify-room-${s.run}`])
  ok('guest: once the host starts, they wait in the lobby to be admitted', await visible(g.getByText('Estás en la sala de espera'), 45000))
  await shot(g, '06-phone-guest-lobby')
  const guestRow = await until(async () => (await s.q(`SELECT status FROM call_guest WHERE link_id = (SELECT call_link_id FROM booking_meeting WHERE booking_id = $1) ORDER BY created_at DESC LIMIT 1`, [booking.id])).rows[0])
  ok('database: the guest is in LOBBY (the host admits), never admitted by the link', guestRow?.status === 'LOBBY')

  // ---- Reschedule keeps the room; another company is refused ----------------------------------------
  const avail = await s.client(null)('GET', `/public/bookings/manage/availability?from=${new Date(Date.now() + 10 * 86400000).toISOString()}&to=${new Date(Date.now() + 12 * 86400000).toISOString()}`, null, { 'X-Booking-Token': manageToken })
  const target = avail.body?.data?.slots?.[12]
  const moved = target ? await s.client(null)('POST', '/public/bookings/manage/reschedule', { startsAt: target.startsAt }, { 'X-Booking-Token': manageToken, 'Idempotency-Key': key() }) : { status: 0 }
  const m2 = await until(async () => { const r = await meetingOf(booking.id); return r && r.window_ok && new Date(r.ends_at).getTime() !== new Date(booking.ends_at).getTime() ? r : null })
  ok('reschedule (customer, manage link): same room and link, window moved', moved.status === 200 && m2?.conversation_id === m1.conversation_id && m2?.token === m1.token, `status=${moved.status}`)
  ok('another company cannot open the booking or its room (404)', (await otherApi('GET', `/bookings/reservations/${booking.id}`)).status === 404)

  // ---- Cancel revokes: guest removed, link dead, no orphan room ------------------------------------
  const cancelled = await s.client(null)('POST', '/public/bookings/manage/cancel', {}, { 'X-Booking-Token': manageToken, 'Idempotency-Key': key() })
  const m3 = await until(async () => { const r = await meetingOf(booking.id); return r?.link_revoked ? r : null })
  const kicked = (await s.q(`SELECT status FROM call_guest WHERE link_id = (SELECT call_link_id FROM booking_meeting WHERE booking_id = $1) ORDER BY created_at DESC LIMIT 1`, [booking.id])).rows[0]
  ok('cancel: the link is revoked and the waiting guest removed', cancelled.status === 200 && Boolean(m3?.revoked_at) && kicked?.status === 'KICKED', `cancel=${cancelled.status} guest=${kicked?.status}`)
  const info = await s.client(null)('GET', `/calls/guest/link-info?token=${m1.token}`)
  const g2 = watch(await gctx.newPage(), 'guest again', { media: true })
  await g2.goto(guestUrl)
  ok('cancel: the old guest link no longer opens a meeting', info.status === 410 || info.status === 404 || await visible(g2.getByText(/revocado|no válido/i), 20000), `link-info=${info.status}`)
  await shot(g2, '07-phone-guest-revoked')
  const manageAfter = await s.client(null)('GET', '/public/bookings/manage', null, { 'X-Booking-Token': manageToken })
  ok('cancel: the manage page no longer hands out a meeting link', manageAfter.body?.data?.booking?.meeting === null)
  ok('no orphan rooms: exactly one room for the booking', (await s.q(`SELECT count(*)::int AS n FROM chat_conversations WHERE metadata->>'bookingId' = $1`, [booking.id])).rows[0].n === 1)
  ok('no page errors, console errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('verification ran to the end', false, error?.stack?.split('\n').slice(0, 4).join(' ') ?? String(error))
} finally {
  await cp(shots, resolve('.e2e/bookings-meetings-shots'), { recursive: true }).catch(() => {})
  await s.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed. Shots: .e2e/bookings-meetings-shots`)
process.exit(failed.length ? 1 : 0)
