// Only a dedicated disposable database named runly_documentary_test is allowed.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createPurchasesRouter, createPurchasesServices } from '../../routes/purchases/index.js'
import { createInventoryService } from '../inventory-service.js'
import { createInventoryExportService } from '../inventory-export-service.js'
import { createPurchasesMiraiQueries } from '../../routes/purchases/purchases-mirai-queries.js'
import { resetVersionsProbe } from '../purchases-shared.js'
import { createPurchasesOrderDocumentKind } from '../../routes/documents/kinds/purchases-order-kind.js'
import { createChatExtraEntityTypes } from '../../routes/chat/chat-entity-extra-types.js'
import { purchaseInvoicesProvider } from '../search/purchases-providers.js'
import { loadPurchaseNumbersForItems } from '../inventory-purchase-links.js'

const url = process.env.PURCHASES_DOCUMENTARY_TEST_DATABASE_URL
if (url) {
  const target = new URL(url)
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/runly_documentary_test') throw new Error('Disposable local runly_documentary_test database required')
}
const ROOT = new URL('../../../../..', import.meta.url)
const read = file => readFileSync(new URL(file, ROOT), 'utf8')
const A = '01a00000-0000-7000-8000-00000000001a'
const B = '01a00000-0000-7000-8000-00000000001b'
const ACTOR = '01a00000-0000-7000-8000-0000000001a1'
const ALL = ['purchases.access', 'purchases.read', 'purchases.settings.read', 'purchases.settings.manage', 'purchases.order.read', 'purchases.order.create', 'purchases.order.update', 'purchases.order.correct',
  'purchases.invoice.read', 'purchases.invoice.create', 'purchases.invoice.update', 'purchases.invoice.correct', 'purchases.relation.read', 'purchases.relation.manage',
  'inventory.item.read', 'purchases.payment.manage', 'purchases.payment.reverse', 'purchases.receipt.create', 'purchases.receipt.read', 'purchases.receipt.reverse', 'purchases.approval.decide']

