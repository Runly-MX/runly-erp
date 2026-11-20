// End-to-end verification of runly.bookings phase 5 (POS on the Booking Engine) on a
// disposable full stack: real Supabase, every migration + seed, API and web of the
// working tree, real browser. Nothing touches 4010/5173 or the regular database.
//   node scripts/verify-bookings-pos.mjs [--keep]
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'

const results = [], errors = [], openPages = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep') })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: s.dbUrl }) })
const web = s.urls.web, BASE = `${web}/app/m/runly.pos/pos`
const PW = `Bk-${s.run}-Aa1!x`
const key = () => `verify-pos-${crypto.randomUUID()}`
const watch = (page, who) => {
  openPages.push(page)
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const at = (hours) => { const d = new Date(Date.now() + hours * 3600000); d.setUTCMinutes(0, 0, 0); return d.toISOString() }

try {
  // ---- Company, people, POS ---------------------------------------------------------------
  const A = await s.createCompany('Restaurante Verificacion')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const hostRole = await s.createRole(A, 'bk-pos-host', ['pos.access', 'pos.orders.read', 'pos.orders.create', 'pos.orders.update', 'pos.comandas.read', 'pos.comandas.create', 'pos.caja.read'])
  const cashierRole = await s.createRole(A, 'bk-pos-cashier', ['pos.access', 'pos.caja.read', 'pos.caja.operate'])
  const admin = await s.createUser(`pos-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin POS')
  const host = await s.createUser(`pos-host-${s.run}@example.test`, PW, A, hostRole, 'Hostess Uno')
  const cashier = await s.createUser(`pos-cashier-${s.run}@example.test`, PW, A, cashierRole, 'Cajero Uno')
  const api = s.client(await s.login(admin), A), hostApi = s.client(await s.login(host), A), cashierApi = s.client(await s.login(cashier), A)
  await db.posSettings.create({ data: { companyId: A, currency: 'MXN', defaultTaxRate: 0, pricesIncludeTax: true, appointmentsEnabled: true } })
  const outlet = await db.posOutlet.create({ data: { companyId: A, name: 'Comedor', mode: 'HYBRID', allowTableCharge: true, kitchenKdsEnabled: false } })
  const tables = []
  for (const [name, capacity] of [['Mesa 1', 2], ['Mesa 2', 4], ['Mesa 3', 6]]) {
    tables.push((await api('POST', '/pos/v2/tables', { outletId: outlet.id, name, capacity }, { 'Idempotency-Key': key() })).body?.data)
  }
  ok('POS outlet with three tables', tables.every((t) => t?.id), tables.map((t) => t?.name).join(', '))
  // A legacy reservation made before activation (blocks its table all day today).
  const legacy = await db.posReservation.create({ data: { companyId: A, outletId: outlet.id, tableId: tables[2].id, guestName: 'Reserva previa', partySize: 5, scheduledAt: new Date(at(26)), durationMinutes: 120, createdById: admin.id } })
  await db.posTable.update({ where: { id: tables[2].id }, data: { status: 'RESERVED' } })

  // ---- Admin activates from Administración > Reservas -------------------------------------
  const adminPage = watch(await s.loginPage(admin, A), 'admin')
  await adminPage.goto(`${BASE}/admin`)
  await adminPage.getByRole('tab', { name: 'Reservas' }).click()
  await adminPage.getByText('Comedor · Reservas de mesas').waitFor({ timeout: 30000 })
  await adminPage.getByText('Comedor · Reservas de mesas').locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]').getByRole('button', { name: 'Revisar y activar' }).click()
  let dialog = adminPage.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Revisar' }).click()
  ok('F5D preview counts the legacy reservation without changing anything', await visible(dialog.getByText(/1\s*registro\(s\) vigente\(s\) se trasladan/)) && (await db.posBookingLink.count({ where: { companyId: A } })) === 0)
  await shot(adminPage, '01-admin-preview')
  await dialog.getByRole('button', { name: 'Activar' }).click()
  ok('F5B tables activated from the UI', await visible(adminPage.getByText('Con Reservaciones').first()))
  ok('F5D the carried table is no longer RESERVED all day', (await db.posTable.findUnique({ where: { id: tables[2].id } })).status === 'AVAILABLE' && Boolean((await db.posReservation.findUnique({ where: { id: legacy.id } })).bookingId))
  // Appointments: professionals are declared at activation.
  await adminPage.getByText('Comedor · Citas').locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]').getByRole('button', { name: 'Revisar y activar' }).click()
  dialog = adminPage.getByRole('dialog')
  for (const name of ['Ana', 'Luis']) { await dialog.getByLabel('Nombre del profesional').fill(name); await dialog.getByRole('button', { name: 'Agregar' }).click() }
  await dialog.getByRole('button', { name: 'Revisar' }).click()
  await dialog.getByRole('button', { name: 'Activar' }).click()
  ok('F5C appointments activated with two professionals', await visible(adminPage.getByText('Con Reservaciones').nth(1)))
  await shot(adminPage, '02-admin-active')

  // ---- Hostess, desktop light: the day's reservations, new reservation, conflict, arrival ----
  const hostPage = watch(await s.loginPage(host, A), 'host')
  await hostPage.goto(`${BASE}/reservas`)
  await hostPage.getByRole('heading', { name: 'Reservas', exact: true }).waitFor({ timeout: 30000 })
  ok('F5B Reservas is in the POS navigation for the hostess', await visible(hostPage.getByRole('link', { name: 'Reservas', exact: true })))
  await hostPage.getByRole('button', { name: 'Día siguiente' }).click()
  ok('F5D the carried reservation shows on its day', await visible(hostPage.getByText('Reserva previa')))
  ok('F5B «Llegó» is offered only on the day of the reservation', !(await visible(hostPage.getByRole('listitem').filter({ hasText: 'Reserva previa' }).getByRole('button', { name: 'Llegó' }), 3000)))
  await hostPage.getByRole('button', { name: 'Nueva reserva' }).click()
  dialog = hostPage.getByRole('dialog')
  await dialog.getByLabel('Cliente').fill('Familia Ruiz')
  await dialog.getByLabel('Personas').fill('4')
  await dialog.getByRole('button', { name: 'Reservar' }).click()
  ok('F5B a reservation for 4 at 20:00 tomorrow from the hostess screen', await visible(hostPage.getByText('Familia Ruiz')))
  const ruiz = (await hostApi('GET', `/pos/reservations?outletId=${outlet.id}`)).body.data.find((r) => r.guestName === 'Familia Ruiz')
  ok('F5B the engine chose a table that fits 4', ruiz?.table?.capacity >= 4 && ruiz.source === 'engine', ruiz?.table?.name)
  await shot(hostPage, '03-host-reservations')
  // Same time and table again: refused by the engine with a clear message.
  await hostPage.getByRole('button', { name: 'Nueva reserva' }).click()
  dialog = hostPage.getByRole('dialog')
  await dialog.getByLabel('Cliente').fill('Choque')
  await dialog.getByLabel('Personas').fill('4')
  const conflict = await hostApi('POST', '/pos/reservations', { outletId: outlet.id, guestName: 'Choque API', partySize: 4, tableId: ruiz.tableId, scheduledAt: ruiz.scheduledAt })
  ok('F5B the same table and time is refused (409)', conflict.status === 409, conflict.body?.error)
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  // Arrival today: Llegó opens the account at its table.
  const soon = (await hostApi('POST', '/pos/reservations', { outletId: outlet.id, guestName: 'Llega Hoy', partySize: 2, scheduledAt: new Date(Date.now() + 20 * 60000).toISOString() })).body.data
  await hostPage.getByRole('button', { name: 'Hoy' }).click()
  const row = hostPage.getByRole('listitem').filter({ hasText: 'Llega Hoy' })
  await row.getByRole('button', { name: 'Llegó' }).click()
  ok('F5B Llegó opens the table account (comandero)', await hostPage.waitForURL(/comandero\/mesa\//, { timeout: 30000 }).then(() => true, () => false))
  const seated = (await hostApi('GET', `/pos/reservations/${soon.id}`)).body.data
  ok('F5B the reservation is linked to its POS account', seated.status === 'SEATED' && Boolean(seated.orderId) && (await db.posOrder.findUnique({ where: { id: seated.orderId } }))?.tableId === seated.tableId)
  await shot(hostPage, '04-host-arrival-comandero')

  // ---- Portal booking shows in POS; POS bookings close the public time --------------------
  const link = await db.posBookingLink.findFirst({ where: { companyId: A, kind: 'tables' } })
  const slug = `mesas-${s.run}`
  const page = (await api('POST', `/bookings/spaces/${link.spaceId}/pages`, { slug, title: 'Reserva en Comedor', serviceIds: [link.serviceId], published: true })).body.data
  await api('PATCH', `/bookings/spaces/${link.spaceId}`, { published: true })
  const anon = s.client(null, null)
  const portalBook = await anon('POST', `/public/bookings/pages/${slug}/reservations`, { serviceId: link.serviceId, startsAt: at(30), partySize: 2, guestName: 'Cliente En Linea', guestEmail: 'linea@example.test', acceptedPolicyVersion: page.policyVersion }, { 'Idempotency-Key': key(), Origin: web })
  ok('E2E a portal booking is accepted', portalBook.status === 201, JSON.stringify(portalBook.body?.error ?? ''))
  const listed = (await hostApi('GET', `/pos/reservations?outletId=${outlet.id}`)).body.data.find((r) => r.guestName === 'Cliente En Linea')
  ok('E2E it appears in POS Reservas with its table', Boolean(listed?.table?.name) && listed.channel === 'portal')

  // ---- Phone, dark: the hostess screen fits ---------------------------------------------------
  const phone = watch(await s.loginPage(host, A, { phone: true, dark: true }), 'host-phone')
  await phone.goto(`${BASE}/reservas`)
  await phone.getByRole('heading', { name: 'Reservas', exact: true }).waitFor({ timeout: 30000 })
  ok('phone dark: Reservas without horizontal overflow', (await overflow(phone)) <= 0)
  await phone.getByRole('button', { name: 'Nueva reserva' }).tap()
  ok('phone dark: the new reservation form fits the screen', await visible(phone.getByRole('dialog').getByLabel('Cliente')) && (await overflow(phone)) <= 0)
  await shot(phone, '05-phone-dark-new-reservation')

  // ---- Appointments: professional choice, no overlaps ------------------------------------------
  await hostPage.goto(`${BASE}/citas`)
  await hostPage.getByRole('button', { name: 'Nueva cita' }).click()
  ok('F5C the appointment form offers the professionals', await visible(hostPage.getByRole('dialog').getByText('Profesional')))
  await hostPage.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  const appt = (name) => hostApi('POST', '/pos/appointments', { outletId: outlet.id, customerName: name, startsAt: at(28), durationMinutes: 60 })
  const [a1, a2, a3] = [await appt('Cita 1'), await appt('Cita 2'), await appt('Cita 3')]
  ok('F5C two professionals take two appointments at once; the third is refused', a1.status === 201 && a2.status === 201 && a3.status === 409, `${a1.status} ${a2.status} ${a3.status}`)

  // ---- Roles, Calendar, backoffice ---------------------------------------------------------
  const cashierPage = watch(await s.loginPage(cashier, A), 'cashier')
  await cashierPage.goto(`${BASE}/caja`)
  await cashierPage.waitForLoadState('networkidle').catch(() => {})
  ok('roles: a cashier without the orders permission has no Reservas entry', !(await visible(cashierPage.getByRole('link', { name: 'Reservas' }), 5000)))
  ok('roles: and the API refuses it (403)', (await cashierApi('GET', '/pos/reservations')).status === 403)
  const events = await db.calendarEvent.count({ where: { sourceModule: 'runly.bookings', sourceEntityId: { in: [ruiz.id, listed.id] } } })
  ok('Calendar: POS and portal reservations are projected once each', events === 2, String(events))
  ok('Calendar: the POS bridge does not mirror them again', (await db.calendarEvent.count({ where: { sourceModule: 'runly.pos', sourceEntityId: ruiz.id } })) === 0)
  await adminPage.goto(`${web}/app/m/runly.bookings/reservations?space=${link.spaceId}`)
  ok('Backoffice: Reservaciones lists the POS reservation', await visible(adminPage.getByRole('row', { name: /Familia Ruiz/ })))
  await shot(adminPage, '06-backoffice')

  ok('no page errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('journey completed', false, error.stack?.split('\n').slice(0, 4).join(' '))
  console.log('PAGE ERRORS:', errors.slice(0, 8).join('\n'))
  for (const [i, p] of openPages.entries()) await p.screenshot({ path: join(shots, `zz-fail-${i}.png`), fullPage: true }).catch(() => {})
  console.log('API LOG TAIL:', s.apiLog.join('').slice(-2000))
} finally {
  await db.$disconnect()
  await s.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots: ${shots}`)
  process.exitCode = failed.length ? 1 : 0
}
