// Verification of runly.ticketing F6C (backoffice and box office) on a disposable full
// stack: real Supabase, every migration + seed, API and web of the working tree, real
// browser. Free issuance from the backoffice, a paid order charged in the real Caja and
// confirmed by the server, partial cancellation, refund-before-void, managed booking
// spaces, permissions, desktop and phone in light and dark. Nothing touches 4010/5173.
//   node scripts/verify-ticketing-box-office.mjs [--keep]
import { spawnSync } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { LINK_SECRET, bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'
import { ticketingMap } from '../apps/api/src/manifests/official/feature-modules.js'

const results = [], errors = [], pages = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const s = await bootBookingsStack({ keep: process.argv.includes('--keep') })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: s.dbUrl, max: 5 }) })
const PW = `Tk-${s.run}-Aa1!x`
const BASE = `${s.urls.web}/app/m/runly.ticketing`
const key = () => `verify-box-office-${crypto.randomUUID()}`
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
const shot = (page, name, fullPage = false) => page.screenshot({ path: join(shots, `${name}.png`), fullPage })
const watch = (page, who) => {
  pages.push(page)
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[349]/.test(m.text())) errors.push(`${who} console: ${m.text().slice(0, 300)}`) })
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
function suites(label, files, env) {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, ...env }, encoding: 'utf8' })
  const tally = (k) => Number((run.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0)
  ok(label, run.status === 0 && tally('fail') === 0 && tally('pass') > 0, `pass=${tally('pass')} fail=${tally('fail')}`)
}

