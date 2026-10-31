// Entrega 3 (Control documental in the UI) on DISPOSABLE stacks: the twelve
// acceptance checks, light/dark x 390/1440, and an instance without
// the documentary migration. Data is checked in the database, not only on screen.
// Usage: node scripts/purchases/verify-documentary-ui.mjs [--keep]
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { toLocalIso } from '../../packages/core/src/time.js'
import { bootPurchasesStack, contrastScan, overflowX } from './validation-stack.mjs'

const results = []
const accept = {}
const check = (name, ok, info = '', test = null) => {
  results.push(ok); if (test) accept[test] = (accept[test] ?? true) && ok
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${test ? `[${test}] ` : ''}${name}${info ? `  - ${info}` : ''}`)
}
const SHOTS = resolve('.e2e/shots/documentary'); await mkdir(SHOTS, { recursive: true })
const pw = `Doc-${Date.now()}-Test!`
const settle = async (page) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(700) }
const ready = (page) => page.getByRole('tab', { name: /Historial/ }).waitFor({ timeout: 60000 })
const MONEY = /\$\s?\d|Por pagar|Saldo pendiente|Pagado|Vencida|Vence en|Pago parcial/
const isoDay = (offset) => toLocalIso(new Date(Date.now() + offset * 86400000))
const docRef = async (s, id) => (await s.q('SELECT reference FROM purchase_documentary_reference WHERE document_id = $1', [id])).rows[0]?.reference

let s = await bootPurchasesStack()
try {
  const D = await s.createCompany('Compras Documental')
  const role = await s.createRole(D, 'compras.total', 'purchases.%')
  await s.q(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'inventory.%' OR key LIKE 'files.%'`, [role])
  const buyer = await s.createUser('compras@doc.example.test', pw, [[D, role]])
  const noFiles = await s.createUser('sinarchivos@doc.example.test', pw, [[D, await s.createRole(D, 'sin.archivos', 'purchases.%')]])
  const reader = await s.createUser('lectora@doc.example.test', pw, [[D, await s.createRole(D, 'lectura', ['purchases.access', 'purchases.read', 'purchases.order.read', 'purchases.invoice.read', 'purchases.relation.read', 'purchases.settings.read'])]])
  const setup = await s.createUser('montaje@doc.example.test', pw, [[D, await s.createRole(D, 'montaje', '%')]])
  const admin = s.client(await s.login(setup), D)
  const supplier = (await admin('POST', '/contacts', { name: 'Aceros del Bajío', type: 'supplier' })).body.data
  const items = []
  for (const name of ['Adaptador de red 1', 'Adaptador de red 2', 'Adaptador de red 3']) items.push((await admin('POST', '/inventory/items', { name })).body.data)
  const api = s.client(await s.login(buyer), D)
  const tr = (kind, id, action, extra = {}) => api('POST', `/purchases/${kind}/${id}/transition`, { action, ...extra })

  // Historic FINANCIAL documents before switching (test 10).
  await api('PUT', '/purchases/settings', { preset: 'BASIC' })
  const fo = (await api('POST', '/purchases/orders', { number: 'OC-FIN-1', supplierId: supplier.id, lines: [{ description: 'Monitor', quantity: 2, unitAmount: 3000 }] })).body.data
  await tr('orders', fo.id, 'submit'); await tr('orders', fo.id, 'issue')
  const fi = (await api('POST', '/purchases/invoices', { number: 'FAC-FIN-1', supplierId: supplier.id, orderIds: [fo.id], dueDate: isoDay(10), lines: [{ description: 'Monitor', quantity: 2, unitAmount: 3000 }] })).body.data
  await tr('invoices', fi.id, 'submit')
  await api('PUT', '/purchases/settings', { preset: 'CUSTOM', capabilities: { requests: false, quotes: false, approvals: false, purchaseOrders: true, receipts: false, invoices: true, payments: true, inventoryRelations: true }, stages: [{ type: 'PURCHASE_ORDER', mode: 'OPTIONAL' }, { type: 'INVOICE', mode: 'OPTIONAL' }, { type: 'PAYMENT', mode: 'OPTIONAL' }, { type: 'CLOSE', mode: 'REQUIRED' }], policies: [] })
  await api('POST', `/purchases/invoices/${fi.id}/payments`, { amount: '1000.00' })
  const finBefore = (await s.q('SELECT total::text, paid_amount::text, status FROM purchase_invoice WHERE id = $1', [fi.id])).rows[0]

  // ── Settings: choose Control documental from the UI ──
  let { context, page } = await s.open(buyer, D)
  await page.goto(`${s.root}/settings`); await page.getByRole('heading', { name: 'Tratamiento económico' }).waitFor({ timeout: 60000 }); await settle(page)
  await page.getByRole('button', { name: 'Usar Control documental' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Usar Control documental' }).click()
  await page.locator('[data-economic-mode="DOCUMENTARY"][aria-current="true"]').waitFor({ timeout: 30000 })
  const mode = (await api('GET', '/purchases/settings')).body.data
  check('settings: Control documental chosen from the UI (API mode DOCUMENTARY, flow fixed)', mode.economicMode === 'DOCUMENTARY' && await page.getByText('En Control documental el proceso es fijo').isVisible(), mode.economicMode, 'settings')
  await page.screenshot({ path: join(SHOTS, 'settings-1440-light.png'), fullPage: true })

  // ── 1. Order with only its reference ──
  await page.goto(`${s.root}/orders/new`); await page.getByRole('button', { name: 'Registrar orden' }).waitFor({ timeout: 60000 }); await settle(page)
  check('editor: no price, tax, total or currency inputs', !(await page.getByLabel(/Precio unitario|Impuesto|Moneda/).count()) && !(await page.getByText(/Total del documento|Subtotal/).count()), '', '1')
  await page.getByLabel('Nombre, código o referencia').fill('OC-2485')
  await page.getByRole('button', { name: 'Registrar orden' }).dblclick()
  await page.waitForURL(/\/purchases\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 })
  const orderId = page.url().split('/').pop()
  const orderRow = (await s.q('SELECT status, total, subtotal, tax, supplier_id, issue_date, currency FROM purchase_order WHERE id = $1', [orderId])).rows[0]
  const sameRef = (await s.q(`SELECT count(*)::int AS n FROM purchase_documentary_reference WHERE reference = 'OC-2485'`)).rows[0].n
  check('order registered with only "OC-2485" (double click = one record)', orderRow.status === 'REGISTERED' && await docRef(s, orderId) === 'OC-2485' && sameRef === 1, JSON.stringify(orderRow), '1')
  await ready(page); await settle(page)
  check('order detail: reference as title, internal folio apart', /OC-2485/.test(await page.locator('h1').innerText()) && /Folio interno/.test(await page.getByRole('region', { name: /^Resumen de orden/ }).innerText()), '', '1')

  // ── 2. Invoice with only its reference ──
  await page.goto(`${s.root}/invoices/new`); await page.getByRole('button', { name: 'Registrar factura' }).waitFor({ timeout: 60000 }); await settle(page)
  await page.getByLabel('Nombre, código o referencia').fill('F-008721')
  await page.getByRole('button', { name: 'Registrar factura' }).click()
  await page.waitForURL(/\/purchases\/invoices\/[0-9a-f-]{36}$/, { timeout: 30000 })
  const invoiceId = page.url().split('/').pop()
  check('invoice registered with only "F-008721"', (await s.q('SELECT status FROM purchase_invoice WHERE id = $1', [invoiceId])).rows[0].status === 'REGISTERED' && await docRef(s, invoiceId) === 'F-008721', '', '2')

  // ── 3. Saved without amounts, supplier, date or PDF ──
  const invRow = (await s.q('SELECT total, subtotal, tax, paid_amount, supplier_id, issue_date, currency, due_date FROM purchase_invoice WHERE id = $1', [invoiceId])).rows[0]
  const files = (await s.q(`SELECT count(*)::int AS n FROM file_link WHERE entity_id = $1`, [invoiceId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n
  check('DB: NULL amounts, supplier, issue date and due date; no files', [orderRow.total, orderRow.subtotal, orderRow.tax, orderRow.supplier_id, orderRow.issue_date, invRow.total, invRow.subtotal, invRow.tax, invRow.paid_amount, invRow.supplier_id, invRow.issue_date, invRow.due_date].every((v) => v === null) && files === 0, JSON.stringify(invRow), '3')
  await ready(page); await settle(page)
  const invText = await page.locator('main').innerText()
  check('invoice detail: "Sin proveedor", "Sin fecha del documento", no money or debt words', /Sin proveedor/.test(invText) && /Sin fecha del documento/.test(invText) && !MONEY.test(invText), invText.match(MONEY)?.[0] ?? '', '3')
  check('detail: no Pagos tab, history available', !(await page.getByRole('tab', { name: /^Pagos/ }).count()) && await page.getByRole('tab', { name: /Historial/ }).isVisible(), '', '3')
  await page.screenshot({ path: join(SHOTS, 'invoice-detail-1440-light.png'), fullPage: true })

  // ── 4. Order with several items, no invoice (from the items, UI) ──
  const relateFromItem = async (item, kindLabel, docLabel) => {
    await page.goto(`${s.urls.web}/app/m/runly.inventory/inventory/${item.id}`)
    await page.getByRole('button', { name: 'Relacionar existente' }).waitFor({ timeout: 60000 }); await settle(page)
    await page.getByRole('button', { name: 'Relacionar existente' }).click()
    const dialog = page.getByRole('dialog')
    if (await dialog.getByRole('radio', { name: kindLabel }).count()) await dialog.getByRole('radio', { name: kindLabel }).click()
    await dialog.getByRole('option', { name: new RegExp(docLabel) }).click()
    await dialog.getByRole('button', { name: /^(Relacionar|Cambiar)$/ }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
    await settle(page)
  }
  const relCount = async (sourceId) => (await s.q(`SELECT count(*)::int AS n FROM entity_relation WHERE source_id = $1 AND target_type = 'inventory_item'`, [sourceId])).rows[0].n
  await relateFromItem(items[0], 'Órdenes', 'OC-2485')
  await relateFromItem(items[1], 'Órdenes', 'OC-2485')
  check('order OC-2485 linked to two items, no invoice', await relCount(orderId) === 2 && !(await s.q(`SELECT 1 FROM entity_relation WHERE target_id = $1 AND relation_type = 'BILLED_FROM'`, [orderId])).rows.length, '', '4')
  const sectionText = await page.locator('[data-purchases-section]').innerText()
  check('item section: reference shown, no amounts, documentary note', /OC-2485/.test(sectionText) && !MONEY.test(sectionText) && /Control documental/.test(sectionText), '', '4')
  await page.screenshot({ path: join(SHOTS, 'inventory-item-1440-light.png'), fullPage: true })

  // ── 5. Invoice without order linked to an item ──
  await relateFromItem(items[2], 'Facturas', 'F-008721')
  check('invoice F-008721 linked to an item without an order', await relCount(invoiceId) === 1 && !(await s.q(`SELECT 1 FROM entity_relation WHERE source_id = $1 AND relation_type = 'BILLED_FROM'`, [invoiceId])).rows.length, '', '5')

  // ── 6. Relate order and invoice later (UI) ──
  await page.goto(`${s.root}/invoices/${invoiceId}`); await ready(page); await settle(page)
  await page.getByRole('button', { name: 'Relacionar orden' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /^Orden de compra/ }).click()
  await page.getByRole('option', { name: /OC-2485/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Relacionar' }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await settle(page)
  check('invoice related to the order afterwards (BILLED_FROM persisted, offered no more)', (await s.q(`SELECT 1 FROM entity_relation WHERE source_id = $1 AND target_id = $2 AND relation_type = 'BILLED_FROM'`, [invoiceId, orderId])).rows.length === 1
    && !(await page.getByRole('button', { name: 'Relacionar orden' }).count()), '', '6')
  check('related documents beside the detail show the order by its reference', /OC-2485/.test(await page.getByRole('region', { name: 'Documentos relacionados' }).innerText()), '', '6')

  // ── 7. Reference created from Inventarios without losing the form ──
  await page.goto(`${s.urls.web}/app/m/runly.inventory/inventory/new`); await page.waitForLoadState('networkidle'); await settle(page)
  const field = (label) => page.getByLabel(label, { exact: true })
  const unassociatedLabels = await page.locator('main label').evaluateAll(labels => labels.filter(label => !label.control && !label.querySelector('input,textarea,select,button')).map(label => label.textContent.trim()))
  check('inventory form labels are associated with controls', unassociatedLabels.length === 0, unassociatedLabels.join(' | '), 'accessibility')
  await field('Nombre').fill('Adaptador USB-C 7')
  await field('Número de serie').fill('SN-USB-7')
  await page.getByLabel('Orden de compra', { exact: true }).click()
  await page.getByRole('combobox').last().fill('OC-248')
  await page.getByText(/Registrar orden/).last().click()
  const quick = page.getByRole('dialog')
  await quick.getByRole('button', { name: 'Registrar y seleccionar' }).click()
  const similarShown = await quick.getByRole('list', { name: 'Referencias parecidas' }).waitFor({ timeout: 15000 }).then(() => true, () => false)
  check('quick create warns about a similar reference (no merge)', similarShown && /OC-2485/.test(await quick.innerText()), '', '7')
  await quick.getByLabel('Nombre, código o referencia').fill('OC-2490')
  await quick.getByRole('button', { name: /Registrar y seleccionar|Crear de todos modos/ }).click()
  await quick.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await settle(page)
  check('form kept its data after creating the reference', await field('Nombre').inputValue() === 'Adaptador USB-C 7' && await field('Número de serie').inputValue() === 'SN-USB-7', '', '7')
  await page.screenshot({ path: join(SHOTS, 'inventory-form-quick-1440.png'), fullPage: false })
  // Disponibilidad is the item form's only required field.
  await page.getByLabel('Disponibilidad').click()
  await page.getByRole('option').first().click()
  await page.getByRole('button', { name: 'Guardar activo' }).click()
  await page.waitForURL(/\/inventory\/[0-9a-f-]{36}$/, { timeout: 30000 }).catch(() => {})
  await settle(page); await page.screenshot({ path: join(SHOTS, 'inventory-form-saved.png'), fullPage: false })
  const newItem = (await s.q(`SELECT id FROM inv_item WHERE serial_number = 'SN-USB-7'`)).rows[0]
  const oc2490 = (await s.q(`SELECT document_id FROM purchase_documentary_reference WHERE reference = 'OC-2490'`)).rows[0]
  const link7 = (await s.q(`SELECT source_id, target_id, relation_type FROM entity_relation WHERE target_id = $1`, [newItem?.id ?? null])).rows
  check('item saved and linked to the new reference OC-2490 (one reference, no duplicate)', Boolean(newItem && oc2490) && link7.filter((r) => r.source_id === oc2490.document_id).length === 1
    && (await s.q(`SELECT count(*)::int AS n FROM purchase_documentary_reference WHERE reference = 'OC-2490'`)).rows[0].n === 1, `item=${Boolean(newItem)} ref=${Boolean(oc2490)} url=${page.url().split('/app/')[1]} links=${JSON.stringify(link7)}`, '7')
  // API: same key twice replays, never duplicates.
  const keyBody = { reference: 'OC-2491', idempotencyKey: 'retry-doc-0001' }
  const r1 = await api('POST', '/purchases/orders/references', keyBody), r2 = await api('POST', '/purchases/orders/references', keyBody)
  check('retry with the same key returns the same reference (replayed)', r1.body.data.id === r2.body.data.id && r2.body.data.replayed === true, '', '11')

  // ── 8. Attach a document later and correct its reference ──
  await page.goto(`${s.root}/orders/${orderId}`); await ready(page); await settle(page)
  await page.getByRole('tab', { name: /Archivos/ }).click(); await settle(page)
  const pdf = join(SHOTS, 'oc-2485.pdf'); await writeFile(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
  await page.locator('input[type="file"]').first().setInputFiles(pdf)
  await page.waitForTimeout(4000); await settle(page)
  const attached = await page.getByText('oc-2485.pdf').first().isVisible().catch(() => false)
  await page.getByRole('button', { name: 'Completar o corregir' }).first().click()
  const fix = page.getByRole('dialog')
  await fix.locator('#correction-reference').fill('OC-2485-A')
  await fix.locator('#correction-notes').fill('Original recibido por correo')
  await fix.getByRole('button', { name: 'Revisar cambios' }).click()
  await fix.locator('#correction-reason').fill('Se recibió el documento original')
  await fix.getByRole('button', { name: 'Guardar corrección' }).click()
  await fix.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  const revision = (await s.q('SELECT reason FROM purchase_document_revision WHERE document_id = $1', [orderId])).rows
  check('document attached afterwards and reference corrected with a revision', attached && await docRef(s, orderId) === 'OC-2485-A' && revision.length === 1 && revision[0].reason === 'Se recibió el documento original', `attached=${attached} rev=${revision.length}`, '8')
  await page.getByRole('tab', { name: /Historial/ }).click()
  check('Historial shows the correction', await page.getByText('Motivo: Se recibió el documento original').waitFor({ timeout: 20000 }).then(() => true, () => false), '', '8')

  // ── 9. No false amounts anywhere in documentary screens ──
  const screens = [['Inicio', s.root], ['órdenes', `${s.root}/orders`], ['facturas', `${s.root}/invoices`], ['orden', `${s.root}/orders/${orderId}`], ['factura', `${s.root}/invoices/${invoiceId}`], ['activo', `${s.urls.web}/app/m/runly.inventory/inventory/${items[0].id}`]]
  for (const [name, url] of screens) {
    await page.goto(url); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2500)
    const text = (await page.locator('main').innerText()).replace(/FAC-FIN-1[\s\S]{0,200}/g, '').replace(/OC-FIN-1[\s\S]{0,200}/g, '')
    check(`${name}: no amounts, $0.00, debts or payments for documentary records`, !/\$\s?0\.00/.test(text) && (name === 'Inicio' || name === 'órdenes' || name === 'facturas' ? !/Por pagar|Saldo/.test(text) : !MONEY.test(text)), text.match(/\$\s?0\.00|Por pagar|Saldo|\$\s?\d/)?.[0] ?? '', '9')
  }
  await page.goto(s.root); await page.getByText('Órdenes registradas').waitFor({ timeout: 60000 }); await settle(page)
  check('Inicio: registered orders, invoices, linked items, references to complete', /Órdenes registradas[\s\S]*Facturas registradas[\s\S]*Inventarios vinculados[\s\S]*Por completar/.test(await page.locator('main').innerText()) && !(await page.getByText('Compras de los últimos 12 meses').count()), '', '9')
  await page.screenshot({ path: join(SHOTS, 'inicio-1440-light.png'), fullPage: true })
  await page.goto(`${s.root}/orders`); await page.getByRole('radiogroup', { name: 'Vista' }).waitFor({ timeout: 60000 }); await settle(page)
  const listText = await page.locator('main').innerText()
  // 3 items: two linked directly plus the invoice's item, inherited once the invoice billed the order.
  check('orders list: reference, related invoice and items count, no "Por recibir"/"Por pagar" views', /OC-2485-A/.test(listText) && /1 factura/.test(listText) && /3 activos/.test(listText) && !/Por recibir|Por pagar/.test(await page.getByRole('radiogroup', { name: 'Vista' }).innerText()), '', '9')
  await page.screenshot({ path: join(SHOTS, 'orders-list-1440-light.png'), fullPage: true })

  // ── 10. Historic financial documents unchanged ──
  await page.goto(`${s.root}/invoices/${fi.id}`); await ready(page); await settle(page)
  const finText = await page.getByRole('region', { name: /^Resumen de factura/ }).innerText()
  const finAfter = (await s.q('SELECT total::text, paid_amount::text, status FROM purchase_invoice WHERE id = $1', [fi.id])).rows[0]
  check('financial invoice keeps total, paid, balance and its Pagos tab; DB unchanged', /Total[\s\S]*\$6,000\.00/.test(finText) && /Pagado[\s\S]*\$1,000\.00/.test(finText) && /Saldo pendiente/.test(finText)
    && await page.getByRole('tab', { name: /^Pagos/ }).isVisible() && JSON.stringify(finAfter) === JSON.stringify(finBefore), JSON.stringify(finAfter), '10')
  await context.close()

  // ── 11. Permissions, isolation, conflicts, errors ──
  ;({ context, page } = await s.open(reader, D))
  await page.goto(`${s.root}/orders/new`); await page.getByText('Sin permiso').waitFor({ timeout: 60000 }).then(() => check('reader: cannot open the editor', true, '', '11'), () => check('reader: cannot open the editor', false, '', '11'))
  await page.goto(`${s.root}/orders/${orderId}`); await ready(page); await settle(page)
  check('reader: no correct/relate/cancel actions', !(await page.getByRole('button', { name: /Completar o corregir|Relacionar factura|Cancelar/ }).count()), '', '11')
  await context.close()
  ;({ context, page } = await s.open(noFiles, D))
  await page.goto(`${s.root}/orders/${orderId}`); await ready(page); await settle(page)
  await page.getByRole('tab', { name: /Archivos/ }).click(); await settle(page)
  check('no files permission: neutral message, no red error', await page.getByText('Sin acceso a archivos').isVisible() && !(await page.getByText('No tienes permisos para ver archivos').count()), '', '11')
  await context.close()
  const O = await s.createCompany('Otra empresa'); const outsider = await s.createUser('otra@doc.example.test', pw, [[O, await s.createRole(O, 'compras', 'purchases.%')]])
  const outsiderApi = s.client(await s.login(outsider), O)
  check('other company: 404 for the reference', (await outsiderApi('GET', `/purchases/orders/${orderId}`)).status === 404, '', '11')
  // Two sessions correcting the same reference.
  const a = await s.open(buyer, D), b = await s.open(buyer, D)
  for (const p of [a.page, b.page]) { await p.goto(`${s.root}/invoices/${invoiceId}`); await ready(p); await settle(p); await p.getByRole('button', { name: 'Completar o corregir' }).first().click() }
  for (const [p, note] of [[a.page, 'Nota A'], [b.page, 'Nota B']]) {
    const d = p.getByRole('dialog'); await d.locator('#correction-notes').fill(note); await d.getByRole('button', { name: 'Revisar cambios' }).click(); await d.locator('#correction-reason').fill('Concurrencia')
  }
  await a.page.getByRole('dialog').getByRole('button', { name: 'Guardar corrección' }).click()
  await a.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await b.page.getByRole('dialog').getByRole('button', { name: 'Guardar corrección' }).click()
  const staleAlert = b.page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Otra persona cambió este documento' })
  check('conflict: stale session keeps its text and offers to reload', await staleAlert.waitFor({ timeout: 20000 }).then(() => true, () => false) && await b.page.getByRole('dialog').locator('#correction-reason').inputValue() === 'Concurrencia'
    && (await s.q('SELECT notes FROM purchase_invoice WHERE id = $1', [invoiceId])).rows[0].notes === 'Nota A', '', '11')
  await b.page.screenshot({ path: join(SHOTS, 'correction-conflict.png') })
  await a.context.close(); await b.context.close()

  // ── Visual matrix ──
  for (const dark of [false, true]) {
    for (const width of [390, 1440]) {
      const tag = `${dark ? 'dark' : 'light'}-${width}`
      ;({ context, page } = await s.open(buyer, D, { viewport: { width, height: width < 500 ? 844 : 950 }, dark }))
      for (const [name, url, wait] of [['inicio', s.root, 'Órdenes registradas'], ['orders', `${s.root}/orders`, null], ['order', `${s.root}/orders/${orderId}`, 'tab'], ['editor', `${s.root}/invoices/new`, 'Registrar factura']]) {
        await page.goto(url)
        if (wait === 'tab') await ready(page); else if (wait) await page.getByText(wait).first().waitFor({ timeout: 60000 }); else await page.getByRole('radiogroup', { name: 'Vista' }).waitFor({ timeout: 60000 })
        await settle(page)
        const raw = await page.evaluate(contrastScan)
        const failures = raw.failures
        check(`${tag} ${name}: no sideways scroll, contrast AA (${raw.scanned} runs)`, (await page.evaluate(overflowX)) <= 1 && !failures.length, failures.slice(0, 3).join(' | '), 'visual')
        await page.screenshot({ path: join(SHOTS, `${name}-${tag}.png`), fullPage: true })
      }
      await context.close()
    }
  }
  check('no page errors or 5xx', s.errors.length === 0, s.errors.slice(0, 5).join(' | '))
} catch (error) {
  check(`unexpected: ${error.message.split('\n')[0]}`, false)
} finally {
  await s.close()
}

// ── 12. Instance without the documentary migration ──
s = await bootPurchasesStack({ skipMigrations: ['20261216120000_purchase_documentary'] })
try {
  const F = await s.createCompany('Sin migración')
  const role = await s.createRole(F, 'compras', 'purchases.%')
  const user = await s.createUser('compras@nomig.example.test', pw, [[F, role]])
  const api = s.client(await s.login(user), F)
  const settings = (await api('GET', '/purchases/settings')).body.data
  const refused = await api('PUT', '/purchases/settings', { profile: 'DOCUMENTARY' })
  check('API without migration: documentaryAvailable false and the profile is refused (409 DOCUMENTARY_UNAVAILABLE)', settings.documentaryAvailable === false && refused.status === 409 && refused.body?.code === 'DOCUMENTARY_UNAVAILABLE', JSON.stringify(refused.body).slice(0, 120), '12')
  const { context, page } = await s.open(user, F)
  await page.goto(`${s.root}/settings`); await page.getByRole('heading', { name: 'Tratamiento económico' }).waitFor({ timeout: 60000 }); await settle(page)
  check('UI without migration: documentary option explained and disabled', await page.getByText(/No disponible en esta instancia/).isVisible() && await page.getByRole('button', { name: 'Usar Control documental' }).isDisabled(), '', '12')
  await page.screenshot({ path: join(SHOTS, 'settings-no-migration.png'), fullPage: true })
  const financial = await api('POST', '/purchases/orders', { number: 'OC-NOMIG-1', lines: [{ description: 'Silla', quantity: 1, unitAmount: 900 }] })
  check('financial mode keeps working without the migration', financial.status === 201 && Number(financial.body.data.total) > 0, '', '12')
  await context.close()
  check('no page errors or 5xx (no migration)', s.errors.length === 0, s.errors.slice(0, 5).join(' | '))
} catch (error) {
  check(`unexpected (no migration): ${error.message.split('\n')[0]}`, false)
} finally {
  await s.close()
  const failed = results.filter((ok) => !ok).length
  console.log('\nAcceptance:', Object.entries(accept).map(([k, v]) => `${k}:${v ? 'OK' : 'FAIL'}`).join(' '))
  console.log(`${results.length - failed}/${results.length} checks passed`)
  process.exitCode = failed ? 1 : 0
}
