import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPageWindow } from '../page-window.js'

test('short ranges list every page', () => {
  assert.deepEqual(buildPageWindow(0, 0), [])
  assert.deepEqual(buildPageWindow(0, 1), [1])
  assert.deepEqual(buildPageWindow(2, 5, 1), [1, 2, 3, 4, 5])
})

test('far from the edges both sides get a gap', () => {
  assert.deepEqual(buildPageWindow(5, 20, 1), [1, 'gap', 5, 6, 7, 'gap', 20])
  assert.deepEqual(buildPageWindow(9, 20, 2), [1, 'gap', 8, 9, 10, 11, 12, 'gap', 20])
})

test('near an edge only the far side has a gap', () => {
  assert.deepEqual(buildPageWindow(0, 20, 1), [1, 2, 'gap', 20])
  assert.deepEqual(buildPageWindow(19, 20, 1), [1, 'gap', 19, 20])
})

test('a gap that would hide one page shows that page', () => {
  assert.deepEqual(buildPageWindow(3, 10, 1), [1, 2, 3, 4, 5, 'gap', 10])
  assert.deepEqual(buildPageWindow(6, 10, 1), [1, 'gap', 6, 7, 8, 9, 10])
})

test('out-of-range current page is clamped', () => {
  assert.deepEqual(buildPageWindow(99, 6, 1), [1, 'gap', 5, 6])
})
