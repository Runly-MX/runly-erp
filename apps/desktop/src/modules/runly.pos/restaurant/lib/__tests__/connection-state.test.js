import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionState } from '../restaurantRules.js'

const base = { online: true, isError: false, hasData: true, isFetching: false, pending: 0 }

test('connection states are ordered by urgency', () => {
  assert.equal(connectionState(base), 'confirmed')
  assert.equal(connectionState({ ...base, isError: true }), 'stale')
  assert.equal(connectionState({ ...base, hasData: false, isFetching: true }), 'recovering')
  assert.equal(connectionState({ ...base, pending: 2, isError: true }), 'pending')
  assert.equal(connectionState({ ...base, online: false, pending: 2 }), 'offline')
})
