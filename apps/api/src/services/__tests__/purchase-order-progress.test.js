import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billingSummary, receiptSummary } from '../purchase-order-progress.js'
import { createPurchaseListing } from '../purchase-listing.js'

const line = (quantity, receivedQuantity, unit = 'pza', itemKind = 'GOODS') => ({ quantity, receivedQuantity, unit, itemKind })

test('reception: partial progress counted in lines; quantities only when every goods line shares a unit', () => {
  const mixed = receiptSummary({ status: 'PARTIALLY_RECEIVED' }, [line(20, 20, 'pza'), line(40, 25, 'tramo'), line(1, 0, 'servicio', 'SERVICE')], 1)
  assert.deepEqual(mixed, { state: 'PARTIAL', label: mixed.label, goodsLines: 2, completeLines: 1, serviceLines: 1, quantity: null, reversals: 1 })
  const same = receiptSummary({ status: 'PARTIALLY_RECEIVED' }, [line(20, 20, 'Pza'), line(10, 5, ' pza ')])
  assert.deepEqual(same.quantity, { unit: 'Pza', received: 25, ordered: 30 })
})

test('reception: services only, cancelled, closed short and not issued', () => {
  assert.equal(receiptSummary({ status: 'ISSUED' }, [line(1, 0, null, 'SERVICE')]).state, 'NOT_APPLICABLE')
  assert.equal(receiptSummary({ status: 'CANCELLED' }, [line(5, 0)]).state, 'CANCELLED')
  assert.equal(receiptSummary({ status: 'CLOSED' }, [line(5, 3)]).state, 'CLOSED_SHORT')
  assert.equal(receiptSummary({ status: 'APPROVED' }, [line(5, 0)]).state, 'NOT_ISSUED')
})

test('billing: several invoices per order, cancelled apart, currencies never mixed', () => {
  const summary = billingSummary([
    { id: 'a', number: 'FAC-1', status: 'PAID', total: 100, paidAmount: 100, currency: 'MXN' },
    { id: 'b', number: 'FAC-2', status: 'PARTIALLY_PAID', total: 50, paidAmount: 20, currency: 'MXN', dueDate: '2026-10-01' },
    { id: 'c', number: 'INV-3', status: 'PENDING', total: 10, paidAmount: 0, currency: 'USD', dueDate: '2026-12-01' },
    { id: 'd', number: 'FAC-4', status: 'CANCELLED', total: 999, paidAmount: 0, currency: 'MXN' },
  ], '2026-10-30')
  assert.equal(summary.count, 3); assert.equal(summary.cancelled, 1); assert.equal(summary.overdue, 1); assert.equal(summary.state, 'OVERDUE')
  assert.deepEqual(summary.amounts, [{ currency: 'MXN', total: 150, paid: 120, balance: 30 }, { currency: 'USD', total: 10, paid: 0, balance: 10 }])
  assert.deepEqual(summary.invoices.map(i => i.number), ['FAC-1', 'FAC-2', 'INV-3'])
  assert.equal(billingSummary([], '2026-10-30').state, 'NONE')
  assert.equal(billingSummary([{ status: 'PAID', total: 1, paidAmount: 1 }], '2026-10-30').state, 'PAID')
  assert.equal(billingSummary([{ status: 'DRAFT', total: 1, paidAmount: 0 }], '2026-10-30').state, 'CAPTURE')
})

function pagePrisma(orderCount) {
  const calls = []
  const orders = Array.from({ length: orderCount }, (_, i) => ({ id: `o${i}`, companyId: 'c', number: `OC-${i}`, status: 'PARTIALLY_RECEIVED', total: 10, currency: 'MXN', createdAt: new Date() }))
  const log = (name, fn) => async (args) => { calls.push(name); return fn(args) }
  return {
    calls,
    purchaseOrder: { findMany: log('orders', () => orders), count: log('count', () => orders.length) },
    contact: { findMany: log('contacts', () => []) },
    invItem: { findMany: log('items', () => []) },
    purchaseLine: { findMany: log('lines', ({ where }) => where.ownerId.in.flatMap(id => [{ ownerId: id, ...line(2, 1, 'pza') }])) },
    purchaseReceiptReversal: { groupBy: log('reversals', () => [{ orderId: 'o0', _count: { _all: 2 } }]) },
    purchaseInvoice: { findMany: log('invoices', () => [{ id: 'f1', number: 'FAC-1', status: 'PENDING', total: 5, paidAmount: 0, currency: 'MXN' }, { id: 'f2', number: 'FAC-2', status: 'PAID', total: 5, paidAmount: 5, currency: 'MXN' }]) },
    entityRelation: { findMany: async ({ where }) => { calls.push(where.sourceType === 'purchase_invoice' ? 'invoice-relations' : 'item-relations'); return where.sourceType === 'purchase_invoice' ? [{ sourceId: 'f1', targetId: 'o0' }, { sourceId: 'f2', targetId: 'o0' }] : [] } },
    $queryRaw: log('probe', () => [{ name: 'purchase_receipt_reversal' }]),
  }
}

test('orders list: progress for the whole page in a fixed number of queries (no N+1)', async () => {
  const small = pagePrisma(2), big = pagePrisma(25)
  await createPurchaseListing({ prisma: small }).list('orders', 'c', {})
  await createPurchaseListing({ prisma: big }).list('orders', 'c', {})
  assert.equal(big.calls.length, small.calls.length)
  const { data } = await createPurchaseListing({ prisma: pagePrisma(3) }).list('orders', 'c', {})
  assert.equal(data[0].receipt.state, 'PARTIAL'); assert.equal(data[0].receipt.reversals, 2)
  assert.deepEqual(data[0].billing.invoices.map(i => i.number), ['FAC-1', 'FAC-2'])
  assert.equal(data[1].billing.count, 0)
})

test('orders list: no invoice data without permission to read invoices', async () => {
  const prisma = pagePrisma(2)
  const { data } = await createPurchaseListing({ prisma }).list('orders', 'c', {}, { canRead: type => type !== 'purchase_invoice' })
  assert.ok(data.every(row => row.billing === null && row.receipt))
  assert.ok(!prisma.calls.includes('invoices') && !prisma.calls.includes('invoice-relations'))
})
