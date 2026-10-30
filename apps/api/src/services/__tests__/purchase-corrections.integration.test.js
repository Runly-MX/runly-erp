// Corrections, versions and receipt reversals against a disposable PostgreSQL
// (explicit PURCHASES_TEST_DATABASE_URL only). The schema is built from
// prisma/schema.prisma WITHOUT the payments and corrections tables; data is
// written; then the two real migration files are applied in their order.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createPurchasesRouter } from '../../routes/purchases/index.js'
import { resetVersionsProbe } from '../purchases-shared.js'

const url = process.env.PURCHASES_TEST_DATABASE_URL
const ROOT = new URL('../../../../..', import.meta.url)
const read = path => readFileSync(new URL(path, ROOT), 'utf8')
const A = '01a00000-0000-7000-8000-00000000001a'
const B = '01a00000-0000-7000-8000-00000000001b'
const ACTOR = '01a00000-0000-7000-8000-0000000001a1'
const ALL = ['purchases.order.read', 'purchases.order.create', 'purchases.order.update', 'purchases.order.correct', 'purchases.invoice.read', 'purchases.invoice.create',
  'purchases.invoice.update', 'purchases.invoice.correct', 'purchases.receipt.read', 'purchases.receipt.create', 'purchases.receipt.reverse', 'purchases.payment.manage']

