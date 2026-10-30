import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeLine, computeTotals, linesToPayload, pendingQuantity } from '../document-math.js'

test('computeLine rounds subtotal and tax to cents', () => {
  assert.deepEqual(computeLine({ quantity: 3, unitAmount: 10.333, taxRate: 0.16 }), { subtotal: 31, taxAmount: 4.96, total: 35.96 })
})

test('computeTotals groups taxes by rate and flags goods', () => {
  const totals = computeTotals([
    { quantity: 2, unitAmount: 100, taxRate: '0.16', itemKind: 'SERVICE' },
    { quantity: 1, unitAmount: 50, taxRate: '0', itemKind: 'GOODS' },
    { quantity: 1, unitAmount: 100, taxRate: '0.16', itemKind: 'SERVICE' },
  ])
  assert.equal(totals.subtotal, 350)
  assert.equal(totals.tax, 48)
  assert.equal(totals.total, 398)
  assert.deepEqual(totals.taxes, [{ rate: 0.16, amount: 48 }])
  assert.equal(totals.hasGoods, true)
})

test('linesToPayload drops blank lines and numbers the rest', () => {
  const payload = linesToPayload([{ description: '  ' }, { description: 'Laptop', quantity: '2', unitAmount: '10', taxRate: '0.16' }])
  assert.equal(payload.length, 1)
  assert.equal(payload[0].sortOrder, 0)
  assert.equal(payload[0].quantity, 2)
  assert.equal(payload[0].total, 23.2)
})

test('pendingQuantity never goes negative', () => {
  assert.equal(pendingQuantity({ quantity: 5, receivedQuantity: 2 }), 3)
  assert.equal(pendingQuantity({ quantity: 1, receivedQuantity: 4 }), 0)
})

test('formatDate keeps calendar dates and shows timestamps as their local day', async () => {
  const { formatDate } = await import('../format.js')
  assert.match(formatDate('2026-10-29'), /^29 oct 2026$/)
  // A late-evening timestamp in Mexico City (03:30 UTC next day) stays on its local day.
  const previous = process.env.RUNLY_TIME_ZONE
  process.env.RUNLY_TIME_ZONE = 'America/Mexico_City'
  try {
    assert.match(formatDate('2026-10-30T03:30:00.000Z'), /^29 oct 2026$/)
  } finally {
    if (previous === undefined) delete process.env.RUNLY_TIME_ZONE
    else process.env.RUNLY_TIME_ZONE = previous
  }
})
