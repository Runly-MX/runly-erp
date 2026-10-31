import test from 'node:test'
import assert from 'node:assert/strict'
import { bandColumns } from '../band-columns.js'

test('counters fit in one row when there is room', () => {
  assert.equal(bandColumns(7, 990), 7)
  assert.equal(bandColumns(4, 990), 4)
})

test('rows are balanced instead of leaving one lonely counter', () => {
  assert.equal(bandColumns(7, 600), 4) // fits 4: 4 + 3
  assert.equal(bandColumns(7, 830), 4) // fits 6, balanced to 4 + 3 instead of 6 + 1
  assert.equal(bandColumns(4, 300), 2)
  assert.equal(bandColumns(3, 100), 1)
})
