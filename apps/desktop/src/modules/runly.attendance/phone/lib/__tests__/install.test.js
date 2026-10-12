import test from 'node:test'
import assert from 'node:assert/strict'
import { isIosSafari, isStandalone } from '../install.js'

test('isIosSafari detects iOS Safari only', () => {
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
  assert.equal(isIosSafari(safari, 5), true)
  assert.equal(isIosSafari(safari.replace('Version/17.0', 'CriOS/120'), 5), false)
  assert.equal(isIosSafari('Mozilla/5.0 (Linux; Android 14) Chrome/120', 5), false)
})

test('isStandalone reads display-mode and navigator.standalone', () => {
  assert.equal(isStandalone({ matchMedia: () => ({ matches: true }), navigator: {} }), true)
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true)
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} }), false)
})
