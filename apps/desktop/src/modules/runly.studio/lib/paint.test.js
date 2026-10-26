import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gradientPaint } from '../../../../../shared/studio/gradient.js'
import { GRADIENT_PRESETS, fillKind, freeOffset, paintCss, stopAt } from './paint.js'

const paint = { type: 'gradient', gradientType: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000', opacity: 1 }, { offset: 1, color: '#ffffff', opacity: 0 }] }

test('new stops interpolate color and opacity and never reuse an offset', () => {
  assert.deepEqual(stopAt(paint, 0.5), { offset: 0.5, color: '#808080', opacity: 0.5 })
  assert.equal(freeOffset(paint, 0.25), 0.25)
  assert.notEqual(freeOffset(paint, 1), 1)
  assert.equal(freeOffset(paint, 1, 1), 1)
})

test('previews map canonical angles to CSS and presets are valid paints', () => {
  assert.match(paintCss(paint), /^linear-gradient\(90deg, rgba\(0,0,0,1\) 0%, rgba\(255,255,255,0\) 100%\)$/)
  for (const preset of GRADIENT_PRESETS) assert.deepEqual(gradientPaint(preset.paint), preset.paint)
})

test('fill kind reads shape fill visibility before the paint type', () => {
  assert.equal(fillKind({ fill: '#000000' }), 'solid')
  assert.equal(fillKind({ fillPaint: paint }), 'gradient')
  assert.equal(fillKind({ fillPaint: paint, shape: { fillEnabled: false } }), 'none')
})
