// Verification of Reservaciones v1.2 R3 (personal calendars: Google, Outlook, Apple/.ics,
// updates and cancellations) on a disposable full stack: real Supabase, every migration +
// seed, API and web of the working tree, real Chromium. Emails are rendered by the real
// notifier and turned into MIME by nodemailer (the same library the SMTP service uses).
// Nothing touches 4010/5173.
//   node scripts/verify-bookings-calendars.mjs [--keep]
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LINK_SECRET, bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'

const requireApi = createRequire(resolve('apps/api/package.json'))
const ical = requireApi('node-ical')
const nodemailer = requireApi('nodemailer')
const LIVEKIT = { LIVEKIT_MODE: 'external', LIVEKIT_URL: 'ws://127.0.0.1:9', LIVEKIT_API_KEY: 'verify-key', LIVEKIT_API_SECRET: 'verify-secret-verify-secret-verify-secret' }
const results = [], errors = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep'), env: (stack) => ({ ...LIVEKIT, RUNLY_API_URL: stack.urls.api }) })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const PW = `Cal-${s.run}-Aa1!x`
const key = () => `verify-cal-${crypto.randomUUID()}`
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[0349]/.test(m.text())) errors.push(`${who} console: ${m.text().slice(0, 300)}`) })
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
function suites(label, files, env) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const tally = (k) => Number((run.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok(label, run.status === 0 && tally('fail') === 0 && tally('pass') > 0, `pass=${tally('pass')} fail=${tally('fail')}`)
  if (run.status !== 0) console.log(run.stdout.split('\n').filter((l) => /not ok|expected|actual|Error/.test(l)).slice(0, 30).join('\n'))
}
const parse = (text) => { const data = ical.sync.parseICS(text); return { method: data.vcalendar?.method, event: Object.values(data).find((v) => v.type === 'VEVENT') } }
const get = async (link) => { const res = await fetch(link); return { status: res.status, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), text: await res.text() } }

