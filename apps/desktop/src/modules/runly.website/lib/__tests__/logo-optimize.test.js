import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitSize, formatBytes, visibleBounds } from '../logoOptimize.js'

test('visibleBounds finds the opaque area and ignores transparent margins', () => {
  const width = 6, height = 4
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of [[2, 1], [3, 2]]) data[(y * width + x) * 4 + 3] = 255
  assert.deepEqual(visibleBounds(data, width, height), { x: 2, y: 1, width: 2, height: 2 })
  assert.equal(visibleBounds(new Uint8ClampedArray(width * height * 4), width, height), null)
})

test('fitSize never enlarges rasters, scales vectors to the box and keeps the ratio', () => {
  assert.deepEqual(fitSize(200, 50), { width: 200, height: 50 })
  assert.deepEqual(fitSize(2000, 400), { width: 512, height: 102 })
  assert.deepEqual(fitSize(100, 100, { vector: true }), { width: 128, height: 128 })
})

test('formatBytes uses readable units', () => {
  assert.equal(formatBytes(900), '900 B')
  assert.equal(formatBytes(20480), '20 KB')
  assert.equal(formatBytes(1572864), '1.5 MB')
})
