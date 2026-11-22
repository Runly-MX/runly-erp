// Verification of runly.ticketing F6D (check-in) on a disposable full stack: real Supabase,
// every migration + seed, API and web of the working tree, real Chromium. The camera is
// Chromium's fake capture device playing a JPEG of a real ticket QR, so zxing decodes it
// exactly as from a lens. Nothing touches 4010/5173.
//   node scripts/verify-ticketing-checkin.mjs [--keep]
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { LINK_SECRET, bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'
import { ticketingMap } from '../apps/api/src/manifests/official/feature-modules.js'

const results = [], errors = [], browsers = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep') })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const QR = createRequire(resolve('apps/api/package.json'))('qrcode')
const PW = `Tk-${s.run}-Aa1!x`
const BASE = `${s.urls.web}/app/m/runly.ticketing`
const key = () => `verify-checkin-${crypto.randomUUID()}`
const H = 3600000
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`) })
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[349]|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text())) errors.push(`${who} console: ${m.text().slice(0, 300)}`) })
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
function suites(label, files, env) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, ...env }, encoding: 'utf8' })
  const tally = (k) => Number((run.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok(label, run.status === 0 && tally('fail') === 0 && tally('pass') > 0, `pass=${tally('pass')} fail=${tally('fail')}`)
  if (run.status !== 0) console.log(run.stdout.split('\n').filter((l) => /not ok|Error|assert/i.test(l)).slice(0, 30).join('\n'))
}
const admissions = async (ticketId) => (await s.q(`SELECT result, reason, method, device_id FROM ticket_admission WHERE ticket_id = $1 ORDER BY scanned_at`, [ticketId])).rows

// A Chromium whose camera shows this QR (fake capture device fed from an MJPEG file).
async function cameraBrowser(text, name) {
  const helper = await chromium.launch()
  const pg = await helper.newPage({ viewport: { width: 640, height: 480 } })
  await pg.setContent(`<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:480px"><img src="${await QR.toDataURL(text, { width: 380, margin: 2 })}"></body>`)
  const jpeg = await pg.screenshot({ type: 'jpeg', quality: 95 })
  await helper.close()
  const file = join(s.stack.directory, `${name}.mjpeg`)
  await writeFile(file, Buffer.concat(Array.from({ length: 10 }, () => jpeg)))
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${file}`] })
  browsers.push(browser)
  return browser
}
async function loginIn(browser, who, companyId, { phone = false, tablet = false, dark = false } = {}) {
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : tablet ? { width: 820, height: 1180 } : { width: 1440, height: 950 }, locale: 'es-MX', timezoneId: 'America/Mexico_City',
    colorScheme: dark ? 'dark' : 'light', permissions: ['camera'], ...(phone || tablet ? { isMobile: true, hasTouch: true } : {}),
  })
  await context.addInitScript(([id, isDark]) => { try { localStorage.setItem('runly-active-company', id); localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark }, version: 0 })) } catch { /* ignore */ } }, [companyId, dark])
  const page = watch(await context.newPage(), who.name)
  await page.goto(`${s.urls.web}/app/login`)
  await page.locator('#identifier').fill(who.email); await page.locator('#password').fill(who.password)
  await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  return page
}

try {
  const dir = async (d) => (await readdir(d)).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`)
  suites('PostgreSQL: ticketing F6B + F6C + F6D suites (check-in concurrency included)', await dir('apps/api/src/routes/ticketing/__tests__'), { TICKETING_TEST_DATABASE_URL: s.dbUrl })
  suites('PostgreSQL: Booking Engine suites (regression)', await dir('apps/api/src/routes/bookings/__tests__'), { BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET })

  // ---- Company, people, event -------------------------------------------------------------
  const A = await s.createCompany('Foro Acceso'), B = await s.createCompany('Otra Empresa')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const admin = await s.createUser(`tk-ci-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Foro')
  const doorRole = await s.createRole(A, 'tk-door', ['ticketing.access', 'ticketing.checkin'])
  const door = await s.createUser(`tk-ci-door-${s.run}@example.test`, PW, A, doorRole, 'Portero Uno')
  const door2 = await s.createUser(`tk-ci-door2-${s.run}@example.test`, PW, A, doorRole, 'Portera Dos')
  const viewRole = await s.createRole(A, 'tk-view', ['ticketing.access'])
  const viewer = await s.createUser(`tk-ci-view-${s.run}@example.test`, PW, A, viewRole, 'Sin Permiso')
  const stranger = await s.createUser(`tk-ci-stranger-${s.run}@example.test`, PW, A, doorRole, 'Fuera Del Equipo')
  const bRole = await s.createRole(B, 'tk-b', ['ticketing.access', 'ticketing.checkin', 'ticketing.events.manage'])
  const outsider = await s.createUser(`tk-ci-out-${s.run}@example.test`, PW, B, bRole, 'Otra Empresa')
  const api = s.client(await s.login(admin), A), doorApi = s.client(await s.login(door), A), door2Api = s.client(await s.login(door2), A)
  const viewApi = s.client(await s.login(viewer), A), strangerApi = s.client(await s.login(stranger), A), otherApi = s.client(await s.login(outsider), B)
  ok('admin installs Boletos 0.3.0 from the catalog API', (await api('POST', '/modules/install', { manifest: ticketingMap })).status === 201)
  const event = (await api('POST', '/ticketing/events', { title: 'Noche de jazz', slug: `jazz-${s.run}`, timezone: 'America/Mexico_City', durationMinutes: 120, venue: 'Foro Norte' })).body.data
  const now = (await api('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: new Date(Date.now() + 0.5 * H).toISOString(), capacity: 60, admitBeforeMinutes: 90, admitAfterMinutes: 45 })).body.data
  const later = (await api('POST', `/ticketing/events/${event.id}/sessions`, { startsAt: new Date(Date.now() + 72 * H).toISOString(), capacity: 20 })).body.data
  const type = (await api('POST', `/ticketing/events/${event.id}/types`, { name: 'General' })).body.data
  for (const p of [door, door2, viewer]) await api('PUT', `/ticketing/events/${event.id}/members/${p.id}`, { role: 'viewer' })
  const sell = async (sessionId, quantity, name = 'Ana Pérez') => (await api('POST', '/ticketing/orders', { sessionId, channel: 'box_office', items: [{ typeId: type.id, quantity }], buyer: { name } }, { 'Idempotency-Key': key() })).body
  const main = await sell(now.id, 10)
  const T = main.credentials
  ok('1. free tickets issued with QR credentials', main.data?.status === 'CONFIRMED' && T.length === 10)
  const scan = (who, body, sessionId = now.id) => who('POST', `/ticketing/checkin/sessions/${sessionId}/scan`, { deviceId: 'verify-http-01', ...body })

  // ---- Admission engine over real HTTP and auth ------------------------------------------------
  const first = await scan(doorApi, { text: T[0].qr })
  ok('2. a valid QR is admitted (operator and device recorded)', first.body?.data?.result === 'admitted' && first.body.data.ticket?.holderName === 'Ana Pérez', JSON.stringify(first.body).slice(0, 160))
  const again = await scan(door2Api, { text: T[0].qr, deviceId: 'verify-http-02' })
  ok('3. the second entry is refused as already used, with the first entry', again.body?.data?.reason === 'already_used' && again.body.data.firstAdmission?.operatorName === 'Portero Uno')
  const race = await Promise.all([scan(doorApi, { text: T[1].qr, deviceId: 'gate-north-01' }), scan(door2Api, { text: T[1].qr, deviceId: 'gate-south-02' })])
  const raceRows = await admissions(T[1].ticketId)
  ok('4. two operators scanning one QR at once over HTTP: one admission, one already used', race.map((r) => r.body?.data?.reason).sort().join() === 'already_used,ok' && raceRows.filter((r) => r.result === 'admitted').length === 1, race.map((r) => r.body?.data?.reason).join())
  const forged = await scan(doorApi, { text: `RT1.${T[2].ticketId}.${'A'.repeat(43)}` })
  const random = await scan(doorApi, { text: `RT1.${crypto.randomUUID()}.${'B'.repeat(43)}` })
  ok('5. a forged QR is refused like an unknown one, revealing nothing', forged.body?.data?.reason === 'unknown' && forged.body.data.ticket === null && JSON.stringify(Object.keys(forged.body.data)) === JSON.stringify(Object.keys(random.body.data)))
  const re = await api('POST', `/ticketing/tickets/${T[2].ticketId}/reissue`, {}, { 'Idempotency-Key': key() })
  ok('6. after a reissue the old QR is "replaced" and the new one admits', (await scan(doorApi, { text: T[2].qr })).body?.data?.reason === 'revoked' && (await scan(doorApi, { text: re.body.credential.qr })).body?.data?.result === 'admitted')
  const moved = await api('POST', `/ticketing/tickets/${T[3].ticketId}/transfer`, { holderName: 'Luis Gómez' }, { 'Idempotency-Key': key() })
  const oldMoved = (await scan(doorApi, { text: T[3].qr })).body?.data
  ok('7. after a transfer the old QR is "replaced"; the new holder enters', oldMoved?.reason === 'revoked' && (await scan(doorApi, { text: moved.body.credential.qr })).body?.data?.ticket?.holderName === 'Luis Gómez')
  const toCancel = await sell(now.id, 1, 'Cancela Pronto')
  await api('POST', `/ticketing/orders/${toCancel.data.id}/cancel`, {}, { 'Idempotency-Key': key() })
  ok('8. a cancelled ticket is refused as cancelled', (await scan(doorApi, { text: toCancel.credentials[0].qr })).body?.data?.reason === 'cancelled')
  const other = await sell(later.id, 1)
  const wrong = (await scan(doorApi, { text: other.credentials[0].qr })).body?.data
  ok('9. a ticket of another function is refused and names its function', wrong?.reason === 'wrong_session' && Boolean(wrong.ticketSession?.startsAt))
  const closed = (await scan(doorApi, { text: other.credentials[0].qr }, later.id)).body?.data
  ok('10. outside the admission window (doors not open yet) the entry is refused', closed?.reason === 'outside_window' && Boolean(closed.window?.opensAt))
  const noGrant = await scan(viewApi, { text: T[4].qr }), notTeam = await scan(strangerApi, { text: T[4].qr })
  ok('11. operator without ticketing.checkin (403) or outside the event team (403) is refused', noGrant.status === 403 && notTeam.status === 403 && (await admissions(T[4].ticketId)).length === 0)
  const foreign = await scan(otherApi, { text: T[4].qr })
  ok('12. another company cannot see or scan this function (404)', foreign.status === 404 && (await otherApi('GET', `/ticketing/checkin/sessions/${now.id}`)).status === 404)
  const audit = (await s.q(`SELECT count(*)::int AS n FROM ticket_admission WHERE session_id = $1 AND result = 'rejected'`, [now.id])).rows[0].n
  ok('audit: every committed rejection was appended', audit >= 6, `rejected=${audit}`)

  // ---- Browser: desktop light, no camera: manual entry, network loss ------------------------------
  const plain = await chromium.launch(); browsers.push(plain)
  const desk = await loginIn(plain, door, A)
  await desk.goto(`${BASE}/checkin`)
  ok('browser: Control de acceso lists the open function', await visible(desk.getByRole('heading', { name: 'Control de acceso' }), 40000) && await visible(desk.getByText('Admisión abierta')))
  await desk.getByText('Admisión abierta').first().click()
  await desk.getByText('Listo para escanear').waitFor({ timeout: 30000 })
  ok('browser: without a usable camera the gate explains why and keeps manual entry', await visible(desk.getByRole('alert').filter({ hasText: /cámara/i })))
  await desk.getByLabel('Código del boleto').fill('12')
  await desk.getByRole('button', { name: 'Buscar', exact: true }).click()
  ok('browser: a malformed code is caught before sending', await visible(desk.getByText('Escribe los 10 caracteres del código del boleto.')))
  await desk.getByLabel('Código del boleto').fill(T[4].code)
  await desk.getByRole('button', { name: 'Buscar', exact: true }).click()
  const validShown = await visible(desk.getByText('Boleto válido', { exact: true }))
  const beforeAdmit = (await admissions(T[4].ticketId)).length
  await desk.getByRole('button', { name: 'Registrar entrada' }).click()
  ok('14. manual entry: the code validates first, then "Registrar entrada" admits it', validShown && beforeAdmit === 0 && await visible(desk.getByText('Acceso permitido', { exact: true })) && (await admissions(T[4].ticketId))[0]?.method === 'code')
  await shot(desk, '01-desktop-light-manual-admitted')
  await desk.getByLabel('Código del boleto').fill(T[4].code)
  await desk.getByRole('button', { name: 'Buscar', exact: true }).click()
  ok('3b. browser: the same ticket again shows it already entered on this reader', await visible(desk.getByText(/Ya registrado|Ya utilizado/)) && await visible(desk.getByText(/este lector/)))
  await shot(desk, '02-desktop-light-already-used')
  await desk.context().setOffline(true)
  ok('browser: offline banner appears', await visible(desk.getByText('Sin conexión: ninguna entrada se puede confirmar hasta recuperar la red.')))
  await desk.getByLabel('Código del boleto').fill(T[5].code)
  await desk.getByRole('button', { name: 'Buscar', exact: true }).click()
  ok('13. network error: the gate says not confirmed, never "permitido", and nothing is written', await visible(desk.getByText('No se pudo confirmar el acceso. No permitas el paso hasta validar de nuevo.')) && !(await desk.getByText('Acceso permitido', { exact: true }).isVisible()) && (await admissions(T[5].ticketId)).length === 0)
  await shot(desk, '03-desktop-light-offline')
  await desk.context().setOffline(false)
  await desk.getByRole('button', { name: 'Buscar', exact: true }).click()
  ok('browser: back online the same code validates again', await visible(desk.getByText('Boleto válido', { exact: true })))

  // ---- Browser: phone dark with a real QR in front of the camera ------------------------------------
  const camA = await cameraBrowser(T[6].qr, 'qr-t6')
  const phone = await loginIn(camA, door, A, { phone: true, dark: true })
  await phone.goto(`${BASE}/checkin/${now.id}`)
  const admittedByCamera = await visible(phone.getByText('Acceso permitido', { exact: true }), 40000)
  await phone.waitForTimeout(1500)
  const rowsSoon = await admissions(T[6].ticketId)
  ok('phone camera (dark): the QR is read and admitted', admittedByCamera && rowsSoon[0]?.result === 'admitted' && rowsSoon[0]?.method === 'qr')
  ok('rapid successive reads: one QR held in front of the lens is sent once within the debounce window', rowsSoon.length === 1, `rows=${rowsSoon.length}`)
  await shot(phone, '04-phone-dark-admitted')
  ok('phone: no horizontal overflow on the gate', (await overflow(phone)) <= 1)
  await phone.waitForTimeout(6000)
  ok('a QR kept in front of the lens is not re-sent while it stays in view', (await admissions(T[6].ticketId)).length === 1 && await phone.getByText('Acceso permitido', { exact: true }).isVisible().catch(() => false) === false)
  const dbAdmitted = (await s.q(`SELECT count(*)::int AS n FROM ticket WHERE session_id = $1 AND status = 'USED'`, [now.id])).rows[0].n
  const shownAdmitted = Number(await phone.getByRole('region', { name: 'Asistencia' }).locator('p.text-3xl').first().innerText())
  ok('15. counters: "Admitidos" on screen equals the database', shownAdmitted === dbAdmitted, `screen=${shownAdmitted} db=${dbAdmitted}`)

  await camA.close()
  // ---- Two browsers, two operators, the same QR at once ---------------------------------------------
  const camB = await cameraBrowser(T[7].qr, 'qr-t7-b'), camC = await cameraBrowser(T[7].qr, 'qr-t7-c')
  const [g1, g2] = await Promise.all([loginIn(camB, door, A, { tablet: true }), loginIn(camC, door2, A, { phone: true })])
  await Promise.all([g1.goto(`${BASE}/checkin/${now.id}`), g2.goto(`${BASE}/checkin/${now.id}`)])
  const both = await Promise.all([g1, g2].map((p) => visible(p.getByRole('status').filter({ hasText: /Acceso permitido|Ya utilizado/ }), 60000)))
  for (const [i, p] of [g1, g2].entries()) {
    const diag = await p.evaluate(async () => {
      const v = document.querySelector('video')
      const probe = await Promise.race([navigator.mediaDevices.getUserMedia({ video: true }).then((st) => { const l = st.getVideoTracks()[0]?.label; st.getTracks().forEach((t) => t.stop()); return `gum ok ${l}` }, (e) => `gum ${e.name}`), new Promise((d) => setTimeout(() => d('gum hang'), 8000))])
      return `video ready=${v?.readyState} paused=${v?.paused} src=${Boolean(v?.srcObject)} w=${v?.videoWidth}; ${probe}`
    })
    console.log(`gate ${i + 1}: ${diag}`)
  }
  await g1.waitForTimeout(1000)
  const rows7 = await admissions(T[7].ticketId)
  ok('two browsers with the same QR: exactly one admission in PostgreSQL', both.every(Boolean) && rows7.filter((r) => r.result === 'admitted').length === 1 && rows7.some((r) => r.reason === 'already_used'), rows7.map((r) => `${r.result}:${r.device_id?.slice(0, 6)}`).join(' '))
  await shot(g1, '05-tablet-light-gate'); await shot(g2, '06-phone-light-gate')
  ok('tablet and phone: no horizontal overflow', (await overflow(g1)) <= 1 && (await overflow(g2)) <= 1)

  // ---- Permission screen -----------------------------------------------------------------------------
  const vp = await loginIn(plain, viewer, A, { phone: true })
  await vp.goto(`${BASE}/checkin`)
  // The platform's navigation guard answers first (the item needs ticketing.checkin); the screen's own 403 state is the second line.
  const denied = await visible(vp.getByText(/No tienes permisos para abrir esta sección|Sin acceso al control de entradas/), 30000)
  if (!denied) { await shot(vp, '99-viewer-checkin'); console.log('viewer page:', (await vp.locator('body').innerText()).slice(0, 400).replace(/\s+/g, ' ')) }
  ok('11b. browser: without ticketing.checkin the gate is not reachable and says why', denied)
  ok('no page errors, console errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('verification ran to the end', false, error?.stack?.split('\n').slice(0, 4).join(' ') ?? String(error))
} finally {
  for (const b of browsers) await b.close().catch(() => {})
  // Screenshots outlive the disposable stack (git-ignored).
  await cp(shots, resolve('.e2e/ticketing-checkin-shots'), { recursive: true }).catch(() => {})
  await s.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed. Shots: .e2e/ticketing-checkin-shots`)
process.exit(failed.length ? 1 : 0)
