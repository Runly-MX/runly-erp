// Pure rules of the purchase payments ledger (no I/O): invoice status for a
// paid amount, the invoice cache fields after a change, and the read-only
// reconciliation of an invoice against its movements. Shared by the payments
// service and scripts/purchases/payments-reconciliation.mjs.
import { toCents } from './purchase-money.js'
import { asDate, dateKey } from './purchases-shared.js'

export const PAYABLE_STATUSES = ['PENDING', 'PARTIALLY_PAID']
export const REVERSIBLE_STATUSES = ['PARTIALLY_PAID', 'PAID']

// Invoice status for a paid amount (cents), within the payment lifecycle.
export function statusForPaid(totalCents, paidCents) {
  if (paidCents <= 0) return 'PENDING'
  return paidCents >= totalCents ? 'PAID' : 'PARTIALLY_PAID'
}

// Ids of movements that were reversed.
const reversedIds = movements => new Set(movements.filter(m => m.kind === 'REVERSAL').map(m => m.reversesId))

// The invoice-level paidAt / reference / method after the ledger changed:
// those of the latest movement still in force that carries them; for a
// legacy opening, what the invoice itself had recorded (never invented).
export function cacheFieldsFrom(movements) {
  const reversed = reversedIds(movements)
  const live = movements.filter(m => m.kind !== 'REVERSAL' && !reversed.has(m.id))
  const dated = live.filter(m => m.kind === 'PAYMENT').sort((a, b) => String(dateKey(a.paidAt)).localeCompare(String(dateKey(b.paidAt))) || new Date(a.recordedAt) - new Date(b.recordedAt))
  const latest = dated.at(-1)
  if (latest) return { paidAt: latest.paidAt ?? null, paymentReference: latest.reference ?? null, paymentMethod: latest.method ?? null }
  const opening = live.find(m => m.kind === 'OPENING')
  const snapshot = opening?.metadata?.legacySnapshot
  if (snapshot) return { paidAt: snapshot.paidAt ? asDate(snapshot.paidAt) : null, paymentReference: snapshot.paymentReference ?? null, paymentMethod: snapshot.paymentMethod ?? null }
  return { paidAt: null, paymentReference: null, paymentMethod: null }
}

// Read-only classification of one invoice against its ledger. Never fixes.
// invoice: { status, total, paidAmount }, movements: [{ amount }].
export function reconcileInvoice(invoice, movements = []) {
  const total = toCents(invoice.total)
  const cached = toCents(invoice.paidAmount ?? 0)
  const recorded = movements.reduce((sum, m) => sum + toCents(m.amount), 0)
  const issues = []
  if (cached > total) issues.push('PAID_EXCEEDS_TOTAL')
  if (invoice.status === 'CANCELLED' && cached > 0) issues.push('CANCELLED_WITH_PAYMENT')
  if (['DRAFT', 'PENDING_APPROVAL', 'PENDING'].includes(invoice.status) && cached > 0) issues.push('STATUS_WITHOUT_PAYMENT_BUT_PAID')
  if (invoice.status === 'PARTIALLY_PAID' && (cached <= 0 || cached >= total)) issues.push('PARTIAL_STATUS_MISMATCH')
  if (invoice.status === 'PAID' && cached < total) issues.push('PAID_STATUS_BELOW_TOTAL')
  let classification
  if (movements.length && recorded !== cached) classification = 'LEDGER_MISMATCH'
  else if (!movements.length && cached > 0) classification = 'LEGACY_UNRECORDED'
  else if (movements.length) classification = 'RECORDED'
  else classification = 'NO_PAYMENTS'
  return {
    classification,
    issues,
    totalCents: total,
    cachedCents: cached,
    recordedCents: recorded,
    // What a backfill would record: one OPENING for the unrecorded amount, only when clean.
    backfillCents: classification === 'LEGACY_UNRECORDED' && !issues.length ? cached : 0,
  }
}
