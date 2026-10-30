// Reconciliation of supplier-invoice payments against the purchase_payment
// ledger, and the reviewed backfill of legacy accumulated amounts.
//
//   node scripts/purchases/payments-reconciliation.mjs --database-url <url> [--company <id>] [--out <file.json>]
//   node scripts/purchases/payments-reconciliation.mjs --database-url <url> --apply --confirm-database <name>
//
// Never reads .env: the target is always explicit. Default is a read-only
// dry run (one READ ONLY transaction) that reports, per invoice, the cached
// paid amount, the recorded movements, the classification and any status
// inconsistency. --apply records ONE opening movement (kind OPENING, origin
// MIGRATED, idempotency key "backfill:<invoiceId>") for each clean
// LEGACY_UNRECORDED invoice. It never invents dates, methods or references
// (they go to metadata.legacySnapshot exactly as the invoice had them), never
// updates purchase_invoice, and skips every invoice with an issue. Re-running
// is idempotent (the key is unique per company). Each batch is one
// transaction; a failure rolls that batch back and stops.
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { reconcileInvoice } from '../../apps/api/src/services/purchase-payments-ledger.js'
import { centsToDecimal, toCents } from '../../apps/api/src/services/purchase-money.js'

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
const pg = require('pg')
const BATCH = 200

export function parseArgs(argv) {
  const args = { apply: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--apply') args.apply = true
    else if (flag === '--database-url') args.url = argv[++i]
    else if (flag === '--company') args.company = argv[++i]
    else if (flag === '--out') args.out = argv[++i]
    else if (flag === '--confirm-database') args.confirm = argv[++i]
    else throw new Error(`Opción desconocida: ${flag}`)
  }
  if (!args.url) throw new Error('Falta --database-url (el destino siempre es explícito).')
  return args
}

async function loadRows(client, company) {
  const { rows } = await client.query(`
    SELECT i.id, i.company_id, i.number, i.status, i.currency, i.total::text AS total, i.paid_amount::text AS paid_amount,
           i.paid_at::text AS paid_at, i.payment_reference, i.payment_method,
           COALESCE(json_agg(json_build_object('amount', p.amount::text, 'kind', p.kind)) FILTER (WHERE p.id IS NOT NULL), '[]') AS movements
    FROM purchase_invoice i LEFT JOIN purchase_payment p ON p.invoice_id = i.id AND p.company_id = i.company_id
    WHERE ($1::uuid IS NULL OR i.company_id = $1::uuid) AND (i.paid_amount > 0 OR p.id IS NOT NULL)
    GROUP BY i.id ORDER BY i.company_id, i.id`, [company ?? null])
  return rows
}

// Pure: report rows + totals from loaded invoices.
export function buildReport(rows) {
  const invoices = rows.map(row => {
    const result = reconcileInvoice({ status: row.status, total: row.total, paidAmount: row.paid_amount }, row.movements)
    return {
      companyId: row.company_id, invoiceId: row.id, number: row.number, status: row.status, currency: row.currency,
      total: row.total, paidAmount: row.paid_amount, recorded: centsToDecimal(result.recordedCents),
      classification: result.classification, issues: result.issues, backfill: centsToDecimal(result.backfillCents),
    }
  })
  const sum = (list, key) => centsToDecimal(list.reduce((total, row) => total + toCents(row[key]), 0))
  const count = key => invoices.filter(row => row.classification === key).length
  return {
    invoices,
    totals: {
      invoices: invoices.length,
      noPayments: count('NO_PAYMENTS'), recorded: count('RECORDED'), legacyUnrecorded: count('LEGACY_UNRECORDED'), ledgerMismatch: count('LEDGER_MISMATCH'),
      withIssues: invoices.filter(row => row.issues.length).length,
      cachedPaid: sum(invoices, 'paidAmount'), recordedPaid: sum(invoices, 'recorded'), toBackfill: sum(invoices, 'backfill'),
    },
    exceptions: invoices.filter(row => row.issues.length || row.classification === 'LEDGER_MISMATCH'),
  }
}

async function applyBackfill(pool, report) {
  const candidates = report.invoices.filter(row => row.classification === 'LEGACY_UNRECORDED' && !row.issues.length && Number(row.backfill) > 0)
  let inserted = 0
  for (let start = 0; start < candidates.length; start += BATCH) {
    const batch = candidates.slice(start, start + BATCH)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const row of batch) {
        // Re-read under lock: skip if the invoice changed since the report.
        const { rows: [live] } = await client.query('SELECT paid_amount::text AS paid_amount, paid_at::text AS paid_at, payment_reference, payment_method, status FROM purchase_invoice WHERE id = $1::uuid FOR UPDATE', [row.invoiceId])
        const { rows: [ledger] } = await client.query('SELECT count(*)::int AS n FROM purchase_payment WHERE invoice_id = $1::uuid', [row.invoiceId])
        if (!live || live.paid_amount !== row.paidAmount || ledger.n > 0) continue
        const snapshot = { paidAmount: live.paid_amount, paidAt: live.paid_at, paymentReference: live.payment_reference, paymentMethod: live.payment_method, status: live.status }
        const result = await client.query(`INSERT INTO purchase_payment (company_id, invoice_id, kind, origin, amount, currency, idempotency_key, metadata)
          VALUES ($1::uuid, $2::uuid, 'OPENING', 'MIGRATED', $3::numeric, $4, $5, $6::jsonb) ON CONFLICT (company_id, idempotency_key) DO NOTHING`,
        [row.companyId, row.invoiceId, row.backfill, row.currency, `backfill:${row.invoiceId}`, JSON.stringify({ legacySnapshot: snapshot, source: 'backfill' })])
        inserted += result.rowCount
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(`Lote ${start / BATCH + 1} revertido: ${error.message}`)
    } finally {
      client.release()
    }
  }
  return { candidates: candidates.length, inserted }
}

export async function run(argv) {
  const args = parseArgs(argv)
  const pool = new pg.Pool({ connectionString: args.url, max: 2 })
  try {
    const { rows: [db] } = await pool.query('SELECT current_database() AS name, to_regclass(\'public.purchase_payment\')::text AS ledger')
    if (!db.ledger) throw new Error('La tabla purchase_payment no existe: aplica primero la migración 20261214120000_purchase_payments.')
    if (args.apply && args.confirm !== db.name) throw new Error(`--apply requiere --confirm-database ${db.name}`)
    const client = await pool.connect()
    let report
    try {
      await client.query('BEGIN READ ONLY')
      report = buildReport(await loadRows(client, args.company))
      await client.query('COMMIT')
    } finally { client.release() }
    const output = { database: db.name, mode: args.apply ? 'apply' : 'dry-run', ...report }
    if (args.apply) {
      output.applied = await applyBackfill(pool, report)
      const after = buildReport(await loadRows(pool, args.company))
      output.after = after.totals
      // Before/after: the cached paid total never changes; the recorded total rises by exactly the backfill.
      output.verified = after.totals.cachedPaid === report.totals.cachedPaid
        && toCents(after.totals.recordedPaid) === toCents(report.totals.recordedPaid) + toCents(report.totals.toBackfill)
    }
    if (args.out) await writeFile(args.out, JSON.stringify(output, null, 2))
    return output
  } finally {
    await pool.end()
  }
}

if (process.argv[1]?.endsWith('payments-reconciliation.mjs')) {
  run(process.argv.slice(2))
    .then(output => {
      const { invoices: _rows, ...summary } = output
      console.log(JSON.stringify({ ...summary, exceptions: output.exceptions.length }, null, 2))
    })
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
