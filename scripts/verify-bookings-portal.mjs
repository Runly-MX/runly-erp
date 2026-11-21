// End-to-end verification of the runly.bookings public portal (phase 3) on a
// disposable full stack: real Supabase, every migration + seed, API and web of
// the working tree. Customer pages are opened WITHOUT a session.
//   node scripts/verify-bookings-portal.mjs [--keep]
// Screenshots: <stack directory>/shots. Exit code 1 on any failed check.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { bootBookingsStack, LINK_SECRET } from './fixtures/bookings/bookings-stack.mjs'

const results = []
const errors = []
const openPages = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep') })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const PW = `Bk-${s.run}-Aa1!x`
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: s.dbUrl }) })
const web = s.urls.web
const watch = (page, who) => {
  openPages.push(page)
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(`${who} console: ${m.text().slice(0, 300)}`) })
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)

async function customer({ phone = false, dark = false } = {}) {
  const context = await s.newContext({ phone, dark })
  await context.addInitScript((isDark) => { try { localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark }, version: 0 })) } catch { /* ignore */ } }, dark)
  return watch(await context.newPage(), phone ? 'customer-phone' : 'customer')
}
// From the service step (if any) to the review step, picking the first free time.
// nextWeek: book more than a day ahead so the customer can still change it online.
async function bookThroughPortal(page, { service = null, name, email, phone = '5551002000', slotIndex = 0, nextWeek = false }) {
  if (service) await page.getByRole('button', { name: new RegExp(service) }).first().click()
  if (nextWeek) await page.getByRole('button', { name: 'Semana siguiente' }).click()
  const day = page.getByRole('radiogroup', { name: 'Día' }).getByRole('radio', { checked: true })
  if (!(await visible(day, 15000))) await page.getByRole('button', { name: 'Semana siguiente' }).click()
  const slot = page.getByRole('radiogroup', { name: 'Horario' }).getByRole('radio').nth(slotIndex)
  await slot.waitFor({ timeout: 20000 })
  const time = (await slot.textContent()).trim()
  await slot.click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Nombre').fill(name)
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel(/^Teléfono/).fill(phone)
  await page.getByRole('button', { name: 'Revisar' }).click()
  await page.getByText('Revisa y confirma').waitFor()
  return time
}

