import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAllocations, dispatchSequenceOf, elapsedLabel, lineStage, splitStages } from '../restaurantRules.js'

test('lineStage separates unsent lines from kitchen states', () => {
  assert.equal(lineStage({ dispatchedAt: null, kitchenStatus: 'PENDING' }), 'draft')
  assert.equal(lineStage({ dispatchedAt: 'x', kitchenStatus: 'PENDING' }), 'sent')
  assert.equal(lineStage({ dispatchedAt: 'x', kitchenStatus: 'IN_PREPARATION' }), 'preparing')
  assert.equal(lineStage({ dispatchedAt: 'x', kitchenStatus: 'READY' }), 'ready')
  assert.equal(lineStage({ dispatchedAt: 'x', kitchenStatus: 'DELIVERED' }), 'delivered')
})

test('splitStages ignores voided lines', () => {
  const order = { lines: [{ id: 'a', dispatchedAt: null }, { id: 'b', dispatchedAt: 'x', kitchenStatus: 'PENDING' }, { id: 'c', voided: true }] }
  const { draft, sent } = splitStages(order)
  assert.deepEqual(draft.map((l) => l.id), ['a'])
  assert.deepEqual(sent.map((l) => l.id), ['b'])
})

test('buildAllocations subtracts what the server already attributed', () => {
  const lines = [{ id: 'a', totalAmount: '50.00' }, { id: 'b', totalAmount: '75.50' }, { id: 'c', totalAmount: '10.00' }]
  const result = buildAllocations(lines, [{ orderLineId: 'a', amount: '50.00' }, { orderLineId: 'b', amount: '25.50' }])
  assert.deepEqual(result.allocations, [{ orderLineId: 'b', amount: '50.00' }, { orderLineId: 'c', amount: '10.00' }])
  assert.equal(result.amount, '60.00')
})

test('dispatchSequenceOf matches the order dispatch history', () => {
  const order = { dispatches: [{ sequence: 1, dispatchedAt: '2026-11-01T18:00:00.000Z' }, { sequence: 2, dispatchedAt: '2026-11-01T18:10:00.000Z' }] }
  assert.equal(dispatchSequenceOf(order, { dispatchedAt: '2026-11-01T18:10:00.000Z' }), 2)
  assert.equal(dispatchSequenceOf(order, { dispatchedAt: null }), null)
})

test('elapsedLabel is compact', () => {
  const now = Date.parse('2026-11-01T20:00:00Z')
  assert.equal(elapsedLabel('2026-11-01T19:55:00Z', now), '5 min')
  assert.equal(elapsedLabel('2026-11-01T18:55:00Z', now), '1 h 05 min')
})
