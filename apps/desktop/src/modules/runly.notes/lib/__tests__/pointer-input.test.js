import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldDraw } from '../pointerInput.js'

test('pen and mouse draw, touch does not when a pen has been seen', () => {
  assert.equal(shouldDraw({ pointerType: 'pen' }, { penSeen: false }), true)
  assert.equal(shouldDraw({ pointerType: 'mouse' }, { penSeen: false }), true)
  assert.equal(shouldDraw({ pointerType: 'touch' }, { penSeen: false }), true)
  assert.equal(shouldDraw({ pointerType: 'touch' }, { penSeen: true }), false)
})

test('touch drawing disabled explicitly', () => {
  assert.equal(shouldDraw({ pointerType: 'touch' }, { penSeen: false, touchDraws: false }), false)
})