describe('documentary acceptance on disposable PostgreSQL', { skip: !url }, () => {
  let pool, prisma, services, order, invoice, item1, item2, item3, foreignItem, supplier, financial, fingerprint, authUserId, rollbackVerified = false
  const apps = new Map()
  const q = (sql, params) => pool.query(sql, params)
  const call = async (method, path, payload, { company = A, permissions = ALL } = {}) => {
    const key = `${company}:${permissions.join(',')}`
    if (!apps.has(key)) {
      const requirePermission = needed => async (c, next) => {
        c.set('companyId', company); c.set('userId', ACTOR)
        c.set('userContext', { profile: { id: ACTOR }, isAdmin: false, permissionSet: new Set(permissions) })
        if (!permissions.includes(needed)) return c.json({ code: 'FORBIDDEN' }, 403)
        await next()
      }
      const app = new Hono()
      app.route('/', createPurchasesRouter({ prisma, requirePermission }))
      apps.set(key, app)
    }
    const res = await apps.get(key).request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    return { status: res.status, body: await res.json() }
  }
  const get = async (kind, id) => {
    const r = await call('GET', `/purchases/${kind}/${id}`)
    assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.data
  }
  const create = async (kind, input) => {
    const r = await call('POST', `/purchases/${kind}`, input)
    assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data
  }
  const settings = async input => {
    const r = await call('PUT', '/purchases/settings', input)
    assert.equal(r.status, 200, JSON.stringify(r.body)); apps.clear(); return r.body.data
  }
  const relation = async input => {
    const r = await call('POST', '/purchases/relations', input)
    assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data
  }
  before(async () => {
    pool = new pg.Pool({ connectionString: url, max: 12 })
    await q('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public')
    const require = createRequire(import.meta.url)
    const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8e6 })
    await q(ddl)
    await q('DROP TABLE purchase_documentary_reference')
    // Simulate the old schema, then deploy the new client before migration.
    await q(`ALTER TABLE purchase_order ALTER COLUMN total SET NOT NULL, ALTER COLUMN subtotal SET NOT NULL, ALTER COLUMN tax SET NOT NULL, ALTER COLUMN issue_date SET NOT NULL;
      ALTER TABLE purchase_invoice ALTER COLUMN total SET NOT NULL, ALTER COLUMN subtotal SET NOT NULL, ALTER COLUMN tax SET NOT NULL, ALTER COLUMN issue_date SET NOT NULL, ALTER COLUMN paid_amount SET NOT NULL;`)
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
    resetVersionsProbe()
    await q(`INSERT INTO user_profile (id, auth_user_id, display_name, email, updated_at) VALUES ($1, gen_random_uuid(), 'Operadora', 'operator@documentary.example.test', now())`, [ACTOR])
    authUserId = (await q('SELECT auth_user_id AS id FROM user_profile WHERE id=$1', [ACTOR])).rows[0].id
    for (const co of [A, B]) await q(`INSERT INTO company (id, name, slug, updated_at) VALUES ($1, $2, $3, now())`, [co, `Documental ${co.slice(-1)}`, `documentary-${co.slice(-1)}`])
    services = createPurchasesServices({ prisma })
    financial = await create('invoices', { number: 'FIN-ZERO', issueDate: '2026-10-01', total: 0 })
    const s = await call('GET', '/purchases/settings')
    assert.equal(s.body.data.economicMode, 'FINANCIAL')
    assert.equal(s.body.data.documentaryAvailable, false)
    assert.equal((await call('PUT', '/purchases/settings', { economicMode: 'DOCUMENTARY' })).body.code, 'DOCUMENTARY_UNAVAILABLE')
    fingerprint = (await q('SELECT row_to_json(i)::text AS value FROM purchase_invoice i WHERE id = $1', [financial.id])).rows[0].value
    await q(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated`)
    await q(read('prisma/migrations/20261216120000_purchase_documentary/migration.sql'))
    await q(read('scripts/purchases/documentary-rollback.sql'))
    assert.equal((await q("SELECT to_regclass('purchase_documentary_reference') AS name")).rows[0].name, null)
    rollbackVerified = true
    await q(read('prisma/migrations/20261216120000_purchase_documentary/migration.sql'))
    apps.clear()
    services = createPurchasesServices({ prisma })
    await settings({ profile: 'DOCUMENTARY' })
    const inv = createInventoryService({ prisma })
    item1 = await inv.createItem({ name: 'Activo uno', assetTag: 'DOC-1', purchasePrice: 1500, vendorName: 'Proveedor legado' }, A, authUserId)
    item2 = await inv.createItem({ name: 'Activo dos', assetTag: 'DOC-2' }, A, authUserId)
    item3 = await inv.createItem({ name: 'Activo tres', assetTag: 'DOC-3' }, A, authUserId)
    foreignItem = await inv.createItem({ name: 'Otra empresa', assetTag: 'DOC-B' }, B, authUserId)
    supplier = await prisma.contact.create({ data: { companyId: A, name: 'Proveedor conocido', type: 'COMPANY' } })
  })
  after(async () => { await prisma?.$disconnect(); await pool?.end() })

  it('01 creates an order with reference only', async () => {
    order = await create('orders', { reference: 'OC adaptadores ITISA' })
    assert.equal(order.reference, 'OC adaptadores ITISA'); assert.equal(order.status, 'REGISTERED')
    assert.notEqual(order.number, order.reference)
  })
  it('02 creates an independent invoice with reference only', async () => {
    invoice = await create('invoices', { reference: 'Factura F-008721' })
    assert.equal(invoice.reference, 'Factura F-008721'); assert.equal(invoice.economicMode, 'DOCUMENTARY')
  })
  it('03 supplier, issuance, lines, money and files are optional', async () => {
    for (const [kind, id] of [['orders', order.id], ['invoices', invoice.id]]) {
      const doc = await get(kind, id)
      assert.equal(doc.supplierId, null); assert.equal(doc.issueDate, null); assert.deepEqual(doc.lines, [])
      assert.deepEqual(doc.policyCheck.reasons, []); assert.equal(doc.policyCheck.blocked, false)
      assert.equal(doc.allowedActions.includes('pay'), false)
    }
  })
  it('04 unknown amounts and dates are null, real financial zero remains zero', async () => {
    for (const [kind, id] of [['orders', order.id], ['invoices', invoice.id]]) {
      const doc = await get(kind, id)
      for (const key of ['subtotal', 'tax', 'total', 'paidAmount', 'balance', 'issueDate']) assert.equal(doc[key], null, key)
      assert.equal(doc.createdAt != null, true)
    }
    assert.equal((await get('invoices', financial.id)).total, 0)
  })
  it('05 links inventory directly to an order without an invoice', async () => {
    await relation({ sourceType: 'purchase_order', sourceId: order.id, targetType: 'inventory_item', targetId: item1.id })
    assert.equal((await get('orders', order.id)).relations.some(r => r.other.id === item1.id), true)
  })
  it('06 links inventory to an invoice without an order', async () => {
    await relation({ sourceType: 'purchase_invoice', sourceId: invoice.id, targetType: 'inventory_item', targetId: item2.id })
    assert.equal((await get('invoices', invoice.id)).orders.length, 0)
  })
  it('07 several inventories share an order', async () => {
    const r = await call('POST', '/purchases/relations/bulk', { sourceType: 'purchase_order', sourceId: order.id, targetIds: [item1.id, item3.id] })
    assert.equal(r.status, 201); assert.equal(r.body.data.created, 1)
  })
  it('08 later invoice/order relation propagates existing assets; one order per invoice', async () => {
    await relation({ sourceType: 'purchase_invoice', sourceId: invoice.id, targetType: 'purchase_order', targetId: order.id })
    assert.equal((await get('invoices', invoice.id)).orders[0].id, order.id)
    const another = await create('orders', { reference: 'OC posterior' })
    assert.equal((await call('POST', '/purchases/relations', { sourceType: 'purchase_invoice', sourceId: invoice.id, targetType: 'purchase_order', targetId: another.id })).body.code, 'INVOICE_HAS_ORDER')
    assert.equal(await prisma.entityRelation.count({ where: { companyId: A, sourceId: order.id, targetId: item2.id, relationType: 'PURCHASED_IN' } }), 1)
  })
  it('09 cancelled document relations are history and do not occupy the live slot', async () => {
    const old = await create('orders', { reference: 'OC cancelada', inventoryIds: [item3.id] }).catch(() => null)
    assert.equal(old, null, 'occupied live slot rejected')
    const current = await get('orders', order.id)
    const r = await call('POST', `/purchases/orders/${order.id}/transition`, { action: 'cancel', comment: 'Cancelación documental', expectedVersion: current.version })
    assert.equal(r.status, 200)
    const replacement = await create('orders', { reference: 'OC reemplazo', inventoryIds: [item1.id, item3.id] })
    assert.equal(await prisma.entityRelation.count({ where: { sourceId: order.id, targetId: item1.id } }), 1)
    assert.equal(await prisma.entityRelation.count({ where: { sourceId: replacement.id, targetId: item1.id } }), 1)
  })
  it('10 concurrent quick-create retries yield one document and atomic relations', async () => {
    const input = { reference: 'Reintento', idempotencyKey: 'quick-10' }
    const rs = await Promise.all([call('POST', '/purchases/orders/references', input), call('POST', '/purchases/orders/references', input)])
    assert.deepEqual(rs.map(r => r.status), [201, 201]); assert.equal(rs[0].body.data.id, rs[1].body.data.id)
    assert.equal((await call('POST', '/purchases/orders/references', { ...input, reference: 'Otro' })).body.code, 'IDEMPOTENCY_KEY_REUSED')
    const duplicate = await create('invoices', { reference: invoice.reference })
    assert.notEqual(duplicate.id, invoice.id)
  })
  it('11 completes supplier and issuance later without inventing economics', async () => {
    const current = await get('invoices', invoice.id)
    const r = await call('POST', `/purchases/invoices/${invoice.id}/corrections`, { reason: 'Información recibida', expectedVersion: current.version, changes: { supplierId: supplier.id, issueDate: '2026-10-12' } })
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.data.document.total, null)
    assert.equal((await get('invoices', invoice.id)).issueDate, '2026-10-12')
  })
  it('12 corrects external reference with immutable audited revision', async () => {
    const current = await get('invoices', invoice.id)
    const r = await call('POST', `/purchases/invoices/${invoice.id}/corrections`, { reason: 'Referencia corregida', expectedVersion: current.version, changes: { reference: 'FAC corregida' } })
    assert.equal(r.status, 201); assert.equal(r.body.data.document.reference, 'FAC corregida')
    const revisions = (await call('GET', `/purchases/invoices/${invoice.id}/revisions`)).body.data.revisions
    assert.equal(revisions[0].changes.reference.before, 'Factura F-008721')
    assert.equal(revisions[0].actorId, ACTOR)
    assert.equal(await prisma.auditLog.count({ where: { entityId: invoice.id, action: 'purchase.invoice.corrected' } }), 2)
  })
  it('13 two corrections with the same version produce one conflict', async () => {
    const current = await get('invoices', invoice.id)
    const rs = await Promise.all(['A', 'B'].map(notes => call('POST', `/purchases/invoices/${invoice.id}/corrections`, { reason: 'Dos sesiones', expectedVersion: current.version, changes: { notes } })))
    assert.deepEqual(rs.map(r => r.status).sort(), [201, 409]); assert.equal(rs.find(r => r.status === 409).body.code, 'STALE_DOCUMENT')
  })
  it('14 enforces read, create, correction and relation permissions', async () => {
    for (const [method, path, input] of [['GET', `/purchases/invoices/${invoice.id}`], ['POST', '/purchases/orders', { reference: 'x' }], ['POST', `/purchases/invoices/${invoice.id}/corrections`, { changes: { notes: 'x' }, reason: 'x' }], ['POST', '/purchases/relations', {}]]) {
      assert.equal((await call(method, path, input, { permissions: [] })).status, 403)
    }
    assert.equal((await call('POST', '/purchases/orders', { reference: 'No permiso relación', inventoryIds: [item1.id] }, { permissions: ['purchases.order.create'] })).status, 403)
  })
  it('15 rejects economics, fiscal payment dates and mode overrides from API clients', async () => {
    for (const field of ['subtotal', 'tax', 'total', 'paidAmount', 'unitAmount', 'taxRate', 'economicMode', 'dueDate', 'paymentTerms']) {
      const r = await call('POST', '/purchases/invoices', { reference: 'Intento', [field]: 123 })
      assert.equal(r.status, 422, field); assert.equal(r.body.code, 'DOCUMENTARY_FIELD_NOT_ALLOWED')
    }
    assert.equal((await call('POST', '/purchases/invoices', { reference: 'x', lines: [{ unitAmount: 1 }] })).status, 422)
  })
  it('16 payments and financial transitions remain blocked after switching back', async () => {
    await settings({ economicMode: 'FINANCIAL', preset: 'COMPLETE' })
    for (const action of ['pay', 'submit', 'approve']) assert.equal((await call('POST', `/purchases/invoices/${invoice.id}/transition`, { action, amount: 10 })).body.code, 'DOCUMENTARY_OPERATION_BLOCKED')
    assert.equal((await call('POST', `/purchases/invoices/${invoice.id}/payments`, { amount: 10 })).body.code, 'DOCUMENTARY_OPERATION_BLOCKED')
    const payments = (await call('GET', `/purchases/invoices/${invoice.id}/payments`)).body.data
    assert.equal(payments.summary.balance, null); assert.equal(payments.summary.capabilityEnabled, false)
    assert.equal(await prisma.purchasePayment.count({ where: { invoiceId: invoice.id } }), 0)
    await settings({ profile: 'DOCUMENTARY' })
  })
  it('17 rejects foreign documents, suppliers and inventories without partial writes', async () => {
    const foreign = await prisma.purchaseOrder.create({ data: { companyId: B, caseId: order.caseId, number: 'FOREIGN', sequence: 1, issueDate: new Date() } })
    assert.equal((await call('POST', '/purchases/invoices', { reference: 'cross', orderIds: [foreign.id] })).status, 404)
    const before = await prisma.purchaseOrder.count({ where: { companyId: A } })
    assert.equal((await call('POST', '/purchases/orders/references', { reference: 'cross', idempotencyKey: 'cross-17', inventoryIds: [foreignItem.id] })).status, 404)
    assert.equal(await prisma.purchaseOrder.count({ where: { companyId: A } }), before)
    assert.equal((await call('GET', `/purchases/invoices/${invoice.id}`, null, { company: B })).status, 404)
  })
  it('18 listing, search, bundle, exports, suppliers, MirAI and events preserve null economics', async () => {
    const listed = (await call('GET', '/purchases/invoices?search=FAC%20corregida')).body.data
    assert.equal(listed.length, 1); assert.equal(listed[0].total, null); assert.equal(listed[0].balance, null)
    const searched = (await call('GET', '/purchases/documents/search?type=invoice&search=FAC%20corregida')).body.data
    assert.equal(searched[0].total, null); assert.equal(searched[0].reference, 'FAC corregida')
    const bundle = await services.caseBundle.loadBundle(A, invoice.caseId)
    assert.equal(bundle.invoices.find(i => i.id === invoice.id).economicMode, 'DOCUMENTARY')
    const recent = (await services.suppliers.get(A, supplier.id)).recent.find(d => d.id === invoice.id)
    assert.equal(recent.total, null)
    const summary = createPurchasesMiraiQueries({ prisma, ...services }).find(tool => tool.name === 'purchases_spend_summary')
    const spend = await summary.run({ kind: 'invoices', from: '2026-01-01', to: '2026-12-31' }, { companyId: A })
    assert.deepEqual(spend.actual.grupos, [])
    const exported = await createPurchasesOrderDocumentKind({ prisma }).load({ companyId: A, sourceId: order.id })
    assert.equal(exported.total, null); assert.equal(exported.issueDate, null)
    const event = await prisma.domainEventOutbox.findFirst({ where: { companyId: A, event: 'purchases.invoice.corrected' }, orderBy: { createdAt: 'desc' } })
    assert.equal(event.payload.total, null)
    assert.equal(event.payload.currency, null)
  })
  it('19 financial SIMPLE, BASIC, INVENTORY, COMPLETE and CUSTOM keep financial documents', async () => {
    for (const preset of ['SIMPLE', 'BASIC', 'INVENTORY', 'COMPLETE', 'CUSTOM']) {
      await settings({ economicMode: 'FINANCIAL', preset })
      const doc = await create('invoices', { number: `FIN-${preset}`, total: 100, issueDate: '2026-10-01' })
      assert.equal(doc.total, 100); assert.equal(doc.economicMode, 'FINANCIAL')
      assert.equal((await call('POST', `/purchases/invoices/${doc.id}/transition`, { action: 'submit' })).status, 200)
    }
  })
  it('20 financial payment, reversal, receipt, correction and approval continue to work', async () => {
    await settings({ preset: 'CUSTOM', policies: [], stages: [{ type: 'PAYMENT', mode: 'OPTIONAL' }, { type: 'CLOSE', mode: 'REQUIRED' }] })
    const f = await create('invoices', { number: 'FIN-PAY-20', total: 250 })
    await call('POST', `/purchases/invoices/${f.id}/transition`, { action: 'submit' })
    const paid = await call('POST', `/purchases/invoices/${f.id}/payments`, { amount: 100, idempotencyKey: 'financial-20' })
    assert.equal(paid.status, 201, JSON.stringify(paid.body))
    assert.equal((await get('invoices', f.id)).paidAmount, 100)
    const reversal = await call('POST', `/purchases/payments/${paid.body.data.payment.id}/reverse`, { reason: 'Pago capturado por error', idempotencyKey: 'financial-reverse-20' })
    assert.equal(reversal.status, 201, JSON.stringify(reversal.body))
    assert.equal((await get('invoices', f.id)).paidAmount, 0)
    const o = await create('orders', { lines: [{ description: 'Bien financiero', quantity: 2, unitAmount: 125 }] })
    assert.equal((await call('POST', `/purchases/orders/${o.id}/transition`, { action: 'issue' })).status, 200)
    const line = (await get('orders', o.id)).lines[0]
    const received = await call('POST', '/purchases/receipts', { orderId: o.id, lines: [{ orderLineId: line.id, quantity: 1 }] })
    assert.equal(received.status, 201, JSON.stringify(received.body))
    const corrected = await call('POST', `/purchases/orders/${o.id}/corrections`, { reason: 'Nota administrativa', changes: { notes: 'Entrega parcial' } })
    assert.equal(corrected.status, 201)
    const receiptReversed = await call('POST', `/purchases/receipts/${received.body.data.id}/reverse`, { reason: 'Recepción equivocada', idempotencyKey: 'receipt-reverse-20' })
    assert.equal(receiptReversed.status, 201, JSON.stringify(receiptReversed.body))
    await settings({ preset: 'CUSTOM', stages: [{ type: 'APPROVAL', mode: 'CONDITIONAL' }, { type: 'PURCHASE_ORDER', mode: 'OPTIONAL' }], policies: [{ when: { metric: 'total', op: 'gt', value: 10 }, require: { stage: 'APPROVAL' } }] })
    const approvalOrder = await create('orders', { total: 100 })
    assert.equal((await call('POST', `/purchases/orders/${approvalOrder.id}/transition`, { action: 'submit' })).body.data.status, 'PENDING_APPROVAL')
    assert.equal((await call('POST', `/purchases/orders/${approvalOrder.id}/transition`, { action: 'approve' })).body.data.status, 'APPROVED')
  })
  it('21 historical records remain byte-for-byte unchanged by migration and company mode', async () => {
    assert.equal((await q('SELECT row_to_json(i)::text AS value FROM purchase_invoice i WHERE id = $1', [financial.id])).rows[0].value, fingerprint)
    assert.equal((await get('invoices', financial.id)).economicMode, 'FINANCIAL')
  })
  it('22 migrated and unmigrated databases support financial reads; documentary readiness is explicit', async () => {
    // The before hook exercised the old schema before applying the migration.
    const data = (await call('GET', '/purchases/settings')).body.data
    assert.equal(data.documentaryAvailable, true)
    assert.equal(rollbackVerified, true)
    const [acl] = (await q("SELECT relrowsecurity FROM pg_class WHERE oid = 'purchase_documentary_reference'::regclass")).rows
    assert.equal(acl.relrowsecurity, true)
  })
  it('23 company mode changes never reinterpret documents; conversion is blocked in SQL', async () => {
    await settings({ profile: 'DOCUMENTARY' })
    assert.equal((await get('invoices', financial.id)).total, 0)
    await settings({ economicMode: 'FINANCIAL', preset: 'BASIC' })
    assert.equal((await get('invoices', invoice.id)).total, null)
    await assert.rejects(q('UPDATE purchase_invoice SET total=0, subtotal=0, tax=0, paid_amount=0 WHERE id=$1', [invoice.id]), /immutable/)
    assert.equal(await prisma.auditLog.count({ where: { companyId: A, action: 'purchase.workflow.updated' } }) > 5, true)
    await settings({ profile: 'DOCUMENTARY' })
  })
  it('24 inventory operational reads/export suppress legacy economics without deleting them', async () => {
    const field = await prisma.invCustomField.create({ data: { companyId: A, fieldKey: 'legacy_amount', label: 'Importe SINABE', fieldType: 'number' } })
    await prisma.invCustomFieldValue.create({ data: { itemId: item1.id, fieldId: field.id, value: '98765' } })
    const technical = await prisma.invCustomField.create({ data: { companyId: A, fieldKey: 'capacidad', label: 'Capacidad', fieldType: 'number' } })
    await prisma.invCustomFieldValue.create({ data: { itemId: item1.id, fieldId: technical.id, value: '42' } })
    const inv = createInventoryService({ prisma })
    const doc = await inv.getItem(item1.id, A)
    assert.equal(doc.purchasePrice, null); assert.equal(doc.customValues.find(cv => cv.fieldId === field.id).value, null)
    assert.equal(doc.customValues.find(cv => cv.fieldId === technical.id).value, '42')
    assert.equal(doc.purchaseEconomicContext.historicalDataPreserved, true)
    assert.equal((await inv.listItems({ companyId: A })).data.find(i => i.id === item1.id).purchasePrice, null)
    const exporter = createInventoryExportService({ prisma })
    assert.equal((await exporter.columnCatalog(A)).columns.some(c => c.key === 'purchasePrice'), false)
    const columns = (await exporter.columnCatalog(A)).columns
    assert.equal(JSON.stringify(columns).includes('Capacidad'), true)
    assert.equal(JSON.stringify(columns).includes('Importe SINABE'), false)
    await assert.rejects(exporter.exportItems(A, { columns: ['name', 'purchasePrice'], ids: [item1.id] }), /económicas/)
    const file = await exporter.exportItems(A, { format: 'csv', columns: ['name', 'assetTag'], ids: [item1.id] })
    let content = ''; for await (const chunk of file.stream) content += chunk
    assert.equal(content.includes('98765'), false); assert.equal(content.includes('Activo uno'), true)
    assert.equal(Number((await prisma.invItem.findFirst({ where: { id: item1.id } })).purchasePrice), 1500)
    assert.equal((await prisma.invCustomFieldValue.findFirst({ where: { fieldId: field.id } })).value, '98765')
    await settings({ economicMode: 'FINANCIAL', preset: 'BASIC' })
    assert.equal(Number((await inv.getItem(item1.id, A)).purchasePrice), 1500)
  })

  it('25 quick-create with assets is atomic and retries with assets do not conflict with themselves', async () => {
    await settings({ profile: 'DOCUMENTARY' })
    const item = await createInventoryService({ prisma }).createItem({ name: 'Reintento con inventario' }, A, authUserId)
    const input = { reference: 'OC rápida', inventoryIds: [item.id], idempotencyKey: 'quick-items-25' }
    const responses = await Promise.all([call('POST', '/purchases/orders/references', input), call('POST', '/purchases/orders/references', input)])
    assert.deepEqual(responses.map(r => r.status), [201, 201])
    assert.equal(responses[0].body.data.id, responses[1].body.data.id)
    assert.equal(await prisma.entityRelation.count({ where: { companyId: A, sourceId: responses[0].body.data.id, targetId: item.id, relationType: 'PURCHASED_IN' } }), 1)
    const numbers = await loadPurchaseNumbersForItems(prisma, A, [item.id])
    assert.equal(numbers.get(item.id).purchaseOrderReference, 'OC rápida')
    assert.equal(numbers.get(item.id).purchaseOrderNumber, responses[0].body.data.number)
    const count = await prisma.purchaseOrder.count({ where: { companyId: A } })
    const failed = await call('POST', '/purchases/orders/references', { reference: 'Conflicto', inventoryIds: [item.id], idempotencyKey: 'rollback-25' })
    assert.equal(failed.body.code, 'ITEM_LINK_EXISTS')
    assert.equal(await prisma.purchaseOrder.count({ where: { companyId: A } }), count)
    assert.equal((await q('SELECT count(*)::int AS n FROM purchase_documentary_reference WHERE idempotency_key=$1', ['rollback-25'])).rows[0].n, 0)
  })
  it('26 optional documentary lines preserve unknown quantity and all economic fields', async () => {
    const doc = await create('orders', { reference: 'Con conceptos', description: 'Descripción disponible', lines: [{ description: 'Equipo sin cantidad' }] })
    const detail = await get('orders', doc.id)
    assert.equal(detail.description, 'Descripción disponible')
    for (const field of ['quantity', 'unitAmount', 'taxRate', 'taxAmount', 'total', 'pendingQuantity']) assert.equal(detail.lines[0][field], null)
    const corrected = await call('POST', `/purchases/orders/${doc.id}/corrections`, { expectedVersion: detail.version, reason: 'Completar descripción', changes: { description: 'Descripción corregida' } })
    assert.equal(corrected.status, 201); assert.equal(corrected.body.data.document.description, 'Descripción corregida')
  })
  it('27 quick-create enforces inventory areas even with company-level permissions', async () => {
    const key = `inventory.areas.enabled:${A}`
    await prisma.instanceConfig.upsert({ where: { key }, create: { key, value: 'true' }, update: { value: 'true' } })
    const result = await call('POST', '/purchases/orders/references', { reference: 'Fuera de área', inventoryIds: [item1.id], idempotencyKey: 'scope-27' })
    assert.equal(result.status, 404)
    await prisma.instanceConfig.update({ where: { key }, data: { value: 'false' } })
  })
  it('28 concurrent invoice-to-order links preserve the single-order cardinality', async () => {
    const inv = await create('invoices', { reference: 'Factura concurrente' })
    const a = await create('orders', { reference: 'Orden A' }), b = await create('orders', { reference: 'Orden B' })
    const results = await Promise.all([a, b].map(o => call('POST', '/purchases/relations', { sourceType: 'purchase_invoice', sourceId: inv.id, targetType: 'purchase_order', targetId: o.id })))
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
    assert.equal(await prisma.entityRelation.count({ where: { sourceId: inv.id, relationType: 'BILLED_FROM' } }), 1)
  })
  it('29 global search and chat never render documentary money as zero', async () => {
    // Global search's accent helper is normally installed by core migrations.
    await q(`CREATE OR REPLACE FUNCTION atlas_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT $1'`)
    const result = await purchaseInvoicesProvider.search({ prisma, companyId: A, q: 'FAC corregida', limit: 10 })
    assert.equal(result.items.some(row => row.id === invoice.id), true)
    assert.equal(JSON.stringify(result).includes('0.00 MXN'), false)
    const card = await createChatExtraEntityTypes({ prisma }).resolve('purchase_invoice', A, invoice.id)
    assert.equal(card.details.some(d => ['Total', 'Pagado', 'Vence'].includes(d.label)), false)
  })
  it('30 documentary independence survives enabling a complete financial workflow later', async () => {
    const inv = await create('invoices', { reference: 'Independiente permanente' })
    await settings({ economicMode: 'FINANCIAL', preset: 'COMPLETE' })
    const detail = await get('invoices', inv.id)
    assert.equal(detail.companyEconomicMode, 'FINANCIAL'); assert.equal(detail.economicMode, 'DOCUMENTARY')
    assert.deepEqual(detail.policyCheck.reasons, []); assert.deepEqual(detail.stageMap, [])
    assert.equal(detail.orders.length, 0)
    await settings({ profile: 'DOCUMENTARY' })
  })
  it('31 existing reference suggestions never merge legitimate duplicates', async () => {
    const a = await call('POST', '/purchases/invoices/references', { reference: 'Referencia repetida', idempotencyKey: 'dup-31-a' })
    const b = await call('POST', '/purchases/invoices/references', { reference: 'Referencia repetida', idempotencyKey: 'dup-31-b' })
    assert.equal(a.status, 201); assert.equal(b.status, 201)
    assert.notEqual(a.body.data.id, b.body.data.id)
    assert.equal(b.body.duplicateCandidates.some(row => row.id === a.body.data.id), true)
    assert.equal(b.body.automaticMerge, false)
  })
  it('32 rollback refuses data loss after documentary records exist', async () => {
    const client = await pool.connect()
    try {
      await assert.rejects(client.query(read('scripts/purchases/documentary-rollback.sql')), /rollback refused/)
      await client.query('ROLLBACK')
      assert.notEqual((await client.query("SELECT to_regclass('purchase_documentary_reference') AS name")).rows[0].name, null)
    } finally { client.release() }
  })
  it('33 anonymous and authenticated Data API roles cannot access documentary metadata', async () => {
    const client = await pool.connect()
    try {
      for (const role of ['anon', 'authenticated']) {
        await client.query('BEGIN')
        await client.query(`SET LOCAL ROLE ${role}`)
        await assert.rejects(client.query('SELECT * FROM purchase_documentary_reference'), error => error.code === '42501')
        await client.query('ROLLBACK')
      }
    } finally { await client.query('ROLLBACK'); client.release() }
  })
  it('34 a documentary order never satisfies a financial order policy in a mixed case', async () => {
    const documentaryOrder = await create('orders', { reference: 'Solo evidencia documental' })
    await settings({ economicMode: 'FINANCIAL', preset: 'COMPLETE' })
    await settings({ preset: 'CUSTOM', policies: [], stages: [{ type: 'PURCHASE_ORDER', mode: 'REQUIRED' }, { type: 'INVOICE', mode: 'REQUIRED' }, { type: 'PAYMENT', mode: 'OPTIONAL' }] })
    const financialInvoice = await create('invoices', { number: 'MIXED-34', total: 100, orderIds: [documentaryOrder.id] })
    await call('POST', `/purchases/invoices/${financialInvoice.id}/transition`, { action: 'submit' })
    const payment = await call('POST', `/purchases/invoices/${financialInvoice.id}/payments`, { amount: 100 })
    assert.equal(payment.body.code, 'POLICY_BLOCKED')
    assert.equal(payment.body.reasons.some(reason => reason.includes('Orden de compra')), true)
    assert.equal((await get('orders', documentaryOrder.id)).policyCheck.blocked, false)
  })
})
