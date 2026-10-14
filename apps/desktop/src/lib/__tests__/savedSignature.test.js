import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSavedSignature } from '../savedSignature.js'

test('parseSavedSignature unwraps { signature } and null', () => {
  assert.equal(parseSavedSignature({ signature: null }), null)
  assert.equal(parseSavedSignature(undefined), null)
  assert.deepEqual(parseSavedSignature({ signature: { url: 'u', allowDelegation: 1 } }), { url: 'u', allowDelegation: true, updatedAt: null })
})
