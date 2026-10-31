// Real browser and API; new disposable Supabase only. Never port 4010.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { bootPurchasesStack } from './validation-stack.mjs'

const s = await bootPurchasesStack()
const shots = '.e2e/shots/asset-tags'
await mkdir(shots, { recursive: true })
const pass = name => console.log(`PASS ${name}`)
try {
  await s.assertDisposable()
  const company = await s.createCompany('Números de activo')
  const owner = await s.createUser('owner@asset.example.test', `Owner-${Date.now()}!`, [[company, await s.createRole(company, 'owner', '%')]])
  const api = s.client(await s.login(owner), company)
  assert.equal((await api('PUT', '/purchases/settings', { preset: 'INVENTORY' })).status, 200)
  const makeOrder = async (name, count = 2) => {
    const res = await api('POST', '/purchases/orders', { lines: [{ description: name, quantity: count, unitAmount: 125 }] })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal((await api('POST', `/purchases/orders/${res.body.data.id}/transition`, { action: 'issue' })).status, 200)
    return (await api('GET', `/purchases/orders/${res.body.data.id}`)).body.data
  }
  const { page, context } = await s.open(owner, company)
  const visit = async (p, kind, id) => {
    await p.goto(`${s.root}/${kind}/${id}`)
    await p.getByRole('tab', { name: /Historial/ }).waitFor({ timeout: 60000 })
  }
  const inventoryTab = async p => { await p.getByRole('tab', { name: /^Inventario/ }).click() }
  const newGoods = async doc => {
    await visit(page, 'orders', doc.id)
    await page.getByRole('button', { name: 'Crear activos', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Número de activo', { exact: true }).nth(1).waitFor()
    return dialog
  }
  const order = await makeOrder('Computadora')
  let dialog = await newGoods(order)
  await dialog.getByLabel('Número de activo', { exact: true }).nth(0).fill('PVR-TI-001')
  await dialog.getByLabel('Número de activo', { exact: true }).nth(1).fill('PVR-TI-002')
  let firstBody
  page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith(`/lines/${order.lines[0].id}/inventory`)) firstBody = req.postDataJSON() })
  await dialog.getByRole('button', { name: 'Crear 2 activos', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const rows = (await s.q('SELECT id,folio,asset_tag,serial_number FROM inv_item WHERE company_id=$1 ORDER BY asset_tag', [company])).rows
  assert.deepEqual(rows.map(r => r.asset_tag), ['PVR-TI-001', 'PVR-TI-002'])
  assert.notEqual(rows[0].folio, rows[1].folio)
  await inventoryTab(page)
  for (const row of rows) { await page.getByText(row.asset_tag, { exact: true }).waitFor(); assert.equal(await page.getByText(`Folio Runly: ${row.folio}`, { exact: true }).isVisible(), true) }
  pass('1 creation: two separate asset numbers and Runly folios in Compras')

  const blankOrder = await makeOrder('Mueble sin serie')
  dialog = await newGoods(blankOrder)
  await dialog.getByRole('button', { name: 'Crear 2 activos', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal((await s.q('SELECT count(*)::int AS n FROM inv_item WHERE company_id=$1 AND asset_tag IS NULL AND serial_number IS NULL', [company])).rows[0].n, 2)
  pass('2 creation without asset number or serial')

  const dupOrder = await makeOrder('Intento duplicado')
  dialog = await newGoods(dupOrder)
  await dialog.getByLabel('Número de activo', { exact: true }).nth(0).fill('NO-PARTIAL')
  await dialog.getByLabel('Número de activo', { exact: true }).nth(1).fill('PVR-TI-001')
  const failed = page.waitForResponse(res => res.url().endsWith(`/lines/${dupOrder.lines[0].id}/inventory`) && res.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Crear 2 activos', exact: true }).click()
  const conflict = await failed
  assert.equal(conflict.status(), 409); assert.equal((await conflict.json()).field, 'assetTag')
  assert.equal((await s.q("SELECT count(*)::int AS n FROM inv_item WHERE company_id=$1 AND asset_tag='NO-PARTIAL'", [company])).rows[0].n, 0)
  assert.equal((await s.q('SELECT count(*)::int AS n FROM purchase_allocation WHERE purchase_line_id=$1', [dupOrder.lines[0].id])).rows[0].n, 0)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  pass('3 duplicate identifies assetTag and rolls back the entire batch')

  const replay = await api('POST', `/purchases/lines/${order.lines[0].id}/inventory`, firstBody)
  assert.equal(replay.status, 201)
  assert.deepEqual(replay.body.data.map(i => i.id).sort(), rows.map(i => i.id).sort())
  assert.deepEqual(replay.body.data.map(i => i.assetTag).sort(), ['PVR-TI-001', 'PVR-TI-002'])
  const changedBody = structuredClone(firstBody); changedBody.items[0].assetTag = 'KEY-CHANGED'
  assert.equal((await api('POST', `/purchases/lines/${order.lines[0].id}/inventory`, changedBody)).body.code, 'IDEMPOTENCY_KEY_REUSED')
  pass('4 creation replay returns the same IDs and numbers; changed number conflicts')

  const financialInvoiceResponse = await api('POST', '/purchases/invoices', { orderIds: [order.id], inheritItems: true, lines: [{ description: 'Computadoras', quantity: 2, unitAmount: 125 }] })
  assert.equal(financialInvoiceResponse.status, 201)
  const financialInvoice = financialInvoiceResponse.body.data
  const received = await api('POST', '/purchases/receipts', { orderId: order.id, lines: [{ orderLineId: order.lines[0].id, quantity: 1 }] })
  assert.equal(received.status, 201, JSON.stringify(received.body))

  const publicLink = (await api('GET', `/inventory/items/${rows[0].id}/public-link`)).body.data.url
  const financialSnapshot = async () => (await s.q(`SELECT jsonb_build_object(
    'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM purchase_order o WHERE company_id=$1),
    'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM purchase_invoice i WHERE company_id=$1),
    'relations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM entity_relation r WHERE company_id=$1),
    'allocations',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM purchase_allocation a WHERE company_id=$1),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM purchase_receipt r WHERE company_id=$1)) AS value`, [company])).rows[0].value
  const before = await financialSnapshot()
  await visit(page, 'orders', order.id); await inventoryTab(page)
  await page.getByRole('row').filter({ hasText: 'PVR-TI-001' }).getByRole('button', { name: 'Editar número de activo de Computadora', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Número de activo', { exact: true }).fill('PVR-TI-003')
  await dialog.getByRole('button', { name: 'Guardar número de activo', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText('PVR-TI-003', { exact: true }).waitFor()
  assert.equal(await page.getByText('PVR-TI-001', { exact: true }).count(), 0)
  let item = (await api('GET', `/inventory/items/${rows[0].id}`)).body.data
  assert.equal(item.assetTag, 'PVR-TI-003'); assert.equal(item.folio, rows[0].folio)
  const freshOrder = (await api('GET', `/purchases/orders/${order.id}`)).body.data
  assert.equal(freshOrder.relations.find(r => r.other.id === item.id).other.assetTag, 'PVR-TI-003')
  await page.goto(`${s.urls.web}/app/m/runly.inventory/inventory/${item.id}`)
  await page.getByText('PVR-TI-003', { exact: true }).first().waitFor({ timeout: 60000 })
  pass('5-7 inline update changes the same InvItem and is visible in Inventarios; no purchase copy')

  await visit(page, 'invoices', financialInvoice.id); await inventoryTab(page)
  await page.getByRole('row').filter({ hasText: 'PVR-TI-003' }).getByRole('button', { name: 'Editar número de activo de Computadora', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Número de activo', { exact: true }).fill('PVR-TI-004')
  await dialog.getByRole('button', { name: 'Guardar número de activo', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText('PVR-TI-004', { exact: true }).waitFor()
  assert.equal((await api('GET', `/purchases/orders/${order.id}`)).body.data.relations.find(r => r.other.id === item.id).other.assetTag, 'PVR-TI-004')
  pass('financial invoice edits the same inventory master as its order')

  const second = await s.open(owner, company)
  for (const p of [page, second.page]) { await visit(p, 'orders', order.id); await inventoryTab(p); await p.getByRole('row').filter({ hasText: 'PVR-TI-004' }).getByRole('button', { name: 'Editar número de activo de Computadora', exact: true }).click() }
  await page.getByRole('dialog').getByLabel('Número de activo', { exact: true }).fill('SESSION-A')
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar número de activo', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const otherDialog = second.page.getByRole('dialog')
  await otherDialog.getByLabel('Número de activo', { exact: true }).fill('SESSION-B')
  await otherDialog.getByRole('button', { name: 'Guardar número de activo', exact: true }).click()
  await otherDialog.getByRole('button', { name: 'Recargar datos', exact: true }).waitFor()
  assert.equal(await otherDialog.getByLabel('Número de activo', { exact: true }).inputValue(), 'SESSION-B')
  assert.equal((await api('GET', `/inventory/items/${item.id}`)).body.data.assetTag, 'SESSION-A')
  await second.context.close()
  pass('concurrency: second session cannot silently overwrite; typed value is retained')

  const readPermissions = ['purchases.access', 'purchases.read', 'purchases.order.read', 'purchases.invoice.read', 'purchases.relation.read', 'inventory.item.read']
  const reader = await s.createUser('reader@asset.example.test', `Read-${Date.now()}!`, [[company, await s.createRole(company, 'reader', readPermissions)]])
  const readApi = s.client(await s.login(reader), company)
  const readPage = await s.open(reader, company)
  await visit(readPage.page, 'orders', order.id); await inventoryTab(readPage.page)
  await readPage.page.getByText('SESSION-A', { exact: true }).waitFor()
  assert.equal(await readPage.page.getByRole('button', { name: /^Editar número de activo de/ }).count(), 0)
  assert.equal((await readApi('PUT', `/inventory/items/${item.id}`, { assetTag: 'DENIED' })).status, 403)
  await readPage.context.close()
  assert.deepEqual(await financialSnapshot(), before)
  pass('8-9 read-only user cannot modify; documents, relations, costs and receipts unchanged')

  assert.equal((await api('GET', `/inventory/items/${item.id}/public-link`)).body.data.url, publicLink)
  const label = await fetch(`${s.urls.api}/inventory/labels/render`, { method: 'POST', headers: { Authorization: `Bearer ${await s.login(owner)}`, 'X-Runly-Company-Id': company, 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'zpl', items: [{ itemId: item.id, quantity: 1 }], layout: { fields: ['folio', 'assetTag'] } }) })
  assert.equal(label.status, 200)
  const zpl = await label.text(); assert.equal(zpl.includes('SESSION-A'), true); assert.equal(zpl.includes(publicLink), true)
  pass('10 QR link unchanged; reprinted label uses the current asset number')

  await api('PUT', '/purchases/settings', { profile: 'DOCUMENTARY' })
  const docItem = (await api('POST', '/inventory/items', { name: 'Gabinete documental', assetTag: 'DOC-TAG-01' })).body.data
  const docOrder = (await api('POST', '/purchases/orders', { reference: 'OC documental' })).body.data
  const docInvoice = (await api('POST', '/purchases/invoices', { reference: 'Factura documental' })).body.data
  for (const [sourceType, sourceId] of [['purchase_order', docOrder.id], ['purchase_invoice', docInvoice.id]]) assert.equal((await api('POST', '/purchases/relations', { sourceType, sourceId, targetType: 'inventory_item', targetId: docItem.id })).status, 201)
  await visit(page, 'orders', docOrder.id); await inventoryTab(page)
  await page.getByRole('button', { name: 'Editar número de activo de Gabinete documental', exact: true }).click()
  dialog = page.getByRole('dialog'); await dialog.getByLabel('Número de activo', { exact: true }).fill('DOC-TAG-02')
  await dialog.getByRole('button', { name: 'Guardar número de activo', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
  await visit(page, 'invoices', docInvoice.id); await inventoryTab(page)
  await page.getByText('DOC-TAG-02', { exact: true }).waitFor()
  assert.equal(/$s?d/.test(await page.locator('main').innerText()), false)
  assert.equal(await page.getByRole('button', { name: 'Crear activos', exact: true }).count(), 0)
  assert.equal((await api('GET', `/purchases/invoices/${docInvoice.id}`)).body.data.total, null)
  assert.equal((await s.q('SELECT count(*)::int AS n FROM purchase_allocation WHERE target_id=$1', [docItem.id])).rows[0].n, 0)
  await page.screenshot({ path: `${shots}/documentary-invoice.png`, fullPage: true })
  pass('10 documentary order/invoice share the same asset number without introducing financial capture')

  // Effective access: a viewer of the item's area has no update capability,
  // even with inventory.item.update in their global role.
  const viewer = await s.createUser('viewer@asset.example.test', `View-${Date.now()}!`, [[company, await s.createRole(company, 'viewer', [...readPermissions, 'inventory.item.update'])]])
  const area = (await api('POST', '/inventory/areas', { name: 'Área visible' })).body.data
  await api('PUT', `/inventory/areas/${area.id}/members/${viewer.id}`, { role: 'viewer' })
  await api('PUT', `/inventory/items/${docItem.id}`, { areaId: area.id })
  await s.q("INSERT INTO instance_config(key,value,updated_at) VALUES ($1,'true',now()),($2,'false',now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [`inventory.areas.enabled:${company}`, `inventory.areas.includeOwn:${company}`])
  const viewApi = s.client(await s.login(viewer), company)
  assert.equal((await viewApi('GET', `/inventory/items/${docItem.id}`)).body.data.canUpdate, false)
  assert.equal((await viewApi('PUT', `/inventory/items/${docItem.id}`, { assetTag: 'AREA-DENIED' })).status, 404)
  const vp = await s.open(viewer, company)
  await visit(vp.page, 'orders', docOrder.id); await inventoryTab(vp.page)
  await vp.page.getByText('DOC-TAG-02', { exact: true }).waitFor()
  assert.equal(await vp.page.getByRole('button', { name: /^Editar número de activo de/ }).count(), 0)
  await vp.context.close()
  pass('8 effective area access also prevents editing; value remains read-only')
  await context.close()
  assert.deepEqual(s.errors, [])
  console.log('All asset-number acceptance cases passed')
} finally { await s.close() }
