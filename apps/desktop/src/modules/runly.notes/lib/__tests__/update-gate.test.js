import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { createUpdateGate } from '../updateGate.js'

function makeUpdate(text) {
  const doc = new Y.Doc()
  doc.getText('t').insert(0, text)
  return Y.encodeStateAsUpdate(doc)
}

test('applies immediately when not composing', () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u))
  gate.push(makeUpdate('a'))
  assert.equal(applied.length, 1)
})

test('holds updates while composing and applies one merged update on end', () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u))
  gate.setComposing(true)
  gate.push(makeUpdate('a'))
  gate.push(makeUpdate('b'))
  assert.equal(applied.length, 0)
  gate.setComposing(false)
  assert.equal(applied.length, 1)
  const doc = new Y.Doc()
  Y.applyUpdate(doc, applied[0])
  assert.equal(doc.getText('t').length > 0, true)
})

test('safety timeout releases held updates if compositionend never arrives', async () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u), { maxHoldMs: 20 })
  gate.setComposing(true)
  gate.push(makeUpdate('a'))
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(applied.length, 1)
  assert.equal(gate.composing, false)
})

test('destroy drops held updates and clears the timer', () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u), { maxHoldMs: 20 })
  gate.setComposing(true)
  gate.push(makeUpdate('a'))
  gate.destroy()
  assert.equal(applied.length, 0)
})
