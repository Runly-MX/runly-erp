import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerNavigationGuard, guardNavigation, commitNavigation } from '../navigation-guard.js'

test('navigation is synchronous outside an opted-in editor; cancel, confirm, cleanup and committed copy', () => {
  let navigated = 0, pending
  const action = () => navigated++
  assert.equal(guardNavigation(action), true); assert.equal(navigated, 1)
  const cleanup = registerNavigationGuard(next => { pending = next })
  assert.equal(guardNavigation(action), false); assert.equal(navigated, 1)
  pending = null // Cancel must not execute navigation.
  assert.equal(navigated, 1)
  guardNavigation(action); commitNavigation(pending); assert.equal(navigated, 2)
  commitNavigation(() => guardNavigation(action)); assert.equal(navigated, 3)
  cleanup(); assert.equal(guardNavigation(action), true); assert.equal(navigated, 4)
})