try {
  const dir = async (d) => (await readdir(d)).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`)
  suites('14. PostgreSQL: Booking Engine suites incl. calendars and meetings (regression + R3)', await dir('apps/api/src/routes/bookings/__tests__'), { BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET })
  suites('14. PostgreSQL: Ticketing suites (regression, shares the engine)', await dir('apps/api/src/routes/ticketing/__tests__'), { TICKETING_TEST_DATABASE_URL: s.dbUrl })
  suites('14. Chat calls + Calendar ICS import unit tests (regression)', ['apps/api/src/routes/calls/__tests__/call-links-service.test.js', ...(await dir('apps/api/src/routes/calendar/__tests__')).filter((f) => /ics/i.test(f))], {})
  suites('2/6/7. iCalendar files parsed by node-ical: RFC lines, IANA zones, DST, half-hour zones, special characters', ['apps/api/src/routes/bookings/__tests__/bookings-ics.test.js'], {})

  // ---- A clinic with an in-person and a Runly Chat service ------------------------------------------
  const A = await s.createCompany('Clinica Calendario')
  await s.q(`UPDATE company SET contact_email = 'hola@clinica.example' WHERE id = $1`, [A])
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const admin = await s.createUser(`cal-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Clinica')
  const api = s.client(await s.login(admin), A)
  const space = (await api('POST', '/bookings/spaces', { name: 'Consultas', slug: `cal-${s.run}`, timezone: 'America/Mexico_City', policy: { horizonDays: 60 } })).body.data
  const resource = (await api('POST', '/bookings/resources', { name: 'Dra. Luna', type: 'staff', userId: admin.id })).body.data
  await api('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [resource.id] })
  const inPerson = (await api('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta presencial', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60 })).body.data
  const online = (await api('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta en línea', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60, meeting: { kind: 'runly' } })).body.data
  for (const svc of [inPerson, online]) await api('PUT', `/bookings/services/${svc.id}/resources`, { resourceIds: [resource.id] })
  await api('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '00:00', endTime: '12:00' }, { weekday, startTime: '12:00', endTime: '00:00' }]) })
  const slug = `cal-${s.run}`
  const page = await api('POST', `/bookings/spaces/${space.id}/pages`, { slug, title: 'Agenda tu consulta', serviceIds: [inPerson.id, online.id], published: true, location: 'Av. Reforma 100, CDMX', privacyNotice: 'Usamos tus datos solo para tu cita.' })
  await api('PATCH', `/bookings/spaces/${space.id}`, { published: true })
  if (page.status !== 201) throw new Error(`page refused: ${JSON.stringify(page.body).slice(0, 200)}`)

  // ---- 1. Phone (dark): customer books and sees "Agregar a mi calendario" -------------------------------
  const ctx = await s.newContext({ phone: true, dark: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark: true }, version: 0 })) } catch { /* ignore */ } })
  const c = watch(await ctx.newPage(), 'customer phone dark')
  await c.goto(`${s.urls.web}/app/p/reservar/${slug}`)
  await c.getByRole('button', { name: /Consulta presencial/ }).first().click()
  await c.getByRole('button', { name: 'Semana siguiente' }).click()
  const slot = c.getByRole('radiogroup', { name: 'Horario' }).getByRole('radio').nth(10)
  await slot.waitFor({ timeout: 30000 })
  await slot.click()
  await c.getByRole('button', { name: 'Continuar' }).click()
  await c.getByLabel('Nombre').fill('Ana Pérez, "Ñ"; prueba')
  await c.getByLabel('Correo electrónico').fill('ana@example.test')
  await c.getByLabel(/^Teléfono/).fill('5551002000')
  await c.getByRole('button', { name: 'Revisar' }).click()
  await c.getByText('Acepto las políticas').click()
  await c.getByRole('button', { name: 'Confirmar reservación' }).click()
  const add = (p, label) => p.getByRole('link', { name: label })
  ok('1. confirmed booking (phone, dark) offers Google Calendar, Outlook and Apple/.ics', await visible(c.getByRole('heading', { name: 'Reservación confirmada' }), 30000)
    && await visible(c.getByText('Agregar a mi calendario')) && await visible(add(c, 'Google Calendar')) && await visible(add(c, 'Outlook')) && await visible(add(c, 'Apple y otros (.ics)')))
  ok('15. phone dark: no horizontal overflow', (await overflow(c)) <= 1)
  await shot(c, '01-phone-dark-confirmed-calendar')
  const booking = (await s.q(`SELECT id, starts_at, ends_at, version FROM booking WHERE space_id = $1 AND guest_email = 'ana@example.test'`, [space.id])).rows[0]
  const googleHref = await add(c, 'Google Calendar').first().getAttribute('href')
  const outlookHref = await add(c, 'Outlook').first().getAttribute('href')
  const icsHref = await add(c, 'Apple y otros (.ics)').first().getAttribute('href')
  await c.getByRole('link', { name: 'Ver o gestionar mi reservación' }).click()
  await c.getByRole('heading', { name: 'Tu reservación' }).waitFor({ timeout: 20000 })
  const manageToken = decodeURIComponent(new URL(c.url()).hash.slice(1))

  // ---- 2-5. The links and the file ---------------------------------------------------------------------
  const utc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const g = new URL(googleHref), o = new URL(outlookHref)
  ok('3. Google Calendar template link with the right UTC times and zone', g.hostname === 'calendar.google.com' && g.searchParams.get('action') === 'TEMPLATE' && g.searchParams.get('dates') === `${utc(booking.starts_at)}/${utc(booking.ends_at)}` && g.searchParams.get('ctz') === 'America/Mexico_City', g.searchParams.get('dates'))
  ok('4. Outlook compose link with the right start and end', o.hostname === 'outlook.live.com' && o.searchParams.get('startdt') === new Date(booking.starts_at).toISOString() && o.searchParams.get('enddt') === new Date(booking.ends_at).toISOString())
  const file = await get(icsHref)
  const parsed = parse(file.text)
  ok('2. the .ics is valid iCalendar (node-ical) with UID, SEQUENCE and METHOD:REQUEST', file.status === 200 && parsed.method === 'REQUEST' && parsed.event?.uid === `booking-${booking.id}@127.0.0.1` && Number(parsed.event.sequence) === booking.version, `${file.status} ${parsed.event?.uid} seq=${parsed.event?.sequence}`)
  ok('5. Apple Calendar compatible file: text/calendar attachment, CRLF, VTIMEZONE, DTSTART;TZID', /^text\/calendar/.test(file.type) && /attachment; filename="reservacion-.+\.ics"/.test(file.disposition ?? '') && !/[^\r]\n/.test(file.text) && file.text.includes('BEGIN:VTIMEZONE\r\nTZID:America/Mexico_City') && /DTSTART;TZID=America\/Mexico_City:\d{8}T\d{6}\r\n/.test(file.text))
  ok('6. the event lands at the booked instant in its IANA zone', new Date(parsed.event.start).getTime() === new Date(booking.starts_at).getTime() && new Date(parsed.event.end).getTime() === new Date(booking.ends_at).getTime())
  const everything = [googleHref, outlookHref, icsHref, file.text].join('\n')
  ok('10. no private token: the manage token is in no link or file; the .ics token differs', !everything.includes(manageToken) && !everything.includes(encodeURIComponent(manageToken)) && !icsHref.includes(manageToken) && !/gestion|manage/i.test(file.text))

  // ---- 13. Invalid and expired links ----------------------------------------------------------------------
  const forged = icsHref.replace(/\/[A-Za-z0-9_-]{43}\.ics$/, `/${'A'.repeat(43)}.ics`)
  const bad = watch(await (await s.newContext()).newPage(), 'invalid link')
  const badRes = await bad.goto(forged)
  ok('13. a forged calendar link is refused (404, nothing leaked)', badRes.status() === 404 && !(await badRes.text()).includes('BEGIN:VCALENDAR'))
  await bad.goto(`${s.urls.web}/app/p/reservar/gestion#${'x'.repeat(43)}`)
  ok('13. a bad manage link shows the friendly error, not the booking', await visible(bad.getByText('No pudimos abrir tu reservación')))

  // ---- 15. Desktop light and dark: "Tu reservación" ----------------------------------------------------
  const light = watch(await (await s.newContext()).newPage(), 'desktop light')
  await light.goto(`${s.urls.web}/app/p/reservar/gestion#${manageToken}`)
  ok('15. desktop light: "Tu reservación" shows the calendar options', await visible(light.getByText('Agregar a mi calendario'), 30000) && await visible(add(light, 'Apple y otros (.ics)')))
  await shot(light, '02-desktop-light-manage-calendar')
  const darkCtx = await s.newContext({ dark: true })
  await darkCtx.addInitScript(() => { try { localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark: true }, version: 0 })) } catch { /* ignore */ } })
  const dark = watch(await darkCtx.newPage(), 'desktop dark')
  await dark.goto(`${s.urls.web}/app/p/reservar/gestion#${manageToken}`)
  ok('15. desktop dark: same options, no overflow', await visible(dark.getByText('Agregar a mi calendario'), 30000) && (await overflow(dark)) <= 1)
  await shot(dark, '03-desktop-dark-manage-calendar')
  const phoneLight = watch(await (await s.newContext({ phone: true })).newPage(), 'phone light')
  await phoneLight.goto(`${s.urls.web}/app/p/reservar/gestion#${manageToken}`)
  ok('15. phone light: options stacked full width, no overflow', await visible(phoneLight.getByText('Agregar a mi calendario'), 30000) && (await overflow(phoneLight)) <= 1)
  await shot(phoneLight, '04-phone-light-manage-calendar')

  // ---- 11. Emails as real MIME (nodemailer), from the real notifier -----------------------------------
  const { PrismaClient } = requireApi('@prisma/client')
  const { PrismaPg } = requireApi('@prisma/adapter-pg')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: s.dbUrl }) })
  const { createBookingsNotifier } = await import(pathToFileURL(resolve('apps/api/src/routes/bookings/bookings-notifications.js')).href)
  const { createBookingsMeetings } = await import(pathToFileURL(resolve('apps/api/src/routes/bookings/bookings-meetings.js')).href)
  const env = { ...process.env, ...s.apiEnv }
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'crlf' })
  const outbox = []
  const notifier = createBookingsNotifier({ prisma: db, env, meetings: createBookingsMeetings({ prisma: db, env, log: () => {} }), sendMail: async (mail) => { const info = await transport.sendMail({ from: 'Clinica <no-reply@example.test>', to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, attachments: mail.attachments }); outbox.push({ subject: mail.subject, raw: info.message.toString() }) } })
  const drain = async () => { outbox.length = 0; await notifier.processDue({ limit: 50 }); return outbox.filter((m) => m.raw.includes('ana@example.test')) }
  const invite = (raw) => { const m = /Content-Type: text\/calendar; charset=utf-8; method=(\w+)[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/.exec(raw); return m ? { method: m[1], text: /Content-Transfer-Encoding: base64/.test(raw.slice(raw.indexOf('text/calendar'), raw.indexOf('text/calendar') + 400)) ? Buffer.from(m[2].replace(/\s+/g, ''), 'base64').toString('utf8') : m[2] } : null }
  const firstMails = await drain()
  const confirmedMail = firstMails.find((m) => /confirmada/i.test(m.subject))
  const added = confirmedMail ? invite(confirmedMail.raw) : null
  ok('11. confirmation email: MIME text/calendar REQUEST attachment plus "Agregar a mi calendario" links', added?.method === 'REQUEST' && parse(added.text).event?.uid === parsed.event.uid && /Agregar a mi calendario/.test(confirmedMail.raw) && !added.text.includes(manageToken), confirmedMail?.subject)

  // ---- 8. Reschedule: same UID, higher SEQUENCE, update email --------------------------------------
  const anon = s.client(null)
  const avail = await anon('GET', `/public/bookings/manage/availability?from=${new Date(Date.now() + 10 * 86400000).toISOString()}&to=${new Date(Date.now() + 12 * 86400000).toISOString()}`, null, { 'X-Booking-Token': manageToken })
  const target = avail.body?.data?.slots?.[14]
  const moved = await anon('POST', '/public/bookings/manage/reschedule', { startsAt: target.startsAt }, { 'X-Booking-Token': manageToken, 'Idempotency-Key': key() })
  const afterMove = parse((await get(icsHref)).text)
  const updateMail = (await drain()).find((m) => /reprogramada/i.test(m.subject))
  const updated = updateMail ? invite(updateMail.raw) : null
  ok('8. reschedule: the same .ics link keeps the UID, raises SEQUENCE and moves the time; the email carries the update',
    moved.status === 200 && afterMove.event.uid === parsed.event.uid && Number(afterMove.event.sequence) > Number(parsed.event.sequence) && new Date(afterMove.event.start).toISOString() === new Date(target.startsAt).toISOString()
    && updated?.method === 'REQUEST' && parse(updated.text).event.uid === parsed.event.uid && Number(parse(updated.text).event.sequence) > Number(parse(added.text).event.sequence))

  // ---- 9. Cancel: METHOD:CANCEL in the file and the email; no more "add" buttons --------------------
  const cancelled = await anon('POST', '/public/bookings/manage/cancel', {}, { 'X-Booking-Token': manageToken, 'Idempotency-Key': key() })
  const afterCancel = parse((await get(icsHref)).text)
  const cancelMail = (await drain()).find((m) => /cancelada/i.test(m.subject))
  const gone = cancelMail ? invite(cancelMail.raw) : null
  ok('9. cancel: METHOD:CANCEL with STATUS:CANCELLED and the same UID, by link and by email', cancelled.status === 200 && afterCancel.method === 'CANCEL' && afterCancel.event.status === 'CANCELLED' && afterCancel.event.uid === parsed.event.uid && gone?.method === 'CANCEL' && parse(gone.text).event.status === 'CANCELLED')
  await light.reload()
  ok('9. the cancelled booking no longer offers "Agregar a mi calendario"', await visible(light.getByText('Cancelada')) && !(await light.getByText('Agregar a mi calendario').isVisible().catch(() => false)))

  // ---- 12. Runly Chat appointment: only the guest lobby link goes into the calendar --------------------
  const made = await anon('POST', `/public/bookings/pages/${slug}/reservations`, { serviceId: online.id, startsAt: target.startsAt, guestName: 'Luis', guestEmail: 'luis@example.test', acceptedPolicyVersion: page.body.data.policyVersion }, { 'Idempotency-Key': key() })
  const onlineFile = await get(made.body?.data?.calendar?.ics)
  const meetingRow = (await s.q(`SELECT m.conversation_id, l.token, l.code FROM booking_meeting m JOIN call_link l ON l.id = m.call_link_id JOIN booking b ON b.id = m.booking_id WHERE b.reference = $1`, [made.body?.data?.reference])).rows[0]
  const onlineEvent = parse(onlineFile.text).event
  ok('12. Runly Chat booking: the event carries only the guest lobby link (no channel, no meeting ID)', made.status === 201 && onlineEvent?.url?.endsWith(`/p/call/${meetingRow?.token}`) && onlineEvent.location === 'En línea' && !onlineFile.text.includes(meetingRow.conversation_id) && !onlineFile.text.includes(meetingRow.code))

  // ---- 13. Expired link ----------------------------------------------------------------------------------
  await s.q(`UPDATE booking SET manage_token_expires_at = now() - interval '1 minute' WHERE reference = $1`, [made.body.data.reference])
  ok('13. an expired calendar link is refused (404)', (await get(made.body.data.calendar.ics)).status === 404)
  await db.$disconnect()
  ok('no page errors, console errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('verification ran to the end', false, error?.stack?.split('\n').slice(0, 4).join(' ') ?? String(error))
} finally {
  await cp(shots, resolve('.e2e/bookings-calendars-shots'), { recursive: true }).catch(() => {})
  await s.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed. Shots: .e2e/bookings-calendars-shots`)
process.exit(failed.length ? 1 : 0)
