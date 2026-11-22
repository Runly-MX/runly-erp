// Verification of runly.ticketing F6E (public portal, delivery, resend, Website, Calendar,
// Automations) on a disposable full stack: real Supabase, every migration + seed, API and web
// of the working tree, real auth, real Chromium. Emails are rendered by the real notifier and
// turned into MIME by nodemailer (the SMTP service's library); the QR images of those emails
// are put in front of Chromium's fake camera and admitted by the F6D gate screen.
// Nothing touches 4010/5173.
//   node scripts/verify-ticketing-distribution.mjs [--keep]
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { createServer } from 'node:http'
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { LINK_SECRET, bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'
import { ticketingMap } from '../apps/api/src/manifests/official/feature-modules.js'

const requireApi = createRequire(resolve('apps/api/package.json'))
const nodemailer = requireApi('nodemailer')
const VAULT = `kv1:${crypto.randomBytes(32).toString('base64')}`
const results = [], errors = [], browsers = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep'), env: (stack) => ({ TICKETING_CREDENTIAL_KEYS: VAULT, RUNLY_API_URL: stack.urls.api }) })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const PW = `Tk-${s.run}-Aa1!x`
const BASE = `${s.urls.web}/app/m/runly.ticketing`
const H = 3600000
const key = () => `verify-dist-${crypto.randomUUID()}`
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
const until = async (fn, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) { const v = await fn(); if (v) return v } return null }
const pages = []
const watch = (page, who, { media = false } = {}) => {
  pages.push(page)
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[0349]|status of 429/.test(m.text()) && !(media && /device|media|getUserMedia|NotFound|Permission/i.test(m.text()))) errors.push(`${who} console: ${m.text().slice(0, 300)}`) })
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
function suites(label, files, env) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const tally = (k) => Number((run.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok(label, run.status === 0 && tally('fail') === 0 && tally('pass') > 0, `pass=${tally('pass')} fail=${tally('fail')}`)
  if (run.status !== 0) console.log(run.stdout.split('\n').filter((l) => /not ok|expected|actual|Error/.test(l)).slice(0, 30).join('\n'))
}
// A Chromium whose camera shows this PNG (the QR image exactly as the email carries it).
async function cameraBrowser(png, name) {
  const helper = await chromium.launch()
  const pg = await helper.newPage({ viewport: { width: 640, height: 480 } })
  await pg.setContent(`<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:480px"><img style="width:380px" src="data:image/png;base64,${png.toString('base64')}"></body>`)
  const jpeg = await pg.screenshot({ type: 'jpeg', quality: 95 })
  await helper.close()
  const file = join(s.stack.directory, `${name}.mjpeg`)
  await writeFile(file, Buffer.concat(Array.from({ length: 10 }, () => jpeg)))
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${file}`] })
  browsers.push(browser)
  return browser
}
async function loginIn(browser, who, companyId, { phone = false, dark = false } = {}) {
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 950 }, locale: 'es-MX', timezoneId: 'America/Mexico_City', colorScheme: dark ? 'dark' : 'light', permissions: ['camera'], ...(phone ? { isMobile: true, hasTouch: true } : {}) })
  await context.addInitScript(([id, isDark]) => { try { localStorage.setItem('runly-active-company', id); localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark }, version: 0 })) } catch { /* ignore */ } }, [companyId, dark])
  const page = watch(await context.newPage(), who.name, { media: true })
  await page.goto(`${s.urls.web}/app/login`)
  await page.locator('#identifier').fill(who.email); await page.locator('#password').fill(who.password)
  await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  return page
}
async function visitor({ phone = false, dark = false } = {}) {
  const context = await s.newContext({ phone, dark })
  await context.addInitScript((isDark) => { try { localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark }, version: 0 })) } catch { /* ignore */ } }, dark)
  return watch(await context.newPage(), `visitor${phone ? '-phone' : ''}${dark ? '-dark' : ''}`)
}

let other = null
try {
  const dir = async (d) => (await readdir(d)).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`)
  suites('Regression: Ticketing F6B/F6C/F6D + F6E suites (portal, vault, emails, Calendar, Website publication, frame policy)', await dir('apps/api/src/routes/ticketing/__tests__'), { TICKETING_TEST_DATABASE_URL: s.dbUrl })
  suites('Regression: Booking Engine and Reservaciones suites (rooms, meetings, calendars, POS on the engine)', await dir('apps/api/src/routes/bookings/__tests__'), { BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET })
  suites('Regression: Automations (system automations incl. ticketing trigger, compiler catalog) and Website catalog/release unit suites', [
    'apps/api/src/services/__tests__/system-automations-service.test.js', ...(await dir('packages/module-compiler/src/__tests__')),
    ...(await readdir('apps/api/src/services/__tests__')).filter((f) => /^website-.*\.test\.js$/.test(f)).map((f) => `apps/api/src/services/__tests__/${f}`),
  ], {})
  suites('Regression: Calendar unit suites', await dir('apps/api/src/routes/calendar/__tests__'), {})

  // ---- Company, people, event ---------------------------------------------------------------------
  const A = await s.createCompany('Foro Publico'), B = await s.createCompany('Otra Empresa')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const admin = await s.createUser(`tk-d-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Foro')
  const doorRole = await s.createRole(A, 'tk-d-door', ['ticketing.access', 'ticketing.checkin'])
  const door = await s.createUser(`tk-d-door-${s.run}@example.test`, PW, A, doorRole, 'Portero Uno')
  const bRole = await s.createRole(B, 'tk-d-b', ['ticketing.access', 'ticketing.events.manage'])
  const outsider = await s.createUser(`tk-d-out-${s.run}@example.test`, PW, B, bRole, 'Otra Empresa')
  const api = s.client(await s.login(admin), A), otherApi = s.client(await s.login(outsider), B), anon = s.client(null)
  await api('POST', '/modules/install', { manifest: ticketingMap })
  const slug = `festival-${s.run}`
  const event = (await api('POST', '/ticketing/events', { title: 'Festival de Primavera', slug, timezone: 'America/Mexico_City', durationMinutes: 150, venue: 'Foro Norte, Av. Reforma 100', description: 'Una noche de música en vivo con artistas invitados.\nTrae tu QR en el teléfono.', policy: { maxPerOrder: 6, transferAllowed: true } })).body.data
  const now = (await api('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: new Date(Date.now() + 0.5 * H).toISOString(), capacity: 80, admitBeforeMinutes: 90 })).body.data
  const later = (await api('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: new Date(Date.now() + 96 * H).toISOString(), capacity: 3 })).body.data
  const general = (await api('POST', `/ticketing/events/${event.id}/types`, { name: 'General', description: 'Acceso a la pista', perOrderMax: 4 })).body.data
  await api('PUT', `/ticketing/events/${event.id}/members/${door.id}`, { role: 'viewer' })
  ok('1. event with functions and a free type created', Boolean(event?.id && now?.id && later?.id && general?.id))

  // ---- 1. Publication from the backoffice (desktop dark) ----------------------------------------------
  const plain = await chromium.launch(); browsers.push(plain)
  const desk = await loginIn(plain, admin, A, { dark: true })
  await desk.goto(`${BASE}/events/${event.id}?tab=publication`)
  ok('1. Publicación tab shows status, address and embed code', await visible(desk.getByRole('heading', { name: 'Página pública' }), 40000) && await visible(desk.getByText('Código de inserción')))
  const helperPage = await (await plain.newContext()).newPage()
  await helperPage.setContent('<body style="margin:0"><div style="width:1280px;height:720px;background:linear-gradient(135deg,#7c3aed,#db2777 60%,#f59e0b)"></div></body>')
  const cover = await helperPage.screenshot({ type: 'png' })
  await desk.locator('input[type=file]').first().setInputFiles({ name: 'portada.png', mimeType: 'image/png', buffer: cover })
  const coverSet = await until(async () => (await s.q('SELECT image_file_id FROM ticket_event WHERE id = $1', [event.id])).rows[0].image_file_id)
  await desk.getByRole('switch', { name: 'Publicar el evento' }).click()
  await until(async () => (await s.q('SELECT published FROM ticket_event WHERE id = $1', [event.id])).rows[0].published)
  await desk.getByRole('switch', { name: 'Entregar boletos gratuitos en línea' }).click()
  const live = await until(async () => { const r = (await s.q('SELECT published, sales_open FROM ticket_event WHERE id = $1', [event.id])).rows[0]; return r.published && r.sales_open })
  ok('1. published with sales open and a cover, from the UI', Boolean(coverSet && live))
  await shot(desk, '01-desktop-dark-publication')
  ok('15. backoffice (desktop dark) without horizontal overflow', (await overflow(desk)) <= 1)
  await api('PATCH', `/ticketing/events/${event.id}`, { embedOrigins: ['https://www.cliente.example'] })

  // ---- 2-4. Visitor without an account, phone dark ----------------------------------------------------
  const phone = await visitor({ phone: true, dark: true })
  await phone.goto(`${s.urls.web}/app/p/boletos/${slug}`)
  ok('2. visitor opens the event without a Runly account', await visible(phone.getByRole('heading', { name: 'Festival de Primavera' }), 40000) && !phone.url().includes('/login'))
  await phone.getByRole('radio').first().click()
  await phone.getByRole('button', { name: 'Agregar un boleto General' }).click()
  await phone.getByRole('button', { name: 'Agregar un boleto General' }).click()
  await shot(phone, '02-phone-dark-event')
  ok('15. event page (phone dark) without horizontal overflow', (await overflow(phone)) <= 1)
  await phone.getByRole('button', { name: /Continuar con 2 boletos/ }).click()
  await phone.getByLabel('Nombre completo').fill('Ana Pérez')
  await phone.getByLabel('Correo electrónico').fill('ana@example.test')
  await phone.getByLabel('Asistente 1').fill('Ana Pérez')
  await phone.getByLabel('Asistente 2').fill('Luis Mora')
  await phone.getByText('Acepto las condiciones del evento').click()
  await phone.getByRole('button', { name: 'Confirmar y obtener boletos' }).click()
  ok('3-4. free tickets obtained: confirmation with two QR codes', await visible(phone.getByText('¡Listo, tus boletos están emitidos!'), 30000) && (await phone.getByRole('img', { name: /Código QR del boleto/ }).count()) === 2)
  await shot(phone, '03-phone-dark-confirmation')
  const order = (await s.q(`SELECT id, reference, channel FROM ticket_order WHERE event_id = $1 AND buyer_email = 'ana@example.test'`, [event.id])).rows[0]
  ok('4. order issued through the portal channel', order?.channel === 'portal')
  await phone.getByRole('link', { name: 'Ver mis boletos' }).click()
  await phone.getByRole('heading', { name: 'Mis boletos' }).waitFor({ timeout: 20000 })
  const manageToken = decodeURIComponent(new URL(phone.url()).hash.slice(1))

  // ---- 5-10. Limits, capacity, concurrency, idempotency, publication, isolation (HTTP) ------------------
  const pubOrder = (body, k = key()) => anon('POST', `/public/ticketing/events/${slug}/orders`, { sessionId: now.id, items: [{ typeId: general.id, quantity: 1 }], buyer: { name: 'Visitante', email: 'v@example.test' }, acceptedPolicyVersion: event.policyVersion, ...body }, { 'Idempotency-Key': k })
  ok('5. per-order limit enforced (5 General > 4)', (await pubOrder({ items: [{ typeId: general.id, quantity: 5 }] })).body?.code === 'TYPE_ORDER_LIMIT')
  ok('6. more than the free seats is refused (4 of 3 left)', (await pubOrder({ sessionId: later.id, items: [{ typeId: general.id, quantity: 4 }] })).body?.code === 'SESSION_FULL')
  // Its own event: the per-address limit (6 orders per event) must not mask the capacity race.
  const cupo = (await api('POST', '/ticketing/events', { title: 'Cupo limitado', slug: `cupo-${s.run}`, timezone: 'America/Mexico_City' })).body.data
  const cupoSession = (await api('POST', `/ticketing/events/${cupo.id}/sessions`, { startsAt: new Date(Date.now() + 48 * H).toISOString(), capacity: 3 })).body.data
  const cupoType = (await api('POST', `/ticketing/events/${cupo.id}/types`, { name: 'General' })).body.data
  await api('PATCH', `/ticketing/events/${cupo.id}`, { published: true, salesOpen: true })
  const race = await Promise.all(Array.from({ length: 5 }, (_, i) => anon('POST', `/public/ticketing/events/${cupo.slug}/orders`, { sessionId: cupoSession.id, items: [{ typeId: cupoType.id, quantity: 1 }], buyer: { name: `Persona ${i}`, email: `p${i}@example.test` }, acceptedPolicyVersion: cupo.policyVersion }, { 'Idempotency-Key': key() })))
  ok('7. five visitors at once for the last 3 seats: exactly 3 tickets', race.filter((r) => r.status === 201).length === 3 && race.filter((r) => r.body?.code === 'SESSION_FULL').length === 2, race.map((r) => r.status).join(','))
  const k = key()
  const once = await pubOrder({ buyer: { name: 'Repetido', email: 'rep@example.test' } }, k)
  const twice = await pubOrder({ buyer: { name: 'Repetido', email: 'rep@example.test' } }, k)
  ok('8. a retried request returns the same order (idempotent), without new QR codes', once.status === 201 && twice.status === 200 && twice.body.replayed && twice.body.data.reference === once.body.data.reference && twice.body.credentials.length === 0)
  const hidden = (await api('POST', '/ticketing/events', { title: 'Evento privado', slug: `privado-${s.run}`, timezone: 'America/Mexico_City' })).body.data
  const hiddenPage = await visitor()
  await hiddenPage.goto(`${s.urls.web}/app/p/boletos/${hidden.slug}`)
  ok('9. an unpublished event is not reachable (404 and "no disponible")', (await anon('GET', `/public/ticketing/events/${hidden.slug}`)).status === 404 && await visible(hiddenPage.getByText('Evento no disponible')))
  other = (await otherApi('POST', '/ticketing/events', { title: 'Otro', slug: `otro-${s.run}`, timezone: 'America/Mexico_City' })).body.data
  const otherSession = (await otherApi('POST', `/ticketing/events/${other.id}/sessions`, { startsAt: new Date(Date.now() + 48 * H).toISOString(), capacity: 5 })).body.data
  ok('10. company isolation: another company\'s function via this event, or this order from that company, is 404', (await pubOrder({ sessionId: otherSession.id })).status === 404 && (await otherApi('GET', `/ticketing/orders/${order.id}`)).status === 404)
  // Last on this event: it uses up this address's order allowance.
  let limited = null
  for (let i = 0; i < 4 && limited?.status !== 429; i++) limited = await pubOrder({ buyer: { name: `Insistente ${i}`, email: `i${i}@example.test` } })
  ok('anti-abuse: one address ordering again and again for one event is rate limited (429)', limited?.status === 429, `status=${limited?.status}`)

  // ---- 11-12. Email as real MIME, QR delivered as images ---------------------------------------------
  const { PrismaClient } = requireApi('@prisma/client')
  const { PrismaPg } = requireApi('@prisma/adapter-pg')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: s.dbUrl }) })
  const { createTicketingNotifier } = await import(pathToFileURL(resolve('apps/api/src/routes/ticketing/ticketing-notifications.js')).href)
  const env = { ...process.env, ...s.apiEnv }
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'crlf' })
  const outbox = []
  const notifier = createTicketingNotifier({ prisma: db, env, sendMail: async (mail) => { const info = await transport.sendMail({ from: 'Foro <no-reply@example.test>', to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, attachments: mail.attachments }); outbox.push({ to: mail.to, subject: mail.subject, raw: info.message.toString(), attachments: mail.attachments, text: mail.text }) } })
  const drain = async () => { outbox.length = 0; await s.q(`UPDATE ticket_notification SET next_attempt_at = now() + interval '1 day' WHERE order_id <> $1 AND status = 'pending'`, [order.id]); await notifier.processDue({ limit: 50 }); return [...outbox] }
  const firstMail = (await drain()).find((m) => m.to === 'ana@example.test')
  ok('11. a real MIME email with HTML, text and the QR images as inline parts', Boolean(firstMail) && /Content-Type: text\/html/.test(firstMail.raw) && /Content-Type: text\/plain/.test(firstMail.raw) && (firstMail.raw.match(/Content-Type: image\/png/g) ?? []).length === 2 && /Content-ID: <ticket-qr-1@runly>/.test(firstMail.raw))
  const tickets = (await s.q(`SELECT id, code, holder_name FROM ticket WHERE order_id = $1 ORDER BY created_at, id`, [order.id])).rows
  ok('11. the email names the event, place, holder, folio and the personal link', /Festival de Primavera/.test(firstMail.text) && /Foro Norte/.test(firstMail.text) && /Luis Mora/.test(firstMail.text) && firstMail.text.includes(tickets[0].code) && /Ver mis boletos: .*\/app\/p\/mis-boletos#/.test(firstMail.text))
  const secrets = (await s.q(`SELECT ciphertext FROM ticket_credential_secret WHERE ticket_id = ANY($1::uuid[])`, [tickets.map((t) => t.id)])).rows
  ok('19. no credential text appears in the email body (the QR travels only as an image)', !/RT1\./.test(firstMail.raw) && secrets.length === 2)

  // ---- 20. The emailed QR is admitted by the F6D gate (camera) ----------------------------------------
  const camA = await cameraBrowser(firstMail.attachments[0].content, 'mail-qr-1')
  const gate = await loginIn(camA, door, A, { phone: true })
  await gate.goto(`${BASE}/checkin/${now.id}`)
  const admitted = await visible(gate.getByText('Acceso permitido', { exact: true }), 45000)
  ok('12/20. the QR image from the email is read by the camera and admitted at the gate', admitted && (await s.q(`SELECT result, method FROM ticket_admission WHERE ticket_id = $1`, [tickets[0].id])).rows.some((r) => r.result === 'admitted' && r.method === 'qr'))
  await shot(gate, '04-phone-gate-admitted')

  // ---- 13-15. The buyer's page and resend (same QR), phone light ----------------------------------------
  const mine = await visitor({ phone: true })
  await mine.goto(`${s.urls.web}/app/p/mis-boletos#${manageToken}`)
  ok('13. the buyer sees the order: one used, one valid, no codes', await visible(mine.getByText('Ya se usó para entrar'), 30000) && await visible(mine.getByText('Vigente')) && !(await mine.content()).includes(tickets[1].code))
  const before = (await s.q('SELECT credential_hash, credential_version FROM ticket WHERE id = $1', [tickets[1].id])).rows[0]
  await mine.getByRole('button', { name: 'Reenviar' }).first().click()
  ok('14. resend from the buyer page: confirmation shown, credential unchanged', await visible(mine.getByText(/Tus QR no cambian/)) && JSON.stringify((await s.q('SELECT credential_hash, credential_version FROM ticket WHERE id = $1', [tickets[1].id])).rows[0]) === JSON.stringify(before))
  await shot(mine, '05-phone-light-my-tickets')
  ok('15. buyer page (phone light) without horizontal overflow', (await overflow(mine)) <= 1)
  const resent = (await drain()).find((m) => /reenvío/.test(m.subject))
  const camB = await cameraBrowser(resent.attachments[0].content, 'mail-qr-resent')
  const gate2 = await loginIn(camB, door, A)
  await gate2.goto(`${BASE}/checkin/${now.id}`)
  ok('15. the resent QR is still valid: admitted at the gate', await visible(gate2.getByText('Acceso permitido', { exact: true }), 45000) && (await s.q(`SELECT count(*)::int AS n FROM ticket_admission WHERE ticket_id = $1 AND result = 'admitted'`, [tickets[1].id])).rows[0].n === 1)

  // ---- 16-19. Reissue, transfer, encryption, no secrets in responses -----------------------------------
  const staffOrder = await api('POST', '/ticketing/orders', { sessionId: now.id, channel: 'box_office', items: [{ typeId: general.id, quantity: 2 }], buyer: { name: 'Marta Ruiz', email: 'marta@example.test' } }, { 'Idempotency-Key': key() })
  const [c1, c2] = staffOrder.body.credentials
  const reissued = await api('POST', `/ticketing/tickets/${c1.ticketId}/reissue`, {}, { 'Idempotency-Key': key() })
  const oldScan = await api('POST', `/ticketing/checkin/sessions/${now.id}/scan`, { text: c1.qr, admit: false, deviceId: 'verify-http-01' })
  const newScan = await api('POST', `/ticketing/checkin/sessions/${now.id}/scan`, { text: reissued.body.credential.qr, admit: false, deviceId: 'verify-http-01' })
  ok('16. reissue: the old QR answers "replaced", the new one is valid', oldScan.body?.data?.reason === 'revoked' && newScan.body?.data?.reason === 'ok')
  const transferred = await api('POST', `/ticketing/tickets/${c2.ticketId}/transfer`, { holderName: 'Jorge Silva', holderEmail: 'jorge@example.test' }, { 'Idempotency-Key': key() })
  const transferMail = await until(async () => (await s.q(`SELECT recipient FROM ticket_notification WHERE kind = 'transferred' AND $1::uuid = ANY(ticket_ids)`, [c2.ticketId])).rows[0])
  ok('17. transfer: new holder, new QR delivered to them, the old one stops working', transferred.status === 200 && transferMail?.recipient === 'jorge@example.test' && (await api('POST', `/ticketing/checkin/sessions/${now.id}/scan`, { text: c2.qr, admit: false, deviceId: 'verify-http-01' })).body?.data?.reason === 'revoked')
  const sealed = (await s.q(`SELECT ticket_id, key_id, nonce, ciphertext, credential_version FROM ticket_credential_secret WHERE ticket_id = $1`, [c1.ticketId])).rows[0]
  const newSecret = reissued.body.credential.qr.split('.')[2]
  const forged = await api('POST', `/ticketing/checkin/sessions/${now.id}/scan`, { text: `RT1.${c1.ticketId}.${Buffer.from(sealed.ciphertext).toString('base64url').padEnd(43, 'A').slice(0, 43)}`, admit: false, deviceId: 'verify-http-01' })
  ok('18. encryption: the stored copy is AES-GCM ciphertext (key kv1, version 2, 12-byte nonce) and a QR built from the database alone is rejected', sealed.key_id === 'kv1' && sealed.credential_version === 2 && sealed.nonce.length === 12 && !Buffer.from(sealed.ciphertext).toString('latin1').includes(newSecret) && forged.body?.data?.reason === 'unknown')
  const exposed = JSON.stringify([(await api('GET', `/ticketing/orders/${staffOrder.body.data.id}`)).body, (await anon('GET', '/public/ticketing/orders', null, { 'X-Ticket-Token': manageToken })).body, (await api('GET', `/ticketing/events/${event.id}/orders`)).body])
  ok('19. order APIs (staff and public) never return QR credentials or hashes', !exposed.includes('RT1.') && !exposed.includes(newSecret) && !/credential_?hash/i.test(exposed))

  // ---- 21-24. Website card, embed allowed/blocked ----------------------------------------------------------
  const card = await visitor()
  await card.goto(`${s.urls.web}/app/p/boletos/${slug}?vista=tarjeta&embed=1`)
  ok('21-22. the Website "Tarjeta del evento" view shows the published event with "Obtener boletos"', await visible(card.getByRole('link', { name: 'Obtener boletos' }), 30000) && await visible(card.getByText('Festival de Primavera')))
  await shot(card, '06-website-card')
  // What nginx asks before serving the portal (the stack's API host counts as the ERP host).
  const gateHeader = async (uri) => (await fetch(`${s.urls.api}/public/ticketing/frame-policy`, { headers: { 'X-Original-URI': uri } })).headers.get('x-ticket-frame-ancestors')
  ok('23. embed allowed: frame-ancestors lists the authorized site only for ?embed=1', (await gateHeader(`/app/p/boletos/${slug}?embed=1`)) === "'self' https://www.cliente.example" && (await gateHeader(`/app/p/boletos/${slug}`)) === "'self'")
  const foreign = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<!doctype html><title>Sitio ajeno</title><iframe src="${s.urls.web}/app/p/boletos/${slug}?embed=1" style="width:100%;height:700px;border:0"></iframe>`) })
  await new Promise((r) => foreign.listen(0, '127.0.0.1', r))
  const framed = await visitor()
  await framed.goto(`http://127.0.0.1:${foreign.address().port}/`)
  const blockedInFrame = await visible(framed.frameLocator('iframe').getByText('Sitio no autorizado'), 30000)
  foreign.close()
  ok('24. embed blocked by origin: an unlisted site gets "Sitio no autorizado" and no frame-ancestors grant', blockedInFrame && (await gateHeader(`/app/p/boletos/${hidden.slug}?embed=1`)) === "'self'")

  // ---- 25-26. Calendar ---------------------------------------------------------------------------------------
  const calendarRows = () => s.q(`SELECT id, (EXTRACT(EPOCH FROM start_at) * 1000)::bigint AS start_ms FROM calendar_event WHERE source_module = 'runly.ticketing' AND source_entity_id = $1`, [later.id])
  const projected = await until(async () => (await calendarRows()).rows.length === 1)
  const moved = await api('POST', `/ticketing/sessions/${later.id}/move`, { startsAt: new Date(Date.now() + 120 * H).toISOString() })
  const followed = await until(async () => { const r = (await calendarRows()).rows; return r.length === 1 && Number(r[0].start_ms) === new Date(moved.body.data.startsAt).getTime() })
  const listed = await api('GET', `/calendar/events?start=${new Date(Date.now() + 100 * H).toISOString()}&end=${new Date(Date.now() + 130 * H).toISOString()}`)
  const items = Array.isArray(listed.body) ? listed.body : listed.body?.data ?? []
  ok('25. functions appear in the event team\'s calendar (Calendar API)', projected && items.some((e) => e.title === 'Festival de Primavera'))
  ok('26. a moved function updates its single event (no duplicates, no attendees)', Boolean(followed) && !items.some((e) => /Ana|Luis|Marta|Jorge/.test(`${e.title} ${e.description ?? ''}`)))

  // ---- 27-28. Automations ------------------------------------------------------------------------------------
  const catalog = (await api('GET', '/automations/catalog')).body?.data?.events ?? []
  const offered = ['ticketing.order.created', 'ticketing.ticket.cancelled', 'ticketing.ticket.reissued', 'ticketing.ticket.transferred', 'ticketing.ticket.admitted'].every((k) => catalog.some((e) => e.key === k))
  ok('27. Automations offer the ticketing.* triggers (issue, cancel, reissue, transfer, admission)', offered)
  const outboxRows = (await s.q(`SELECT event, payload FROM domain_event_outbox WHERE company_id = $1 AND event LIKE 'ticketing.%'`, [A])).rows
  const leaked = outboxRows.filter((e) => /Ana|Luis|Marta|Jorge|example\.test|RT1\.|holder|email|phone/i.test(JSON.stringify(e.payload)))
  ok('28. ticketing events carry ids, states and counts only', outboxRows.length > 5 && outboxRows.some((e) => e.event === 'ticketing.ticket.admitted') && leaked.length === 0, `${outboxRows.length} events, leaked=${leaked.length}`)

  // ---- 15. Event page on desktop light ------------------------------------------------------------------------
  const wide = await visitor()
  await wide.goto(`${s.urls.web}/app/p/boletos/${slug}`)
  ok('15. event page (desktop light) shows cover, details and the ticket panel without overflow', await visible(wide.getByRole('complementary', { name: 'Obtener boletos' }), 30000) && (await wide.locator('header img').count()) > 0 && (await overflow(wide)) <= 1)
  await shot(wide, '07-desktop-light-event')
  await db.$disconnect()
  ok('no page errors, console errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('verification ran to the end', false, String(error?.message ?? error).replace(/class="[^"]*"/g, '').slice(0, 2500))
  for (const [i, p] of pages.entries()) await p.screenshot({ path: join(shots, `zz-failure-${i + 1}.png`), fullPage: true }).catch(() => {})
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})))
  await cp(shots, resolve('.e2e/ticketing-distribution-shots'), { recursive: true }).catch(() => {})
  await s.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed. Shots: .e2e/ticketing-distribution-shots`)
process.exit(failed.length ? 1 : 0)
