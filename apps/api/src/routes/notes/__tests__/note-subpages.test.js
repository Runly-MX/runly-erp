import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_DEPTH, exceedsDepth, isUuid } from '../subpages.js'

test('parents at depth 1 and 2 allow a child, depth 3 does not', () => {
  assert.equal(MAX_DEPTH, 3)
  assert.equal(exceedsDepth(1), false)
  assert.equal(exceedsDepth(2), false)
  assert.equal(exceedsDepth(3), true)
  assert.equal(exceedsDepth(4), true)
})

test('isUuid accepts UUIDs only', () => {
  assert.equal(isUuid('0195a000-0000-7000-8000-000000000001'), true)
  assert.equal(isUuid('abc'), false)
  assert.equal(isUuid(null), false)
})
