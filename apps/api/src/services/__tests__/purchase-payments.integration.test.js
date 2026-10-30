// Purchase payments ledger against a disposable PostgreSQL (explicit
// PURCHASES_TEST_DATABASE_URL only; never .env). The database is wiped: the
// schema is built from prisma/schema.prisma WITHOUT purchase_payment, legacy
// invoices are written the way the previous code left them, and then the real
// migration file is applied on top of that data.
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
import { run as reconcile } from '../../../../../scripts/purchases/payments-reconciliation.mjs'

const url = process.env.PURCHASES_TEST_DATABASE_URL
const ROOT = new URL('../../../../..', import.meta.url)
const MIGRATION = readFileSync(new URL('prisma/migrations/20261214120000_purchase_payments/migration.sql', ROOT), 'utf8')
const ROLLBACK = readFileSync(new URL('scripts/purchases/payments-rollback.sql', ROOT), 'utf8')
const A = '01a00000-0000-7000-8000-00000000000a'
const B = '01a00000-0000-7000-8000-00000000000b'
const PAYER = '01a00000-0000-7000-8000-0000000000a1'
const ALL = ['purchases.invoice.read', 'purchases.invoice.update', 'purchases.payment.manage', 'purchases.payment.reverse']

describe('purchase payments on isolated PostgreSQL', { skip: !url }, () => {
  let pool, prisma
  const apps = new Map()
  const app = (companyId, permissions = ALL) => {
    const key = `${companyId}:${permissions.join(',')}`
    if (!apps.has(key)) {
      const requirePermission = needed => async (c, next) => {
        c.set('companyId', companyId)
        c.set('userId', PAYER)
        c.set('userContext', { profile: { id: PAYER }, isAdmin: false, permissionSet: new Set(permissions) })
        if (!permissions.includes(needed)) return c.json({ error: 'forbidden', code: 'FORBIDDEN' }, 403)
        await next()
      }
      const hono = new Hono()
      hono.route('/', createPurchasesRouter({ prisma, requirePermission }))
      apps.set(key, hono)
    }
    return apps.get(key)
  }
  const call = async (method, path, payload, { company = A, permissions } = {}) => {
    const response = await app(company, permissions).request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    return { status: response.status, body: await response.json() }
  }
  const pay = (invoiceId, data, options) => call('POST', `/purchases/invoices/${invoiceId}/payments`, data, options)
  const reverse = (paymentId, data, options) => call('POST', `/purchases/payments/${paymentId}/reverse`, data, options)
  const invoiceRow = async id => (await pool.query('SELECT status, paid_amount::text AS paid, paid_at::text AS paid_at, payment_reference, payment_method FROM purchase_invoice WHERE id = $1', [id])).rows[0]
  const ledgerSum = async id => (await pool.query('SELECT COALESCE(SUM(amount), 0)::text AS s, count(*)::int AS n FROM purchase_payment WHERE invoice_id = $1', [id])).rows[0]
  let sequence = 0
  async function invoice(companyId, { status = 'PENDING', total = '100.00', paid = '0', paidAt = null, reference = null, method = null } = {}) {
    sequence += 1
    const { rows: [row] } = await pool.query(`INSERT INTO purchase_invoice (id, company_id, case_id, number, sequence, issue_date, status, currency, subtotal, tax, total, paid_amount, paid_at, payment_reference, payment_method, updated_at)
      VALUES (gen_random_uuid(), $1, gen_random_uuid(), $2, $3, '2026-10-01', $4, 'MXN', $5, 0, $5, $6, $7, $8, $9, now()) RETURNING id`,
    [companyId, `FAC-${sequence}`, sequence, status, total, paid, paidAt, reference, method])
    return row.id
  }

  before(async () => {
    pool = new pg.Pool({ connectionString: url, max: 12 })
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public')
    const require = createRequire(import.meta.url)
    const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 8e6 })
    await pool.query(ddl)
    // The state before this migration: no ledger table.
    await pool.query('DROP TABLE purchase_payment')
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
    // Audit and outbox rows reference the company and the acting profile.
    await pool.query(`INSERT INTO user_profile (id, auth_user_id, display_name, email, updated_at) VALUES ($1, gen_random_uuid(), 'Pagadora', 'payer@payments.example.test', now())`, [PAYER])
    for (const company of [A, B]) {
      await pool.query(`INSERT INTO company (id, name, slug, updated_at) VALUES ($1, $2, $3, now())`, [company, `Pagos ${company.slice(-1)}`, `pagos-${company.slice(-1)}`])
      await pool.query(`INSERT INTO purchase_workflow (id, company_id, name, preset, is_default, capabilities, stages, policies, numbering, enabled, updated_at)
        VALUES (gen_random_uuid(), $1, 'Pagos', 'CUSTOM', true, $2, $3, '[]', '{}', true, now())`, [company,
        JSON.stringify({ requests: false, quotes: false, approvals: false, purchaseOrders: false, receipts: false, invoices: true, payments: true, inventoryRelations: false }),
        JSON.stringify([{ type: 'INVOICE', mode: 'OPTIONAL' }, { type: 'PAYMENT', mode: 'OPTIONAL' }, { type: 'CLOSE', mode: 'REQUIRED' }])])
    }
  })
  after(async () => { await prisma?.$disconnect(); await pool?.end() })

  const legacy = {}
  it('the migration applies on existing invoices without touching them, and is reversible', async () => {
    legacy.paid = await invoice(A, { status: 'PAID', paid: '100.00', paidAt: '2026-01-15', reference: 'TRF-9', method: 'TRANSFER' })
    legacy.partial = await invoice(A, { status: 'PARTIALLY_PAID', paid: '40.00' })
    legacy.broken = await invoice(A, { status: 'PAID', paid: '70.00' })
    legacy.foreign = await invoice(B, { status: 'PARTIALLY_PAID', paid: '25.50' })
    const fingerprint = async () => (await pool.query("SELECT md5(string_agg(row_to_json(i)::text, '|' ORDER BY id)) AS h FROM purchase_invoice i")).rows[0].h
    const beforeHash = await fingerprint()
    await pool.query(MIGRATION)
    assert.equal(await fingerprint(), beforeHash, 'purchase_invoice rows unchanged')
    // Rollback script is valid SQL (checked inside a transaction that is rolled back).
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(ROLLBACK)
      assert.equal((await client.query("SELECT to_regclass('public.purchase_payment') AS t")).rows[0].t, null)
      await client.query('ROLLBACK')
    } finally { client.release() }
    assert.ok((await pool.query("SELECT to_regclass('public.purchase_payment') AS t")).rows[0].t)
  })

  it('reconciliation dry run reports, apply backfills only clean invoices, and is idempotent', async () => {
    const dry = await reconcile(['--database-url', url])
    assert.equal(dry.mode, 'dry-run')
    const by = Object.fromEntries(dry.invoices.map(row => [row.invoiceId, row]))
    assert.equal(by[legacy.paid].classification, 'LEGACY_UNRECORDED')
    assert.deepEqual(by[legacy.broken].issues, ['PAID_STATUS_BELOW_TOTAL'])
    assert.equal(dry.totals.cachedPaid, '235.50')
    assert.equal(dry.totals.toBackfill, '165.50')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM purchase_payment')).rows[0].n, 0, 'dry run writes nothing')
    await assert.rejects(reconcile(['--database-url', url, '--apply']), /--confirm-database/)
    const name = (await pool.query('SELECT current_database() AS n')).rows[0].n
    const applied = await reconcile(['--database-url', url, '--apply', '--confirm-database', name])
    assert.deepEqual([applied.applied.inserted, applied.verified], [3, true])
    const opening = (await pool.query('SELECT kind, origin, amount::text AS amount, paid_at, method, reference, metadata FROM purchase_payment WHERE invoice_id = $1', [legacy.paid])).rows
    assert.equal(opening.length, 1)
    assert.deepEqual([opening[0].kind, opening[0].origin, opening[0].amount, opening[0].paid_at, opening[0].method, opening[0].reference], ['OPENING', 'MIGRATED', '100.00', null, null, null])
    assert.deepEqual(opening[0].metadata.legacySnapshot, { paidAmount: '100.00', paidAt: '2026-01-15', paymentReference: 'TRF-9', paymentMethod: 'TRANSFER', status: 'PAID' })
    assert.equal((await ledgerSum(legacy.broken)).n, 0, 'invoice with an issue is reported, not touched')
    const again = await reconcile(['--database-url', url, '--apply', '--confirm-database', name])
    assert.equal(again.applied.inserted, 0)
  })

  it('movements are immutable outside the company purge', async () => {
    const [row] = (await pool.query('SELECT id FROM purchase_payment LIMIT 1')).rows
    await assert.rejects(pool.query("UPDATE purchase_payment SET reference = 'x' WHERE id = $1", [row.id]), /immutable/)
    await assert.rejects(pool.query('DELETE FROM purchase_payment WHERE id = $1', [row.id]), /immutable/)
    await assert.rejects(prisma.purchasePayment.delete({ where: { id: row.id } }))
    await assert.rejects(pool.query(`INSERT INTO purchase_payment (company_id, invoice_id, kind, amount, currency) VALUES ($1, $2, 'PAYMENT', -5, 'MXN')`, [A, legacy.partial]), /amount_sign/)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT set_config('runly.lifecycle_purge', 'on', true)")
      assert.equal((await client.query('DELETE FROM purchase_payment WHERE id = $1', [row.id])).rowCount, 1)
      await client.query('ROLLBACK')
    } finally { client.release() }
  })

  it('partial and full payments; exceeding, zero and negative amounts are refused', async () => {
    const id = await invoice(A)
    const first = await pay(id, { amount: '30.10', paidAt: '2026-10-02', method: 'CASH', reference: 'R1' })
    assert.equal(first.status, 201)
    assert.equal(first.body.data.invoice.status, 'PARTIALLY_PAID')
    assert.equal((await pay(id, { amount: '69.91' })).status, 400, 'over the balance')
    assert.equal((await pay(id, { amount: '0' })).status, 400)
    assert.equal((await pay(id, { amount: '-1' })).status, 400)
    assert.equal((await pay(id, { amount: '1.001' })).status, 400)
    const rest = await pay(id, { amount: '69.90', paidAt: '2026-10-03', method: 'TRANSFER', reference: 'R2' })
    assert.equal(rest.body.data.invoice.status, 'PAID')
    assert.deepEqual(await invoiceRow(id), { status: 'PAID', paid: '100.00', paid_at: '2026-10-03', payment_reference: 'R2', payment_method: 'TRANSFER' })
    assert.equal((await ledgerSum(id)).s, '100.00')
    assert.equal((await pay(id, { amount: '1' })).body.code, 'INVALID_TRANSITION')
    const events = (await pool.query("SELECT event FROM domain_event_outbox WHERE payload->>'invoiceId' = $1 OR payload->>'id' = $1 ORDER BY created_at", [id])).rows.map(r => r.event)
    assert.deepEqual(events, ['purchases.invoice.payment.recorded', 'purchases.invoice.payment.recorded', 'purchases.invoice.paid'])
  })

  it('a retry with the same key never records a second movement or event', async () => {
    const id = await invoice(A)
    const key = 'retry-key-0001'
    const [a, b] = await Promise.all([pay(id, { amount: '10', idempotencyKey: key }), pay(id, { amount: '10', idempotencyKey: key })])
    assert.deepEqual([a.status, b.status].sort(), [200, 201])
    const third = await pay(id, { amount: '10', idempotencyKey: key })
    assert.deepEqual([third.status, third.body.data.replayed], [200, true])
    assert.deepEqual(await ledgerSum(id), { s: '10.00', n: 1 })
    assert.equal((await invoiceRow(id)).paid, '10.00')
    assert.equal((await pay(id, { amount: '11', idempotencyKey: key })).body.code, 'IDEMPOTENCY_KEY_REUSED')
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM domain_event_outbox WHERE event = 'purchases.invoice.payment.recorded' AND payload->>'invoiceId' = $1", [id])).rows[0].n, 1)
  })

  it('concurrent payments never exceed the total and the ledger always matches the invoice', async () => {
    const id = await invoice(A)
    const results = await Promise.all(Array.from({ length: 6 }, () => pay(id, { amount: '30' })))
    assert.equal(results.filter(r => r.status === 201).length, 3)
    assert.ok(results.filter(r => r.status !== 201).every(r => r.status === 400))
    assert.deepEqual(await ledgerSum(id), { s: '90.00', n: 3 })
    assert.equal((await invoiceRow(id)).paid, '90.00')
  })

  it('reversals: partial, full, double, concurrent and simultaneous with a payment', async () => {
    const id = await invoice(A)
    const p1 = (await pay(id, { amount: '40', paidAt: '2026-10-01', reference: 'P1', method: 'CASH' })).body.data.payment
    const p2 = (await pay(id, { amount: '60', paidAt: '2026-10-05', reference: 'P2', method: 'TRANSFER' })).body.data.payment
    assert.equal((await reverse(p2.id, {})).status, 400, 'reason required')
    const r2 = await reverse(p2.id, { reason: 'Transferencia rechazada por el banco' })
    assert.equal(r2.status, 201)
    assert.equal(r2.body.data.invoice.status, 'PARTIALLY_PAID')
    assert.deepEqual(await invoiceRow(id), { status: 'PARTIALLY_PAID', paid: '40.00', paid_at: '2026-10-01', payment_reference: 'P1', payment_method: 'CASH' })
    assert.equal((await reverse(p2.id, { reason: 'otra vez' })).body.code, 'PAYMENT_ALREADY_REVERSED')
    assert.equal((await reverse(r2.body.data.reversal.id, { reason: 'x' })).body.code, 'INVALID_TRANSITION', 'a reversal cannot be reversed')
    const original = (await pool.query('SELECT amount::text AS a, reason FROM purchase_payment WHERE id = $1', [p2.id])).rows[0]
    assert.deepEqual(original, { a: '60.00', reason: null }, 'original kept as it was')
    // Concurrent double reversal of the same payment: exactly one wins.
    const both = await Promise.all([reverse(p1.id, { reason: 'Duplicado' }), reverse(p1.id, { reason: 'Duplicado' })])
    assert.deepEqual(both.map(r => r.status).sort(), [201, 409])
    assert.deepEqual(await invoiceRow(id), { status: 'PENDING', paid: '0.00', paid_at: null, payment_reference: null, payment_method: null })
    // Payment and reversal at the same time stay consistent.
    const p3 = (await pay(id, { amount: '50' })).body.data.payment
    const [payNow, revNow] = await Promise.all([pay(id, { amount: '50' }), reverse(p3.id, { reason: 'Error de captura' })])
    assert.deepEqual([payNow.status, revNow.status], [201, 201])
    const sum = await ledgerSum(id)
    assert.equal(sum.s, (await invoiceRow(id)).paid)
    assert.equal(sum.s, '50.00')
    const detail = (await call('GET', `/purchases/invoices/${id}/payments`)).body.data
    assert.equal(detail.payments.find(p => p.id === p2.id).reversedBy.reason, 'Transferencia rechazada por el banco')
    assert.equal(detail.summary.balance, 50)
  })

  it('a legacy invoice is recorded as one opening movement on first touch, never invented', async () => {
    const id = await invoice(A, { status: 'PARTIALLY_PAID', paid: '30.00', paidAt: '2026-02-01', reference: 'OLD' })
    const view = (await call('GET', `/purchases/invoices/${id}/payments`)).body.data
    assert.deepEqual([view.summary.unrecordedLegacy, view.payments.length], [30, 0])
    const paid = await pay(id, { amount: '20', paidAt: '2026-10-10' })
    assert.equal(paid.status, 201)
    const rows = (await pool.query('SELECT kind, origin, amount::text AS a, paid_at, metadata FROM purchase_payment WHERE invoice_id = $1 ORDER BY recorded_at', [id])).rows
    assert.deepEqual(rows.map(r => [r.kind, r.origin, r.a, r.paid_at]), [['OPENING', 'MIGRATED', '30.00', null], ['PAYMENT', 'MANUAL', '20.00', rows[1].paid_at]])
    assert.equal(rows[0].metadata.legacySnapshot.paymentReference, 'OLD')
    assert.equal((await invoiceRow(id)).paid, '50.00')
  })

  it('cancelled invoices, disabled capability, permissions and the other company', async () => {
    const cancelled = await invoice(A, { status: 'CANCELLED' })
    assert.equal((await pay(cancelled, { amount: '1' })).body.code, 'INVALID_TRANSITION')
    const id = await invoice(A)
    const payment = (await pay(id, { amount: '5' })).body.data.payment
    // Read-only permission: list yes, write no.
    const reader = ['purchases.invoice.read']
    assert.equal((await call('GET', `/purchases/invoices/${id}/payments`, null, { permissions: reader })).status, 200)
    assert.equal((await pay(id, { amount: '1' }, { permissions: reader })).status, 403)
    assert.equal((await reverse(payment.id, { reason: 'x' }, { permissions: ['purchases.invoice.read', 'purchases.payment.manage'] })).status, 403, 'reversing needs its own permission')
    // Other company: nothing is visible or reversible.
    assert.equal((await call('GET', `/purchases/invoices/${id}/payments`, null, { company: B })).status, 404)
    assert.equal((await call('GET', `/purchases/payments/${payment.id}`, null, { company: B })).status, 404)
    assert.equal((await reverse(payment.id, { reason: 'x' }, { company: B })).status, 404)
    assert.equal((await pay(id, { amount: '1' }, { company: B })).status, 404)
    // Payments capability off: history readable, writes refused.
    await pool.query(`UPDATE purchase_workflow SET capabilities = capabilities || '{"payments": false}' WHERE company_id = $1`, [A])
    const list = await call('GET', `/purchases/invoices/${id}/payments`)
    assert.deepEqual([list.status, list.body.data.summary.capabilityEnabled, list.body.data.payments.length], [200, false, 1])
    assert.equal((await pay(id, { amount: '1' })).body.code, 'CAPABILITY_DISABLED')
    assert.equal((await reverse(payment.id, { reason: 'x' })).body.code, 'CAPABILITY_DISABLED')
    await pool.query(`UPDATE purchase_workflow SET capabilities = capabilities || '{"payments": true}' WHERE company_id = $1`, [A])
  })

  it('the legacy transition "pay" keeps its contract and records a movement', async () => {
    const id = await invoice(A)
    const response = await call('POST', `/purchases/invoices/${id}/transition`, { action: 'pay', amount: 25 })
    assert.equal(response.status, 200)
    assert.deepEqual([response.body.data.id, response.body.data.status, response.body.data.paidAmount], [id, 'PARTIALLY_PAID', 25])
    assert.deepEqual(await ledgerSum(id), { s: '25.00', n: 1 })
  })

  it('invariant: every invoice with movements has paid_amount = SUM(amount)', async () => {
    const { rows } = await pool.query(`SELECT i.id FROM purchase_invoice i JOIN purchase_payment p ON p.invoice_id = i.id
      GROUP BY i.id, i.paid_amount HAVING i.paid_amount <> SUM(p.amount)`)
    assert.deepEqual(rows, [])
  })
})