try {
  const dir = async (d) => (await readdir(d)).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`)
  suites('PostgreSQL: ticketing F6B + F6C suites (real POS sales, refunds, partial cancel)', await dir('apps/api/src/routes/ticketing/__tests__'), { TICKETING_TEST_DATABASE_URL: s.dbUrl })
  suites('PostgreSQL: Booking Engine suites (regression)', await dir('apps/api/src/routes/bookings/__tests__'), { BOOKINGS_TEST_DATABASE_URL: s.dbUrl, BOOKINGS_LINK_SECRET: LINK_SECRET })

  // ---- Company, people, POS ------------------------------------------------------------------
  const A = await s.createCompany('Teatro Taquilla'), B = await s.createCompany('Otra Empresa')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const admin = await s.createUser(`tk-box-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Taquilla')
  const agentRole = await s.createRole(A, 'tk-agent', ['ticketing.access'])
  const agent = await s.createUser(`tk-box-agent-${s.run}@example.test`, PW, A, agentRole, 'Agente Sin Evento')
  const bRole = await s.createRole(B, 'tk-b', ['ticketing.access', 'ticketing.events.manage'])
  const outsider = await s.createUser(`tk-box-out-${s.run}@example.test`, PW, B, bRole, 'Otra Empresa')
  const api = s.client(await s.login(admin), A), agentApi = s.client(await s.login(agent), A), otherApi = s.client(await s.login(outsider), B)
  ok('admin installs Boletos from the catalog API', (await api('POST', '/modules/install', { manifest: ticketingMap })).status === 201)
  await db.posSettings.create({ data: { companyId: A, currency: 'MXN', defaultTaxRate: 0, pricesIncludeTax: true } })
  const outlet = await db.posOutlet.create({ data: { companyId: A, name: 'Taquilla', mode: 'RETAIL' } })
  const terminal = await db.posTerminal.create({ data: { companyId: A, outletId: outlet.id, name: 'Caja 1' } })
  const cash = await db.posPaymentMethod.create({ data: { companyId: A, name: 'Efectivo', code: 'cash', kind: 'CASH' } })
  const product = await db.catalogProduct.create({ data: { companyId: A, name: 'Boleto VIP', slug: `vip-${s.run}`, price: 300, currency: 'MXN', trackStock: false } })
  const session = (await api('POST', '/pos/v2/sessions/open', { outletId: outlet.id, terminalId: terminal.id, openingCashAmount: '0.00' }, { 'Idempotency-Key': key() })).body?.data
  ok('POS outlet, terminal, cash method and open cash session', session?.id, JSON.stringify(session ?? {}).slice(0, 120))

  // ---- Backoffice: create the event, a function and two types (desktop light) -----------------
  const page = watch(await s.loginPage(admin, A), 'admin')
  await page.goto(`${BASE}/`)
  ok('launcher route: Mis eventos opens with its empty state', await visible(page.getByRole('heading', { name: 'Mis eventos' }), 40000) && await visible(page.getByText('Todavía no hay eventos')))
  await page.getByRole('button', { name: 'Nuevo evento' }).first().click()
  await page.getByRole('heading', { name: 'Nuevo evento' }).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Crear evento' }).click()
  ok('event editor: validation names what is missing before saving', await visible(page.getByText('Escribe el nombre del evento.')) && await visible(page.getByText('Falta: nombre y dirección')))
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Gala de invierno')
  ok('event editor: the slug follows the name', (await page.getByLabel('Dirección (slug)').inputValue()) === 'gala-de-invierno')
  await page.getByLabel('Lugar').fill('Teatro Juárez')
  await shot(page, '01-desktop-light-event-editor', true)
  await page.getByRole('button', { name: 'Crear evento' }).click()
  await page.waitForURL(/\/events\/[0-9a-f-]{36}\?tab=sessions/, { timeout: 30000 })
  const eventId = page.url().split('/events/')[1].split('?')[0]
  ok('event created from the full-page editor', eventId.length === 36)
  await page.getByRole('button', { name: 'Nueva función' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Agregar función' }).click()
  ok('function added on the engine (dialog: date, time, seats)', await visible(page.getByText('Función agregada')))
  await page.getByRole('tab', { name: 'Boletos' }).click()
  await page.getByRole('button', { name: 'Nuevo tipo' }).first().click()
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('General')
  await page.getByRole('button', { name: 'Crear tipo' }).click()
  await page.getByText('Tipo de boleto guardado').first().waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: 'Nuevo tipo' }).first().click()
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('VIP')
  await page.getByRole('radio', { name: /Con precio/ }).click()
  await page.getByLabel('Producto del catálogo').click()
  await page.getByRole('option', { name: /Boleto VIP/ }).click()
  await shot(page, '02-desktop-light-type-sheet')
  await page.getByRole('button', { name: 'Crear tipo' }).click()
  ok('free and paid ticket types created (paid one linked to a catalog product)', await visible(page.getByText('Con precio · Caja')) && await visible(page.getByText('Gratis', { exact: true })))
  await shot(page, '03-desktop-light-types', true)

  // ---- Free issuance from the box office -------------------------------------------------------
  await page.getByRole('tab', { name: 'Taquilla' }).click()
  await page.getByLabel('Cantidad de General').fill('3')
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Ana Pérez')
  await shot(page, '04-desktop-light-box-office', true)
  await page.getByRole('button', { name: /Emitir 3 boletos/ }).click()
  await page.getByRole('img', { name: /QR del boleto/ }).nth(2).waitFor({ timeout: 20000 }).catch(() => {})
  ok('free issuance: 3 QR shown once to hand over', await visible(page.getByRole('dialog').getByText('Boletos emitidos')) && (await page.getByRole('dialog').getByRole('img', { name: /QR del boleto/ }).count()) === 3)
  await shot(page, '05-desktop-light-credentials')
  await page.getByRole('button', { name: 'Listo, ya los entregué' }).click()
  const freeOrder = (await api('GET', `/ticketing/events/${eventId}/orders`)).body.data.find((o) => o.status === 'CONFIRMED')

  // ---- Paid: hold, charge in the real Caja, server confirms ------------------------------------
  await page.getByLabel('Cantidad de VIP').fill('2')
  await page.getByRole('button', { name: 'Apartar y cobrar en Caja' }).click()
  await page.waitForURL(/\/pos\/caja\?boletos=/, { timeout: 30000 })
  const heldId = new URL(page.url()).searchParams.get('boletos')
  ok('paid order held and Caja opened with it', await visible(page.getByText(/Cobrando boletos · orden/), 40000))
  await page.getByRole('button', { name: /^Cobrar .*600/ }).first().waitFor({ timeout: 30000 })
  const chargeLabel = (await page.getByRole('button', { name: /^Cobrar \S/ }).first().textContent()) ?? ''
  ok('Caja loaded the 2 VIP tickets at the catalog price', /600/.test(chargeLabel), chargeLabel)
  await shot(page, '06-desktop-light-caja-tickets')
  await page.getByRole('button', { name: /^Cobrar \S/ }).first().click()
  await page.getByRole('button', { name: 'Exacto' }).click()
  await page.getByRole('button', { name: /Confirmar pago/ }).click()
  ok('after the real payment the server verified the sale and issued the QRs', await visible(page.getByRole('dialog').getByText('Boletos pagados'), 40000))
  await shot(page, '07-desktop-light-caja-paid-credentials')
  await page.getByRole('button', { name: 'Listo, ya los entregué' }).click()
  const held = (await api('GET', `/ticketing/orders/${heldId}`)).body.data
  const link = (await s.q(`SELECT o.pos_order_id, p.status FROM ticket_order o JOIN pos_order p ON p.id = o.pos_order_id WHERE o.id = $1`, [heldId])).rows[0]
  ok('paid order CONFIRMED, linked to its PAID POS sale, 2 tickets issued', held.status === 'CONFIRMED' && link?.status === 'PAID' && held.tickets.filter((t) => t.status === 'ISSUED').length === 2)

  // ---- Server refusals ---------------------------------------------------------------------------
  const vip = (await api('GET', `/ticketing/events/${eventId}`)).body.data.types.find((t) => t.name === 'VIP')
  const fn = (await api('GET', `/ticketing/events/${eventId}`)).body.data.sessions[0]
  const hold2 = (await api('POST', '/ticketing/orders', { sessionId: fn.id, items: [{ typeId: vip.id, quantity: 1 }] }, { 'Idempotency-Key': key() })).body.data
  const unpaid = (await api('POST', '/pos/v2/orders', { outletId: outlet.id, terminalId: terminal.id, sessionId: session.id, experience: 'RETAIL', fulfillmentType: 'TAKEAWAY' }, { 'Idempotency-Key': key() })).body.data
  const noPay = await api('POST', `/ticketing/orders/${hold2.id}/confirm-payment`, { posOrderId: unpaid.id }, { 'Idempotency-Key': key() })
  ok('confirmation without a paid sale is refused', noPay.status === 409 && noPay.body.code === 'PAYMENT_NOT_CONFIRMED', `${noPay.status} ${noPay.body?.code}`)
  const reuse = await api('POST', `/ticketing/orders/${hold2.id}/confirm-payment`, { posOrderId: link.pos_order_id }, { 'Idempotency-Key': key() })
  ok('a sale that already paid an order cannot pay another', reuse.status === 409 && reuse.body.code === 'SALE_ALREADY_USED')
  const replay = await api('POST', `/ticketing/orders/${heldId}/confirm-payment`, { posOrderId: link.pos_order_id }, { 'Idempotency-Key': key() })
  ok('confirming the paid order again issues nothing new', replay.status === 200 && replay.body.replayed === true && replay.body.credentials.length === 0)
  const paidCancel = await api('POST', `/ticketing/orders/${heldId}/cancel`, { ticketIds: [held.tickets[0].id] })
  ok('a paid ticket is not voided before its refund in Caja', paidCancel.status === 409 && paidCancel.body.code === 'REFUND_REQUIRED')
  ok('an agent outside the event team is refused (403)', (await agentApi('GET', `/ticketing/events/${eventId}`)).status === 403)
  ok('another company does not see the event (404)', (await otherApi('GET', `/ticketing/events/${eventId}`)).status === 404)

  // ---- Partial cancellation from the order page ----------------------------------------------------
  await page.goto(`${BASE}/events/${eventId}/orders/${freeOrder.id}`)
  await page.getByRole('heading', { name: `Orden ${freeOrder.reference}` }).waitFor({ timeout: 30000 })
  const before = (await s.q(`SELECT seats_taken FROM booking_session WHERE id = $1`, [fn.bookingSessionId])).rows[0].seats_taken
  await page.locator('label').filter({ has: page.locator('input[type="checkbox"]') }).first().click()
  await shot(page, '08-desktop-light-order', true)
  await page.getByRole('button', { name: 'Cancelar 1' }).click()
  await page.getByRole('button', { name: 'Cancelar boletos' }).click()
  await page.getByText('Boletos cancelados').first().waitFor({ timeout: 20000 })
  const after = (await s.q(`SELECT seats_taken FROM booking_session WHERE id = $1`, [fn.bookingSessionId])).rows[0].seats_taken
  const kept = (await api('GET', `/ticketing/orders/${freeOrder.id}`)).body.data
  ok('partial cancellation frees exactly one seat; the other two tickets stay valid', after === before - 1 && kept.tickets.filter((t) => t.status === 'ISSUED').length === 2 && kept.status === 'CONFIRMED', `${before}->${after}`)

  // ---- Reservaciones shows the event space read-only ---------------------------------------------
  const spaceId = (await api('GET', `/ticketing/events/${eventId}`)).body.data.spaceId
  await page.goto(`${s.urls.web}/app/m/runly.bookings/spaces/${spaceId}`)
  ok('Reservaciones: event space marked "Administrado por Boletos" with a link to the event', await visible(page.getByText('Administrado por Boletos'), 30000) && await visible(page.getByRole('button', { name: 'Abrir evento' })))
  ok('Reservaciones: no "Nueva reservación" on a managed space', !(await page.getByRole('button', { name: 'Nueva reservación' }).isVisible()))
  await page.getByRole('button', { name: 'Abrir evento' }).click()
  ok('"Abrir evento" navigates to the owner event', await visible(page.getByRole('heading', { name: 'Gala de invierno' }), 30000))

  // ---- Desktop dark, tablet and phones ------------------------------------------------------------------
  for (const [tag, options] of [['desktop-dark', { dark: true }], ['phone-light', { phone: true }], ['phone-dark', { phone: true, dark: true }]]) {
    const p = watch(await s.loginPage(admin, A, options), tag)
    for (const [name, path, heading] of [['events', '/', 'Mis eventos'], ['overview', `/events/${eventId}`, 'Gala de invierno'], ['box-office', `/events/${eventId}?tab=box-office`, 'Gala de invierno'], ['order', `/events/${eventId}/orders/${heldId}`, /^Orden /], ['editor', `/events/${eventId}/edit`, /Editar Gala/]]) {
      await p.goto(`${BASE}${path}`)
      await p.getByRole('heading', { name: heading }).first().waitFor({ timeout: 40000 })
      await p.waitForTimeout(600)
      ok(`${tag} ${name}: no horizontal overflow`, (await overflow(p)) <= 0)
      await shot(p, `20-${tag}-${name}`, true)
    }
    await p.context().close()
  }
  ok('no page errors, console errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' || '))
} catch (error) {
  ok('verification finished without exceptions', false, error.stack?.split('\n').slice(0, 3).join(' | '))
  for (const [i, p] of pages.entries()) await p.screenshot({ path: join(shots, `zz-fail-${i}.png`), fullPage: true }).catch(() => {})
  console.log('PAGE ERRORS:', errors.slice(0, 8).join('\n'))
} finally {
  await db.$disconnect().catch(() => {})
  await s.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots: ${shots}`)
  process.exit(failed.length ? 1 : 0)
}
