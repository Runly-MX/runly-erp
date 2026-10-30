// Read-only summaries the orders list shows per row: how far reception went
// and which invoices bill the order. Pure functions over rows the listing
// loads in batch for the whole page (see purchase-listing.js).
import { orderReceiptState } from './purchase-policies.js'
import { dateKey, num } from './purchases-shared.js'

const round = value => Math.round(value * 10000) / 10000
const money = value => Math.round(value * 100) / 100
const unitKey = unit => String(unit ?? '').trim().toLowerCase()

// lines: the order's purchase_line rows (receivedQuantity is already net of
// receipt reversals). Quantities are added up only when every goods line
// uses the same unit; otherwise progress is counted in lines.
export function receiptSummary(order, lines = [], reversals = 0) {
  const { state, label } = orderReceiptState(order, lines)
  const goods = lines.filter(line => (line.itemKind ?? 'GOODS') === 'GOODS')
  const completeLines = goods.filter(line => num(line.receivedQuantity) + 1e-9 >= num(line.quantity)).length
  const sameUnit = goods.length > 0 && new Set(goods.map(line => unitKey(line.unit))).size === 1
  return {
    state, label,
    goodsLines: goods.length,
    completeLines,
    serviceLines: lines.length - goods.length,
    quantity: sameUnit
      ? { unit: String(goods[0].unit ?? '').trim() || null, received: round(goods.reduce((sum, line) => sum + num(line.receivedQuantity), 0)), ordered: round(goods.reduce((sum, line) => sum + num(line.quantity), 0)) }
      : null,
    reversals,
  }
}

const OPEN = new Set(['PENDING', 'PARTIALLY_PAID'])
const CAPTURE = new Set(['DRAFT', 'PENDING_APPROVAL'])

// invoices: every invoice billing the order (one order can have several).
// Cancelled ones are counted apart and never added to amounts; amounts are
// grouped by currency, never mixed.
export function billingSummary(invoices = [], today) {
  const live = invoices.filter(invoice => invoice.status !== 'CANCELLED')
  const byCurrency = new Map()
  for (const invoice of live) {
    const key = invoice.currency ?? 'MXN'
    const entry = byCurrency.get(key) ?? { currency: key, total: 0, paid: 0 }
    entry.total += num(invoice.total)
    entry.paid += num(invoice.paidAmount)
    byCurrency.set(key, entry)
  }
  const amounts = [...byCurrency.values()].map(entry => ({ currency: entry.currency, total: money(entry.total), paid: money(entry.paid), balance: money(Math.max(0, entry.total - entry.paid)) }))
  const overdue = live.filter(invoice => OPEN.has(invoice.status) && invoice.dueDate && dateKey(invoice.dueDate) < today).length
  let state = 'NONE'
  if (live.length) {
    if (live.every(invoice => invoice.status === 'PAID')) state = 'PAID'
    else if (live.every(invoice => CAPTURE.has(invoice.status))) state = 'CAPTURE'
    else state = overdue ? 'OVERDUE' : 'OPEN'
  }
  return {
    state,
    count: live.length,
    cancelled: invoices.length - live.length,
    invoices: live.slice(0, 3).map(invoice => ({ id: invoice.id, number: invoice.number ?? null, status: invoice.status })),
    amounts,
    overdue,
  }
}
