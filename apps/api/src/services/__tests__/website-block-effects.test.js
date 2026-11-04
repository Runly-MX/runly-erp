import test from 'node:test'
import assert from 'node:assert/strict'
import { isEffectProp, isValidEffect } from '../website-block-effects.js'
import { normalizeWebsiteDocument } from '../website-draft-service.js'

test('accepts the values the editor stores', () => {
  assert.ok(isValidEffect('_animation', { preset: 'slide-up', duration: 600, delay: 100, easing: 'ease-out' }))
  assert.ok(isValidEffect('_hover', { scale: '1.05', shadow: 'md', brightness: 100, duration: 200, easing: 'ease' }))
  assert.ok(isValidEffect('_scrollReveal', true) && isValidEffect('_opacity', 0.5))
})

test('rejects unknown keys, bad enums and CSS-injection attempts', () => {
  assert.equal(isEffectProp('_evil'), false)
  assert.equal(isValidEffect('_animation', { preset: 'x; } body{display:none', duration: 1 }), false)
  assert.equal(isValidEffect('_hover', { scale: '1); } *{', shadow: '' }), false)
  assert.equal(isValidEffect('_hover', { shadow: 'lg', extra: 1 }), false)
  assert.equal(isValidEffect('_opacity', 2), false)
})

test('a draft document keeps effect props', () => {
  const doc = normalizeWebsiteDocument({ schemaVersion: 1, id: 'p', slug: '/', title: 'p', visibility: 'public', regions: { main: { id: 'r', children: ['a'] } }, blocks: { a: { id: 'a', type: 'HeadingBlock', props: { text: 'Hola', _animation: { preset: 'fade-in', duration: 600, delay: 0, easing: 'ease-out' } }, children: {} } } }, { strict: true })
  assert.equal(doc.blocks.a.props._animation.preset, 'fade-in')
})

test('accepts stagger, parallax, lazy and the new presets; rejects out-of-range values', () => {
  assert.ok(isValidEffect('_animation', { preset: 'blur-in', duration: 500, delay: 0, easing: 'ease' }))
  assert.ok(isValidEffect('_stagger', 120) && isValidEffect('_parallax', { speed: 0.3 }) && isValidEffect('_lazy', true))
  assert.equal(isValidEffect('_stagger', 5000), false)
  assert.equal(isValidEffect('_parallax', { speed: 3 }), false)
  assert.equal(isValidEffect('_lazyMinHeight', '240'), false)
})
