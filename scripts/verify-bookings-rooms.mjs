// Verification of Reservaciones v1.2 R1 (rooms and equipment reserved by employees) on a
// disposable full stack: real Supabase, every migration + seed, API and web of the working
// tree, real Chromium. Nothing touches 4010/5173.
//   node scripts/verify-bookings-rooms.mjs [--keep]
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { LINK_SECRET, bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'

const results = [], errors = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep') })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const PW = `Rm-${s.run}-Aa1!x`
const BASE = `${s.urls.web}/app/m/runly.bookings`
const key = () => `verify-rooms-${crypto.randomUUID()}`
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`) })
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[349]/.test(m.text())) errors.push(`${who} console: ${m.text().slice(0, 300)}`) })
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
function suites(label, files, env) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const tally = (k) => Number((run.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok(label, run.status === 0 && tally('fail') === 0 && tally('pass') > 0, `pass=${tally('pass')} fail=${tally('fail')}`)
  if (run.status !== 0) console.log(run.stdout.split('\n').filter((l) => /not ok|expected|actual/.test(l)).slice(0, 20).join('\n'))
}
// A Wednesday at least 2 days ahead: YYYY-MM-DD and an instant at a Mexico City hour (UTC-6).
const wed = (() => { const d = new Date(Date.now() + 2 * 86400000); while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) })()
const local = (hour, minute = 0) => new Date(`${wed}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-06:00`).toISOString()

try {
  const dir = async (d) => (await readdir(d)).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`)
  suites('PostgreSQL: Booking Engine + rooms suites (20 employees on one room, capacity, permissions, calendars)', await dir('apps/api/src/routes/bookings/__tests__'), { BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET })
  suites('PostgreSQL: Ticketing suites (regression, shares the engine)', await dir('apps/api/src/routes/ticketing/__tests__'), { TICKETING_TEST_DATABASE_URL: s.dbUrl })

  // ---- Company and people --------------------------------------------------------------------
  const A = await s.createCompany('Oficinas Norte'), B = await s.createCompany('Otra Empresa')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const calendar = ['calendar.access', 'calendar.calendars.read', 'calendar.events.read', 'calendar.events.create']
  const staffRole = await s.createRole(A, 'rm-staff', ['bookings.access', 'bookings.reserve', ...calendar])
  const plainRole = await s.createRole(A, 'rm-plain', calendar)
  const admin = await s.createUser(`rm-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Oficinas')
  const ana = await s.createUser(`rm-ana-${s.run}@example.test`, PW, A, staffRole, 'Ana Reyes')
  const luis = await s.createUser(`rm-luis-${s.run}@example.test`, PW, A, staffRole, 'Luis Mora')
  const eva = await s.createUser(`rm-eva-${s.run}@example.test`, PW, A, plainRole, 'Eva Sin Salas')
  const bRole = await s.createRole(B, 'rm-b', ['bookings.access', 'bookings.reserve', 'bookings.spaces.manage'])
  const outsider = await s.createUser(`rm-out-${s.run}@example.test`, PW, B, bRole, 'Otra Empresa')
  const api = s.client(await s.login(admin), A), anaApi = s.client(await s.login(ana), A), luisApi = s.client(await s.login(luis), A)
  const evaApi = s.client(await s.login(eva), A), otherApi = s.client(await s.login(outsider), B)

  // ---- Admin creates "Salas y recursos" from the UI (desktop light) ----------------------------
  const adminPage = watch(await s.loginPage(admin, A), 'admin')
  await adminPage.goto(`${BASE}/spaces`)
  await adminPage.getByRole('button', { name: 'Nuevo sistema' }).first().click()
  const create = adminPage.getByRole('dialog')
  await create.getByRole('radio', { name: 'Salas y recursos' }).or(create.getByRole('button', { name: 'Salas y recursos' })).first().click()
  const modalityHidden = !(await create.getByText('Modalidad').isVisible().catch(() => false))
  await create.getByRole('textbox', { name: 'Nombre' }).fill('Salas Piso 3')
  await shot(adminPage, '01-desktop-light-new-rooms-system')
  await create.getByRole('button', { name: 'Crear sistema' }).click()
  await adminPage.waitForURL(/\/spaces\/[0-9a-f-]{36}/, { timeout: 30000 })
  const spaceId = adminPage.url().split('/spaces/')[1].split(/[/?]/)[0]
  const tabs = await adminPage.getByRole('tab').allInnerTexts().catch(() => [])
  ok('UI: "Salas y recursos" system created without services, portal or modality', modalityHidden && spaceId.length === 36 && !tabs.join('|').includes('Servicios') && !tabs.join('|').includes('Reservas online'), tabs.join('|'))
  const room = (await api('POST', '/bookings/resources', { name: 'Sala de juntas', type: 'room', capacity: 8 })).body.data
  const cabin = (await api('POST', '/bookings/resources', { name: 'Cabina 1', type: 'room', capacity: 2 })).body.data
  await api('PUT', `/bookings/spaces/${spaceId}/resources`, { resourceIds: [room.id, cabin.id] })
  // Open every day around the clock so the Calendar test works at any hour of the run.
  const hours = await api('PUT', `/bookings/spaces/${spaceId}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '00:00', endTime: '12:00' }, { weekday, startTime: '12:00', endTime: '00:00' }]) })
  if (hours.status !== 200) throw new Error(`schedule refused: ${JSON.stringify(hours.body).slice(0, 200)}`)

  // ---- Engine over HTTP with real auth -------------------------------------------------------------
  const reserve = (who, body, k = key()) => who('POST', `/bookings/rooms/${spaceId}/reservations`, { resourceId: room.id, title: 'Comité', startsAt: local(9), endsAt: local(10), ...body }, { 'Idempotency-Key': k })
  const race = await Promise.all(Array.from({ length: 10 }, (_, i) => reserve(i % 2 ? anaApi : luisApi, { title: `Junta ${i}` })))
  ok('two employees, 10 simultaneous requests for one room and hour: exactly one wins (HTTP)', race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 409).length === 9, race.map((r) => r.status).join(','))
  ok('capacity: 3 people do not fit a 2-seat cabin', (await reserve(anaApi, { resourceId: cabin.id, startsAt: local(11), endsAt: local(12), headcount: 3 })).body?.code === 'NO_CAPACITY')
  ok('an employee without Reservaciones permissions cannot reserve (403)', (await reserve(evaApi, { startsAt: local(13), endsAt: local(14) })).status === 403)
  ok('another company cannot see or reserve this room (404)', (await reserve(otherApi, { startsAt: local(13), endsAt: local(14) })).status === 404 && (await otherApi('GET', `/bookings/rooms/${spaceId}/agenda?from=${local(0)}&to=${local(23)}`)).status === 404)
  const winner = race.find((r) => r.status === 201).body.data
  const loser = winner.organizerId === ana.id ? luisApi : anaApi
  ok('only the organizer (or a manager) can cancel it', (await loser('POST', `/bookings/rooms/reservations/${winner.id}/cancel`, {})).status === 404)
  ok('a normal calendar event never blocks a room: the hour stays bookable', (await anaApi('POST', '/calendar/events', { calendarId: (await anaApi('GET', '/calendar/calendars')).body?.data?.[0]?.id, title: 'Evento normal', startAt: local(15), endAt: local(16), location: 'Sala de juntas' })).status < 500
    && (await reserve(luisApi, { title: 'Después del evento', startsAt: local(15), endsAt: local(16) })).status === 201)

  // ---- Phone (dark): Ana reserves a free half hour with a participant ---------------------------------
  const phone = watch(await s.loginPage(ana, A, { phone: true, dark: true }), 'ana phone')
  await phone.goto(`${BASE}/rooms?date=${wed}`)
  ok('phone: Reservar sala shows the room and Ana\'s reservations', await visible(phone.getByRole('heading', { name: 'Reservar sala' }), 40000) && await visible(phone.getByRole('heading', { name: 'Mis reservaciones' })))
  await phone.getByRole('tab', { name: 'Sala de juntas' }).click()
  await phone.getByRole('button', { name: 'Reservar Sala de juntas a las 11:00' }).click()
  const dlg = phone.getByRole('dialog', { name: 'Reservar sala' })
  await dlg.getByRole('textbox', { name: 'Motivo' }).fill('Revisión de presupuesto')
  await dlg.getByRole('button', { name: 'Agregar' }).click()
  const search = phone.getByPlaceholder('Nombre o correo electrónico...')
  const picker = phone.getByRole('dialog').filter({ has: search })
  await search.fill('Luis')
  await picker.getByRole('option', { name: /Luis Mora/ }).click()
  await picker.getByRole('button', { name: 'Agregar' }).click()
  ok('phone dialog: motive, times from the tapped slot and a participant', await visible(dlg.getByText('Luis Mora')))
  await shot(phone, '02-phone-dark-reserve-dialog')
  await dlg.getByRole('button', { name: 'Reservar', exact: true }).click()
  ok('phone: the reservation is confirmed and shows in the day', await visible(phone.getByText('Sala reservada.')) && await dlg.waitFor({ state: 'hidden' }).then(() => true, () => false) && await visible(phone.getByText('Revisión de presupuesto')))
  await shot(phone, '03-phone-dark-reserved')
  ok('phone: no horizontal overflow', (await overflow(phone)) <= 1)
  const mineRows = (await s.q(`SELECT b.title, b.status::text, (SELECT count(*)::int FROM booking_participant p WHERE p.booking_id = b.id) AS participants FROM booking b WHERE b.space_id = $1 AND b.title = 'Revisión de presupuesto'`, [spaceId])).rows
  ok('database: one confirmed booking with its participant', mineRows.length === 1 && mineRows[0].status === 'CONFIRMED' && mineRows[0].participants === 1)

  // ---- Desktop (light): Luis tries the same slot from a stale screen -------------------------------------
  const desk = watch(await s.loginPage(luis, A), 'luis desk')
  await desk.goto(`${BASE}/rooms?date=${wed}`)
  await desk.getByRole('button', { name: 'Reservar Sala de juntas a las 12:00' }).click()
  await anaApi('POST', `/bookings/rooms/${spaceId}/reservations`, { resourceId: room.id, title: 'Llegó antes', startsAt: local(12), endsAt: local(13) }, { 'Idempotency-Key': key() })
  const ddlg = desk.getByRole('dialog', { name: 'Reservar sala' })
  await ddlg.getByRole('textbox', { name: 'Motivo' }).fill('Llamada con cliente')
  await ddlg.getByRole('button', { name: 'Reservar', exact: true }).click()
  ok('desktop: a slot taken meanwhile is refused with a clear message and the dialog stays open', await visible(ddlg.getByText('Esa sala ya está ocupada en ese horario. Elige otra hora u otra sala.')))
  await shot(desk, '04-desktop-light-conflict')
  await ddlg.getByRole('button', { name: 'Cancelar' }).click()
  ok('desktop: Luis sees the reservation he was invited to', await visible(desk.getByRole('complementary', { name: 'Mis reservaciones' }).getByText('Revisión de presupuesto')))
  await shot(desk, '05-desktop-light-rooms')

  // ---- Calendar: the invitation lands in Luis' calendar; reserve from Calendar ----------------------------
  await new Promise((r) => setTimeout(r, 2500))
  const evBody = (await luisApi('GET', `/calendar/events?start=${local(0)}&end=${local(23)}`)).body
  const evs = Array.isArray(evBody) ? evBody : evBody?.data ?? []
  ok('Calendar: the reservation appears in the participant\'s calendar (via the engine projection)', evs.some((e) => e.title === 'Revisión de presupuesto · Sala de juntas'), evs.map((e) => e.title).join(' | '))
  const cal = watch(await s.loginPage(luis, A), 'luis calendar')
  await cal.goto(`${s.urls.web}/app/m/runly.calendar/calendar`)
  await cal.getByRole('button', { name: 'Reservar sala' }).first().waitFor({ timeout: 40000 })
  await cal.getByRole('button', { name: 'Reservar sala' }).first().click()
  const cdlg = cal.getByRole('dialog', { name: 'Reservar sala' })
  await cdlg.getByRole('textbox', { name: 'Motivo' }).fill('Desde Calendario')
  await shot(cal, '06-desktop-light-calendar-reserve')
  await cdlg.getByRole('button', { name: 'Reservar', exact: true }).click()
  const fromCalendar = await visible(cal.getByText('Sala reservada.'))
  if (!fromCalendar) { await shot(cal, '99-calendar-after-submit'); console.log('calendar dialog:', (await cdlg.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)) }
  ok('Calendar: "Reservar sala" books through the engine', fromCalendar && (await s.q(`SELECT count(*)::int AS n FROM booking WHERE title = 'Desde Calendario' AND status = 'CONFIRMED'`)).rows[0].n === 1)
  const evaCal = watch(await s.loginPage(eva, A, { phone: true }), 'eva calendar')
  await evaCal.goto(`${s.urls.web}/app/m/runly.calendar/calendar`)
  await evaCal.getByRole('button', { name: 'Nuevo evento' }).first().waitFor({ timeout: 40000 })
  ok('Calendar: no "Reservar sala" for someone without the permission', !(await evaCal.getByRole('button', { name: 'Reservar sala' }).isVisible().catch(() => false)))
  ok('no page errors, console errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('verification ran to the end', false, error?.stack?.split('\n').slice(0, 4).join(' ') ?? String(error))
} finally {
  await cp(shots, resolve('.e2e/bookings-rooms-shots'), { recursive: true }).catch(() => {})
  await s.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed. Shots: .e2e/bookings-rooms-shots`)
process.exit(failed.length ? 1 : 0)
