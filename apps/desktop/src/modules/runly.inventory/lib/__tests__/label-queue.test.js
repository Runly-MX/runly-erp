import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_QUANTITY, buildLabelsPath, clampQuantity, labelState, parseLabelsParams, queueReducer, statsFromHistory, toRenderItems, totalLabels,
} from '../label-queue.js'
import { moveField, presetFor, toggleField } from '../label-layout.js'

describe('label queue', () => {
  it('adds without duplicates and keeps quantities per row', () => {
    let q = queueReducer([], { type: 'add', items: [{ id: 'a', name: 'A' }, { id: 'b' }, { id: 'a' }] })
    assert.deepEqual(q.map((r) => r.id), ['a', 'b'])
    q = queueReducer(q, { type: 'add', items: [{ id: 'b' }] })
    assert.equal(q.length, 2)
    q = queueReducer(q, { type: 'quantity', id: 'a', quantity: '3' })
    assert.deepEqual(toRenderItems(q), [{ itemId: 'a', quantity: 3 }, { itemId: 'b', quantity: 1 }])
    assert.equal(totalLabels(q), 4)
  })
  it('applies one quantity to all rows, clamped to the API limits', () => {
    const q = queueReducer(queueReducer([], { type: 'add', items: [{ id: 'a' }, { id: 'b' }] }), { type: 'applyAll', quantity: 9999 })
    assert.ok(q.every((r) => r.quantity === MAX_QUANTITY))
    assert.equal(clampQuantity('0'), 1)
    assert.equal(clampQuantity('x'), 1)
    assert.equal(clampQuantity(2.7), 2)
  })
  it('merges label stats and removes rows', () => {
    let q = queueReducer([], { type: 'add', items: [{ id: 'a' }, { id: 'b' }], quantity: 2 })
    q = queueReducer(q, { type: 'stats', stats: { a: statsFromHistory([{ printedAt: '2026-10-01T10:00:00Z' }, {}]) } })
    assert.equal(q[0].labelPrintCount, 2)
    assert.equal(q[0].quantity, 2)
    assert.equal(queueReducer(q, { type: 'remove', id: 'a' }).length, 1)
  })
  it('describes label state', () => {
    assert.equal(labelState({}), null)
    assert.equal(labelState({ labelPrintCount: 0 }).text, 'Sin etiquetar')
    assert.equal(labelState({ labelPrintCount: 1 }).text, 'Etiquetada 1 vez')
    assert.equal(labelState({ labelPrintCount: 3 }).text, 'Etiquetada 3 veces')
  })
  it('round-trips the deep link', () => {
    const path = buildLabelsPath({ itemIds: ['a', 'b'], quantity: 2 })
    assert.deepEqual(parseLabelsParams(new URL(path, 'http://x').searchParams), { itemIds: ['a', 'b'], quantity: 2 })
    assert.deepEqual(parseLabelsParams(new URLSearchParams('')), { itemIds: [], quantity: 1 })
  })
})

describe('label layout draft', () => {
  it('detects presets and reorders fields', () => {
    assert.equal(presetFor(60, 40), '60x40')
    assert.equal(presetFor(61, 40), 'custom')
    assert.deepEqual(toggleField(['folio'], 'name'), ['folio', 'name'])
    assert.deepEqual(toggleField(['folio', 'name'], 'folio'), ['name'])
    assert.deepEqual(moveField(['folio', 'name', 'serial'], 'serial', -1), ['folio', 'serial', 'name'])
    assert.deepEqual(moveField(['folio', 'name'], 'folio', -1), ['folio', 'name'])
  })
})
