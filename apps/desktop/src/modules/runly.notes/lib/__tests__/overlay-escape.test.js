import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldCloseOverlayOnEscape } from '../overlayEscape.js'

describe('shouldCloseOverlayOnEscape', () => {
  it('closes on a plain Escape', () => {
    assert.equal(shouldCloseOverlayOnEscape({ key: 'Escape' }), true)
  })
  it('ignores other keys', () => {
    assert.equal(shouldCloseOverlayOnEscape({ key: 'Enter' }), false)
  })
  it('yields to handled events, open dialogs, zen mode and IME composition', () => {
    assert.equal(shouldCloseOverlayOnEscape({ key: 'Escape', defaultPrevented: true }), false)
    assert.equal(shouldCloseOverlayOnEscape({ key: 'Escape', hasOpenDialog: true }), false)
    assert.equal(shouldCloseOverlayOnEscape({ key: 'Escape', zenMode: true }), false)
    assert.equal(shouldCloseOverlayOnEscape({ key: 'Escape', isComposing: true }), false)
  })
})
