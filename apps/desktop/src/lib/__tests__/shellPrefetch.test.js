import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionAllowsPrefetch, resolveStrategy } from '../shellPrefetch.js'

test('connection policy: unknown connection data is not a veto, data saving and slow links are', () => {
  assert.equal(connectionAllowsPrefetch(undefined), true)
  assert.equal(connectionAllowsPrefetch({ effectiveType: '4g' }), true)
  assert.equal(connectionAllowsPrefetch({ effectiveType: '4g', saveData: true }), false)
  for (const slow of ['slow-2g', '2g', '3g']) assert.equal(connectionAllowsPrefetch({ effectiveType: slow }), false)
})

test('strategy: only known names override the default', () => {
  globalThis.window = { __runlyPrefetch: 'none' }
  assert.equal(resolveStrategy('adaptive'), 'none')
  globalThis.window = { __runlyPrefetch: '<script>' }
  assert.equal(resolveStrategy('adaptive'), 'adaptive')
  delete globalThis.window
})
