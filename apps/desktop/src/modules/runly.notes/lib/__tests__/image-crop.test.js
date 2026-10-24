import test from 'node:test'
import assert from 'node:assert/strict'
import { cropToViewBox, normalizeRotation, effectiveNaturalSize } from '../imageCrop.js'

test('cropToViewBox: null -> full viewBox', () => {
  assert.equal(cropToViewBox(null), '0 0 1000 1000')
})

test('cropToViewBox: windows into the crop rect (x1000)', () => {
  assert.equal(cropToViewBox({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }), '100 200 500 400')
})

test('normalizeRotation: snaps to the nearest 90 and wraps into [0,360)', () => {
  assert.equal(normalizeRotation(0), 0)
  assert.equal(normalizeRotation(90), 90)
  assert.equal(normalizeRotation(360), 0)
  assert.equal(normalizeRotation(-90), 270)
  assert.equal(normalizeRotation(450), 90)
})

test('effectiveNaturalSize: swaps w/h for 90 and 270, not for 0 or 180', () => {
  const nat = { w: 2000, h: 1000 }
  assert.deepEqual(effectiveNaturalSize(nat, 0), { w: 2000, h: 1000 })
  assert.deepEqual(effectiveNaturalSize(nat, 90), { w: 1000, h: 2000 })
  assert.deepEqual(effectiveNaturalSize(nat, 180), { w: 2000, h: 1000 })
  assert.deepEqual(effectiveNaturalSize(nat, 270), { w: 1000, h: 2000 })
  assert.equal(effectiveNaturalSize(null, 90), null)
})

function assertPointClose(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `x: ${actual.x} !~ ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `y: ${actual.y} !~ ${expected.y}`)
}
