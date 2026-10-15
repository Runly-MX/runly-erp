import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampWidth, COLUMN_MIN_WIDTH, COLUMN_MAX_WIDTH } from '../useColumnResize.js'

test('clampWidth keeps widths between the minimum and maximum', () => {
  assert.equal(clampWidth(10), COLUMN_MIN_WIDTH)
  assert.equal(clampWidth(5000), COLUMN_MAX_WIDTH)
  assert.equal(clampWidth(200.4), 200)
  assert.equal(clampWidth(20, 30, 100), 30)
})