try {
  // ---- PostgreSQL suites of the engine, backoffice and portal on this same database ----
  const { spawnSync } = await import('node:child_process')
  const { readdirSync } = await import('node:fs')
  const suiteDir = 'apps/api/src/routes/bookings/__tests__'
  const suites = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...readdirSync(suiteDir).filter((f) => f.endsWith('.test.js')).map((f) => join(suiteDir, f))], {
    env: { ...process.env, BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET }, encoding: 'utf8',
  })
  const tally = (label) => Number((suites.stdout.match(new RegExp(`^# ${label} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok('PostgreSQL suites (engine, backoffice, portal, slots)', suites.status === 0 && tally('fail') === 0, `pass=${tally('pass')} fail=${tally('fail')}`)

  // ---- Company, admin and catalog (API) ----------------------------------------------
  const A = await s.createCompany('Clinica Portal')
  const role = await s.createRole(A, 'bk-portal-admin', ['bookings.access', 'bookings.spaces.manage'])
  const admin = await s.createUser(`portal-admin-${s.run}@example.test`, PW, A, role, 'Admin Portal')
  const api = s.client(await s.login(admin), A)
  const space = (await api('POST', '/bookings/spaces', { name: 'Consultorio Centro', slug: `centro-${s.run}`, timezone: 'America/Mexico_City', policy: { horizonDays: 60, cancelUntilMinutes: 1440, rescheduleUntilMinutes: 120 } })).body.data
  const resources = []
  for (const name of ['Dra. López', 'Dr. Ruiz']) resources.push((await api('POST', '/bookings/resources', { name, type: 'staff' })).body.data.id)
  await api('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: resources })
  const consulta = (await api('POST', `/bookings/spaces/${space.id}/services`, { name: 'Consulta general', kind: 'appointment', durationMinutes: 60, slotStepMinutes: 60 })).body.data
  await api('PUT', `/bookings/services/${consulta.id}/resources`, { resourceIds: [resources[0]] })
  const taller = (await api('POST', `/bookings/spaces/${space.id}/services`, { name: 'Taller grupal', kind: 'session', durationMinutes: 90, capacity: 2, maxParty: 2 })).body.data
  await api('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' })) })
  // A workshop session in two days at 11:00 Mexico City (17:00Z).
  const sessionAt = new Date(Date.now() + 2 * 86400000)
  sessionAt.setUTCHours(17, 0, 0, 0)
  const session = (await api('POST', `/bookings/spaces/${space.id}/sessions`, { serviceId: taller.id, startsAt: sessionAt })).body.data
  ok('catalog prepared through the admin API', consulta?.id && taller?.id && session?.id)

  // ---- 1. The company publishes (backoffice UI) ------------------------------------
  const adminPage = watch(await s.loginPage(admin, A), 'admin')
  await adminPage.goto(`${web}/app/m/runly.bookings/spaces/${space.id}?tab=online`)
  await adminPage.getByText('Publicar este sistema').waitFor({ timeout: 30000 })
  await adminPage.getByRole('switch', { name: 'Publicar este sistema' }).click()
  ok('1. the space is published from the Reservas online tab', await visible(adminPage.getByText('Reservas online activadas')))
  await adminPage.getByRole('button', { name: 'Nueva página' }).first().click()
  const slug = `centro-${s.run}`
  await adminPage.getByLabel('Título').fill('Agenda tu consulta')
  await adminPage.getByLabel('Dirección (slug)').fill(slug)
  await adminPage.getByLabel('Ubicación').fill('Av. Reforma 100, CDMX')
  await adminPage.getByText('Consulta general').last().click()
  await adminPage.getByText('Taller grupal').last().click()
  await adminPage.getByLabel('Política de cancelación').fill('Si no puedes asistir, cancela con 24 horas de anticipación.')
  await adminPage.getByRole('switch', { name: 'Página publicada' }).click()
  await shot(adminPage, '01-admin-page-form')
  await adminPage.getByRole('button', { name: 'Crear página' }).click()
  ok('1. admin publishes a page from the backoffice', await visible(adminPage.getByText('Página creada')) && await visible(adminPage.getByRole('listitem').filter({ hasText: 'Agenda tu consulta' }).getByText('Publicada', { exact: true })))
  await shot(adminPage, '02-admin-online-tab')

  // ---- 2-8. Customer books on desktop without a session -----------------------------
  const c = await customer()
  await c.goto(`${web}/app/p/reservar/${slug}`)
  ok('2. customer opens the link without a session (no login redirect)', await visible(c.getByRole('heading', { name: 'Agenda tu consulta' })) && !c.url().includes('/login'))
  await shot(c, '03-portal-services')
  ok('3. published services are listed', await visible(c.getByText('Consulta general')) && await visible(c.getByText('Taller grupal')))
  const time = await bookThroughPortal(c, { service: 'Consulta general', name: 'Ana Pérez', email: 'ana@example.test', nextWeek: true })
  ok('4-5. date, time and details captured', Boolean(time), time)
  const confirmBtn = c.getByRole('button', { name: 'Confirmar reservación' })
  await confirmBtn.click()
  ok('6. confirming without accepting policies is blocked', await visible(c.getByText('Acepta las políticas'), 5000))
  await c.getByText('Acepto las políticas').click()
  await shot(c, '04-portal-review')
  await confirmBtn.click()
  ok('7-8. booking created and shown as confirmed with a folio', await visible(c.getByRole('heading', { name: 'Reservación confirmada' })))
  await shot(c, '05-portal-confirmed')
  const booking = (await api('GET', `/bookings/spaces/${space.id}/reservations`)).body.data.find((b) => b.guestEmail === 'ana@example.test')
  ok('7. the engine holds a real portal booking', booking?.status === 'CONFIRMED' && booking.channel === 'portal' && booking.resourceIds.length === 1)

  // ---- 9-11. Manage link -------------------------------------------------------------
  await c.getByRole('link', { name: 'Ver o gestionar mi reservación' }).click()
  ok('9. the manage link opens the booking', await visible(c.getByRole('heading', { name: 'Tu reservación' })) && await visible(c.getByText(booking.reference)))
  ok('9. the token stays in the URL fragment', new URL(c.url()).hash.length > 40 && !new URL(c.url()).pathname.includes(new URL(c.url()).hash.slice(1)))
  await c.getByRole('button', { name: 'Reprogramar' }).click()
  await c.getByRole('button', { name: 'Semana siguiente' }).click()
  const next = c.getByRole('radiogroup', { name: 'Horario' }).getByRole('radio').nth(3)
  await next.waitFor({ timeout: 20000 })
  await next.click()
  await c.getByRole('button', { name: 'Confirmar nuevo horario' }).click()
  ok('10. customer reschedules to another free time', await visible(c.getByText('Tu reservación se reprogramó')))
  const moved = (await api('GET', `/bookings/reservations/${booking.id}`)).body.data
  ok('10. the engine moved the booking', moved.startsAt !== booking.startsAt && moved.status === 'CONFIRMED')
  await shot(c, '06-manage-rescheduled')
  await c.getByRole('button', { name: 'Cancelar reservación' }).click()
  await c.getByRole('dialog').getByRole('button', { name: 'Cancelar reservación' }).click()
  ok('11. customer cancels', await visible(c.getByText('Tu reservación quedó cancelada')))
  const cancelled = (await api('GET', `/bookings/reservations/${booking.id}`)).body.data
  ok('11. cancel freed the resource', cancelled.status === 'CANCELLED' && cancelled.resourceIds.length === 0)
  await shot(c, '07-manage-cancelled')

  // ---- 12. The admin sees it in the backoffice ---------------------------------------
  await adminPage.goto(`${web}/app/m/runly.bookings/reservations?space=${space.id}`)
  const row = adminPage.getByRole('row', { name: /Ana Pérez/ })
  ok('12. admin sees the customer booking as cancelled', await visible(row) && await visible(row.getByText('Cancelada')))
  await row.getByRole('button', { name: 'Abrir' }).click()
  ok('12. history shows the customer actions', await visible(adminPage.getByText('Cliente (portal)')))
  await shot(adminPage, '08-admin-history')

  // ---- Conflict: the time is taken while the customer reviews -----------------------
  const conflictPage = await customer()
  await conflictPage.goto(`${web}/app/p/reservar/${slug}`)
  const conflictTime = await bookThroughPortal(conflictPage, { service: 'Consulta general', name: 'Luis Gómez', email: 'luis@example.test', nextWeek: true })
  await conflictPage.getByText('Acepto las políticas').click()
  const free = (await api('GET', `/bookings/spaces/${space.id}/availability?serviceId=${consulta.id}&from=${new Date().toISOString()}&to=${new Date(Date.now() + 21 * 86400000).toISOString()}`)).body.data.slots
  // The week strip starts today, so "next week" opens on today + 7 (Mexico City dates).
  const localDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
  const pickedDay = localDay(Date.now() + 7 * 86400000)
  const target = free.find((x) => localDay(x.startsAt) === pickedDay && new Date(x.startsAt).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) === conflictTime)
  ok('conflict: someone else takes the same time first', (await api('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: consulta.id, startsAt: target.startsAt, guestName: 'Mostrador' })).status === 201)
  await conflictPage.getByRole('button', { name: 'Confirmar reservación' }).click()
  ok('conflict: the customer is told and sent back to choose another time', await visible(conflictPage.getByText('Ese horario acaba de ocuparse')) && await visible(conflictPage.getByRole('radiogroup', { name: 'Horario' })))
  await shot(conflictPage, '09-portal-conflict')

  // ---- Network failure: retry with the same key creates one booking ------------------
  const flaky = await customer()
  await flaky.goto(`${web}/app/p/reservar/${slug}`)
  await bookThroughPortal(flaky, { service: 'Consulta general', name: 'Red Inestable', email: 'red@example.test', slotIndex: 2, nextWeek: true })
  await flaky.getByText('Acepto las políticas').click()
  let dropped = false
  // The request reaches the server; only the response is lost (the dangerous case).
  await flaky.route('**/public/bookings/pages/*/reservations', async (route) => {
    if (dropped) return route.continue()
    dropped = true
    await route.fetch()
    return route.abort('connectionreset')
  })
  await flaky.getByRole('button', { name: 'Confirmar reservación' }).click()
  ok('network error: a safe retry is offered', await visible(flaky.getByRole('button', { name: 'Reintentar' })))
  await shot(flaky, '10-portal-network-error')
  await flaky.getByRole('button', { name: 'Reintentar' }).click()
  ok('network error: the retry shows the committed booking', await visible(flaky.getByRole('heading', { name: 'Reservación confirmada' })))
  const flakyCount = (await api('GET', `/bookings/spaces/${space.id}/reservations?q=red%40example.test`)).body.total
  ok('network error: exactly one booking exists after the retry', flakyCount === 1, `${flakyCount}`)

  // ---- Phone + dark, approval required: the result says "pendiente" ------------------
  await api('PATCH', `/bookings/spaces/${space.id}`, { policy: { horizonDays: 60, cancelUntilMinutes: 1440, rescheduleUntilMinutes: 120, requiresApproval: true, holdMinutes: 60 } })
  const m = await customer({ phone: true, dark: true })
  await m.goto(`${web}/app/p/reservar/${slug}`)
  await m.getByRole('heading', { name: 'Agenda tu consulta' }).waitFor({ timeout: 30000 })
  await m.getByText('Iniciando Runly ERP').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
  ok('phone: portal without horizontal overflow', (await overflow(m)) <= 0)
  await shot(m, '11-phone-dark-services')
  await bookThroughPortal(m, { service: 'Taller grupal', name: 'Sofía Ruiz', email: 'sofia@example.test' })
  ok('phone: review without horizontal overflow', (await overflow(m)) <= 0)
  await m.getByText('Acepto las políticas').click()
  await m.getByRole('button', { name: 'Enviar solicitud' }).click()
  ok('pending: the result does not claim a confirmed appointment', await visible(m.getByRole('heading', { name: 'Solicitud recibida: pendiente de confirmación' })))
  await shot(m, '12-phone-dark-pending')

  // ---- Notifications: outbox rows, rendered emails, link that works ------------------
  const { createBookingsNotifier } = await import('../apps/api/src/routes/bookings/bookings-notifications.js')
  const sent = []
  const notifier = createBookingsNotifier({ prisma: db, env: { BOOKINGS_LINK_SECRET: LINK_SECRET, PUBLIC_APP_URL: web }, sendMail: async (mail) => { sent.push(mail) } })
  const kinds = (await db.$queryRaw`SELECT kind, count(*)::int AS n FROM booking_notification WHERE company_id = ${A}::uuid GROUP BY kind ORDER BY kind`).map((r) => `${r.kind}:${r.n}`)
  ok('emails queued once per event (outbox)', kinds.includes('confirmed:2') && kinds.includes('rescheduled:1') && kinds.includes('cancelled:1') && kinds.includes('pending:1'), kinds.join(' '))
  const result = await notifier.processDue({ limit: 50 })
  ok('the worker sends every queued email once', result.sent === sent.length && sent.length >= 5 && (await notifier.processDue()).processed === 0, `sent=${result.sent}`)
  const pendingMail = sent.find((mail) => mail.to === 'sofia@example.test')
  const link = pendingMail?.html.match(/href="([^"]*\/app\/p\/reservar\/gestion#[^"]+)"/)?.[1]
  ok('the pending email says it is pending and carries the manage link', /pendiente/i.test(pendingMail?.html ?? '') && Boolean(link))
  const fromEmail = await customer()
  await fromEmail.goto(link)
  ok('the link from the email opens the booking', await visible(fromEmail.getByText('Pendiente')))

  // ---- Expiry of pending holds ------------------------------------------------------
  const { createBookingsCommandService } = await import('../apps/api/src/routes/bookings/bookings-command-service.js')
  await db.$executeRaw`UPDATE booking SET hold_expires_at = now() - interval '1 minute' WHERE company_id = ${A}::uuid AND status = 'PENDING'`
  const sweep = await createBookingsCommandService({ prisma: db }).expireAllHolds()
  await fromEmail.reload()
  ok('expired holds are released and shown as expired', sweep.expired >= 1 && await visible(fromEmail.getByText('Expirada')))
  await shot(fromEmail, '13-manage-expired')

  // ---- Unpublished page accepts nothing -----------------------------------------------
  const pages = (await api('GET', `/bookings/spaces/${space.id}/pages`)).body.data
  await api('PATCH', `/bookings/pages/${pages[0].id}`, { published: false })
  const closed = await customer({ phone: true })
  await closed.goto(`${web}/app/p/reservar/${slug}`)
  ok('unpublished page is not available', await visible(closed.getByText('Página no disponible')))
  const anon = s.client(null, null)
  ok('unpublished page refuses new bookings from the API too', (await anon('POST', `/public/bookings/pages/${slug}/reservations`, { serviceId: consulta.id, startsAt: target.startsAt, guestName: 'X Y', guestEmail: 'x@example.test', acceptedPolicyVersion: 1 }, { 'Idempotency-Key': `${crypto.randomUUID()}` })).status === 404)
  ok('foreign origins are refused', (await anon('GET', `/public/bookings/pages/${slug}`, null, { Origin: 'https://evil.example' })).status === 403)

  ok('no page errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('journey completed', false, error.stack?.split('\n').slice(0, 4).join(' '))
  console.log('PAGE ERRORS:', errors.slice(0, 8).join('\n'))
  for (const [i, page] of openPages.entries()) await page.screenshot({ path: join(shots, `zz-fail-${i}.png`), fullPage: true }).catch(() => {})
  console.log('API LOG TAIL:', s.apiLog.join('').slice(-1500))
} finally {
  await db.$disconnect()
  await s.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots: ${shots}`)
  process.exitCode = failed.length ? 1 : 0
}