describe('purchase corrections and receipt reversals on isolated PostgreSQL', { skip: !url }, () => {
  let pool, prisma
  const apps = new Map()
  const call = async (method, path, payload, { company = A, permissions = ALL } = {}) => {
    const key = `${company}:${permissions.join(',')}`
    if (!apps.has(key)) {
      const requirePermission = needed => async (c, next) => {
        c.set('companyId', company)
        c.set('userId', ACTOR)
        c.set('userContext', { profile: { id: ACTOR }, isAdmin: false, permissionSet: new Set(permissions) })
        if (!permissions.includes(needed)) return c.json({ error: 'forbidden', code: 'FORBIDDEN' }, 403)
        await next()
      }
      const hono = new Hono()
      hono.route('/', createPurchasesRouter({ prisma, requirePermission }))
      apps.set(key, hono)
    }
    const response = await apps.get(key).request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    return { status: response.status, body: await response.json() }
  }
  const q = (sql, params) => pool.query(sql, params)
  let n = 0
  async function issuedOrder(lines = [{ description: 'Laptop', quantity: 3, unitAmount: 100 }, { description: 'Monitor', quantity: 2, unitAmount: 50 }]) {
    n += 1
    const order = (await call('POST', '/purchases/orders', { number: `OC-T-${n}`, lines })).body.data
    await call('POST', `/purchases/orders/${order.id}/transition`, { action: 'submit' })
    await call('POST', `/purchases/orders/${order.id}/transition`, { action: 'issue' })
    return (await call('GET', `/purchases/orders/${order.id}`)).body.data
  }
  const receiveAll = async order => (await call('POST', '/purchases/receipts', { orderId: order.id, lines: order.lines.map(line => ({ orderLineId: line.id, quantity: line.quantity })) })).body.data
  const received = async orderId => (await q(`SELECT l.description, l.received_quantity::float AS r,
      COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_line rl WHERE rl.order_line_id = l.id), 0)::float
      - COALESCE((SELECT SUM(x.quantity) FROM purchase_receipt_reversal_line x WHERE x.order_line_id = l.id), 0)::float AS ledger
    FROM purchase_line l WHERE l.owner_id = $1 ORDER BY l.sort_order`, [orderId])).rows

  before(async () => {
    pool = new pg.Pool({ connectionString: url, max: 12 })
    await q('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public')
    const require = createRequire(import.meta.url)
    const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8e6 })
    await q(ddl)
    // The state before phases 3 and 4.
    await q('DROP TABLE purchase_receipt_reversal_line, purchase_receipt_reversal, purchase_document_revision, purchase_document_version, purchase_payment')
    await q(read('prisma/migrations/20261214120000_purchase_payments/migration.sql'))
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
    await q(`INSERT INTO user_profile (id, auth_user_id, display_name, email, updated_at) VALUES ($1, gen_random_uuid(), 'Correctora', 'fix@corrections.example.test', now())`, [ACTOR])
    for (const company of [A, B]) {
      await q(`INSERT INTO company (id, name, slug, updated_at) VALUES ($1, $2, $3, now())`, [company, `Correcciones ${company.slice(-1)}`, `corr-${company.slice(-1)}`])
      await q(`INSERT INTO purchase_workflow (id, company_id, name, preset, is_default, capabilities, stages, policies, numbering, enabled, updated_at)
        VALUES (gen_random_uuid(), $1, 'Flujo', 'CUSTOM', true, $2, $3, '[]', '{}', true, now())`, [company,
        JSON.stringify({ requests: false, quotes: false, approvals: false, purchaseOrders: true, receipts: true, invoices: true, payments: true, inventoryRelations: true }),
        JSON.stringify([{ type: 'PURCHASE_ORDER', mode: 'OPTIONAL' }, { type: 'RECEIPT', mode: 'OPTIONAL' }, { type: 'INVOICE', mode: 'OPTIONAL' }, { type: 'PAYMENT', mode: 'OPTIONAL' }, { type: 'CLOSE', mode: 'REQUIRED' }])])
    }
  })
  after(async () => { await prisma?.$disconnect(); await pool?.end() })

  const pre = {}
  it('without the migration the code keeps working; the migration applies on existing data and is reversible', async () => {
    pre.order = await issuedOrder()
    assert.equal(pre.order.version, null, 'no version before the migration')
    assert.equal((await call('POST', `/purchases/orders/${pre.order.id}/corrections`, { changes: { notes: 'x' }, reason: 'x' })).body.code, 'CORRECTIONS_UNAVAILABLE')
    pre.receipt = await receiveAll(pre.order)
    const fingerprint = async () => (await q(`SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS h FROM (
      SELECT row_to_json(o)::text AS t FROM purchase_order o UNION ALL SELECT row_to_json(i)::text FROM purchase_invoice i
      UNION ALL SELECT row_to_json(r)::text FROM purchase_receipt r UNION ALL SELECT row_to_json(l)::text FROM purchase_line l) x`)).rows[0].h
    const before = await fingerprint()
    await q(read('prisma/migrations/20261215120000_purchase_corrections/migration.sql'))
    assert.equal(await fingerprint(), before, 'existing rows unchanged')
    resetVersionsProbe()
    apps.clear()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(read('scripts/purchases/corrections-rollback.sql'))
      assert.equal((await client.query("SELECT to_regclass('public.purchase_document_revision') AS t")).rows[0].t, null)
      await client.query('ROLLBACK')
    } finally { client.release() }
    assert.equal((await call('GET', `/purchases/orders/${pre.order.id}`)).body.data.version, 1, 'existing documents start at version 1')
  })

  it('every write bumps the version: transitions, receipts, payments', async () => {
    const order = await issuedOrder([{ description: 'Silla', quantity: 1, unitAmount: 10 }])
    assert.equal(order.version, 3, 'create=1, submit=2, issue=3')
    await receiveAll(order)
    assert.equal((await call('GET', `/purchases/orders/${order.id}`)).body.data.version, 4)
    const invoice = (await call('POST', '/purchases/invoices', { number: 'F-V1', lines: [{ description: 'x', quantity: 1, unitAmount: 100 }] })).body.data
    await call('POST', `/purchases/invoices/${invoice.id}/transition`, { action: 'submit' })
    await call('POST', `/purchases/invoices/${invoice.id}/payments`, { amount: '10' })
    const after = (await call('GET', `/purchases/invoices/${invoice.id}`)).body.data
    assert.equal(after.version, 3)
    assert.equal((await call('POST', `/purchases/invoices/${invoice.id}/payments`, { amount: '1', expectedVersion: 2 })).body.code, 'STALE_DOCUMENT')
    assert.equal((await call('POST', `/purchases/invoices/${invoice.id}/payments`, { amount: '1', expectedVersion: 3 })).status, 201)
  })

  it('corrections: allowed fields, revision persisted, duplicate folio, locked fields, reason', async () => {
    const order = await issuedOrder()
    await issuedOrder() // OC-T-n+1 exists for the duplicate check
    const taken = `OC-T-${n}`
    const res = await call('POST', `/purchases/orders/${order.id}/corrections`, { expectedVersion: order.version, reason: 'Folio mal capturado', changes: { number: 'OC-2026-0001', notes: 'Entrega en almacén norte', expectedDate: '2026-11-30' } })
    assert.equal(res.status, 201)
    assert.equal(res.body.data.document.number, 'OC-2026-0001')
    assert.equal(res.body.data.version, order.version + 1)
    const [revision] = (await q('SELECT * FROM purchase_document_revision WHERE document_id = $1', [order.id])).rows
    assert.deepEqual([revision.version_from, revision.version_to, revision.reason, revision.actor_id], [order.version, order.version + 1, 'Folio mal capturado', ACTOR])
    assert.deepEqual(revision.changes.number, { before: order.number, after: 'OC-2026-0001' })
    assert.deepEqual(revision.changes.expectedDate, { before: null, after: '2026-11-30' })
    const audit = (await q("SELECT action, metadata FROM audit_log WHERE entity_id = $1 AND action = 'purchase.order.corrected'", [order.id])).rows
    assert.equal(audit.length, 1)
    assert.equal((await q("SELECT count(*)::int AS c FROM domain_event_outbox WHERE event = 'purchases.order.corrected' AND payload->>'id' = $1", [order.id])).rows[0].c, 1)
    const v = res.body.data.version
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { expectedVersion: v, reason: 'x', changes: { number: taken } })).body.code, 'DUPLICATE_NUMBER')
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { expectedVersion: v, reason: 'x', changes: { total: 1 } })).body.code, 'FIELD_NOT_CORRECTABLE')
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { expectedVersion: v, reason: 'x', changes: { supplierId: B } })).status, 422)
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { expectedVersion: v, changes: { notes: 'y' } })).body.code, 'VALIDATION')
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { expectedVersion: v, reason: 'x', changes: { notes: 'Entrega en almacén norte' } })).body.code, 'NO_CHANGES')
    const history = (await call('GET', `/purchases/orders/${order.id}/revisions`)).body.data
    assert.deepEqual([history.version, history.revisions.length, history.revisions[0].actorName], [v, 1, 'Correctora'])
    await assert.rejects(q("UPDATE purchase_document_revision SET reason = 'z' WHERE id = $1", [revision.id]), /immutable/)
  })

  it('two users correcting the same version: exactly one wins', async () => {
    const order = await issuedOrder()
    const results = await Promise.all(['Nota A', 'Nota B'].map(notes => call('POST', `/purchases/orders/${order.id}/corrections`, { expectedVersion: order.version, reason: 'Concurrencia', changes: { notes } })))
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
    assert.equal(results.find(r => r.status === 409).body.code, 'STALE_DOCUMENT')
    assert.equal((await q('SELECT count(*)::int AS c FROM purchase_document_revision WHERE document_id = $1', [order.id])).rows[0].c, 1)
  })

  it('paid and closed documents: only safe fields; payments ledger untouched', async () => {
    const invoice = (await call('POST', '/purchases/invoices', { number: 'F-PAID', lines: [{ description: 'x', quantity: 1, unitAmount: 100 }] })).body.data
    await call('POST', `/purchases/invoices/${invoice.id}/transition`, { action: 'submit' })
    await call('POST', `/purchases/invoices/${invoice.id}/payments`, { amount: '100' })
    const paid = (await call('GET', `/purchases/invoices/${invoice.id}`)).body.data
    assert.deepEqual(paid.correction.fields.map(f => f.field), ['number', 'notes'])
    assert.equal((await call('POST', `/purchases/invoices/${invoice.id}/corrections`, { expectedVersion: paid.version, reason: 'x', changes: { dueDate: '2026-12-01' } })).body.code, 'FIELD_LOCKED_IN_STATUS')
    const fixed = await call('POST', `/purchases/invoices/${invoice.id}/corrections`, { expectedVersion: paid.version, reason: 'Folio del proveedor mal capturado', changes: { number: 'F-PAID-1' } })
    assert.equal(fixed.status, 201)
    const ledger = (await q('SELECT i.paid_amount::text AS p, i.status, (SELECT SUM(amount)::text FROM purchase_payment WHERE invoice_id = i.id) AS s FROM purchase_invoice i WHERE id = $1', [invoice.id])).rows[0]
    assert.deepEqual(ledger, { p: '100.00', status: 'PAID', s: '100.00' })
    const closed = await issuedOrder([{ description: 'x', quantity: 1, unitAmount: 1, itemKind: 'SERVICE' }])
    await call('POST', `/purchases/orders/${closed.id}/transition`, { action: 'close' })
    const closedDetail = (await call('GET', `/purchases/orders/${closed.id}`)).body.data
    assert.equal((await call('POST', `/purchases/orders/${closed.id}/corrections`, { expectedVersion: closedDetail.version, reason: 'x', changes: { expectedDate: '2026-12-01' } })).body.code, 'FIELD_LOCKED_IN_STATUS')
    assert.equal((await call('POST', `/purchases/orders/${closed.id}/corrections`, { expectedVersion: closedDetail.version, reason: 'x', changes: { supplierReference: 'PROV-77' } })).status, 201)
  })

  it('capability off, permissions and the other company', async () => {
    const order = await issuedOrder()
    await call('POST', `/purchases/orders/${order.id}/corrections`, { reason: 'Antes de apagar', changes: { notes: 'n1' } })
    const reader = ['purchases.order.read']
    assert.equal((await call('GET', `/purchases/orders/${order.id}/revisions`, null, { permissions: reader })).status, 200)
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { reason: 'x', changes: { notes: 'n2' } }, { permissions: [...reader, 'purchases.order.update'] })).status, 403, 'update is not correct')
    assert.equal((await call('GET', `/purchases/orders/${order.id}/revisions`, null, { company: B })).status, 404)
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { reason: 'x', changes: { notes: 'n3' } }, { company: B })).status, 404)
    await q(`UPDATE purchase_workflow SET capabilities = capabilities || '{"purchaseOrders": false}' WHERE company_id = $1`, [A])
    const history = await call('GET', `/purchases/orders/${order.id}/revisions`)
    assert.deepEqual([history.status, history.body.data.revisions.length], [200, 1])
    assert.equal((await call('POST', `/purchases/orders/${order.id}/corrections`, { reason: 'x', changes: { notes: 'n4' } })).body.code, 'CAPABILITY_DISABLED')
    await q(`UPDATE purchase_workflow SET capabilities = capabilities || '{"purchaseOrders": true}' WHERE company_id = $1`, [A])
  })

  it('receipt reversals: partial, total, double, concurrent, idempotent; quantities stay consistent', async () => {
    const order = await issuedOrder()
    const receipt = await receiveAll(order)
    const detail = (await call('GET', `/purchases/receipts/${receipt.id}`)).body.data
    const laptop = detail.reversal.lines.find(line => line.description === 'Laptop')
    assert.equal((await call('POST', `/purchases/receipts/${receipt.id}/reverse`, { lines: [{ receiptLineId: laptop.receiptLineId, quantity: 1 }] })).body.code, 'VALIDATION', 'reason required')
    const partial = await call('POST', `/purchases/receipts/${receipt.id}/reverse`, { reason: 'Una laptop llegó dañada', lines: [{ receiptLineId: laptop.receiptLineId, quantity: 1 }], idempotencyKey: 'rev-key-0000001' })
    assert.deepEqual([partial.status, partial.body.data.orderStatus], [201, 'PARTIALLY_RECEIVED'])
    const replay = await call('POST', `/purchases/receipts/${receipt.id}/reverse`, { reason: 'Una laptop llegó dañada', lines: [{ receiptLineId: laptop.receiptLineId, quantity: 1 }], idempotencyKey: 'rev-key-0000001' })
    assert.deepEqual([replay.status, replay.body.data.replayed], [200, true])
    assert.deepEqual((await received(order.id)).map(r => [r.description, r.r, r.ledger]), [['Laptop', 2, 2], ['Monitor', 2, 2]])
    const both = await Promise.all([1, 2].map(() => call('POST', `/purchases/receipts/${receipt.id}/reverse`, { reason: 'Proveedor recogió todo' })))
    assert.deepEqual(both.map(r => r.status).sort(), [201, 409])
    assert.equal(both.find(r => r.status === 409).body.code, 'NOTHING_TO_REVERSE')
    assert.deepEqual((await received(order.id)).map(r => [r.r, r.ledger]), [[0, 0], [0, 0]])
    assert.equal((await call('GET', `/purchases/orders/${order.id}`)).body.data.status, 'ISSUED')
    assert.equal((await q('SELECT count(*)::int AS c FROM purchase_receipt_line WHERE receipt_id = $1', [receipt.id])).rows[0].c, 2, 'original lines kept')
    assert.equal((await q("SELECT count(*)::int AS c FROM domain_event_outbox WHERE event = 'purchases.receipt.reversed' AND payload->>'receiptId' = $1", [receipt.id])).rows[0].c, 2)
    await assert.rejects(q('DELETE FROM purchase_receipt_reversal WHERE receipt_id = $1', [receipt.id]), /immutable/)
    // The order can be received again after the reversal.
    assert.equal((await call('POST', '/purchases/receipts', { orderId: order.id, lines: [{ orderLineId: order.lines[0].id, quantity: 3 }] })).status, 201)
  })

  it('receipt reversal blockers: linked assets, closed order, closed case; reader and other company', async () => {
    const withAssets = await issuedOrder()
    const r1 = await receiveAll(withAssets)
    await q(`INSERT INTO entity_relation (id, company_id, source_module, source_type, source_id, target_module, target_type, target_id, relation_type, origin)
      VALUES (gen_random_uuid(), $1, 'runly.purchases', 'purchase_receipt', $2, 'runly.inventory', 'inventory_item', gen_random_uuid(), 'RECEIVED_IN', 'MANUAL')`, [A, r1.id])
    const blocked = await call('POST', `/purchases/receipts/${r1.id}/reverse`, { reason: 'x' })
    assert.deepEqual([blocked.status, blocked.body.code], [409, 'RECEIPT_HAS_ASSETS'])
    assert.equal(blocked.body.dependencies[0].code, 'RECEIPT_HAS_ASSETS')
    assert.deepEqual((await received(withAssets.id)).map(r => r.r), [3, 2], 'nothing changed')

    const closed = await issuedOrder()
    const r2 = await receiveAll(closed)
    await call('POST', `/purchases/orders/${closed.id}/transition`, { action: 'close' })
    assert.equal((await call('POST', `/purchases/receipts/${r2.id}/reverse`, { reason: 'x' })).body.code, 'ORDER_CLOSED')
    const preview = (await call('GET', `/purchases/receipts/${r2.id}/reversal-preview`)).body.data
    assert.ok(preview.blockers.some(b => b.code === 'ORDER_CLOSED'))

    const inClosedCase = await issuedOrder()
    const r3 = await receiveAll(inClosedCase)
    await q(`UPDATE purchase_case SET status = 'CLOSED' WHERE id = $1`, [inClosedCase.caseId])
    assert.equal((await call('POST', `/purchases/receipts/${r3.id}/reverse`, { reason: 'x' })).body.code, 'CASE_CLOSED')
    assert.equal((await q('SELECT status FROM purchase_case WHERE id = $1', [inClosedCase.caseId])).rows[0].status, 'CLOSED', 'case not reopened')

    await q(`UPDATE purchase_case SET status = 'IN_PROGRESS' WHERE id = $1`, [inClosedCase.caseId])
    assert.equal((await call('POST', `/purchases/receipts/${r3.id}/reverse`, { reason: 'x' }, { permissions: ['purchases.receipt.read', 'purchases.receipt.create'] })).status, 403)
    assert.equal((await call('POST', `/purchases/receipts/${r3.id}/reverse`, { reason: 'x' }, { company: B })).status, 404)
    assert.equal((await call('GET', `/purchases/receipts/${r3.id}/reversal-preview`, null, { company: B })).status, 404)
  })

  it('invariant: received_quantity = receipts - reversals on every order line', async () => {
    const { rows } = await q(`SELECT l.id FROM purchase_line l WHERE l.owner_type = 'PURCHASE_ORDER' AND l.received_quantity <>
      COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_line rl WHERE rl.order_line_id = l.id), 0)
      - COALESCE((SELECT SUM(x.quantity) FROM purchase_receipt_reversal_line x WHERE x.order_line_id = l.id), 0)`)
    assert.deepEqual(rows, [])
  })
})
