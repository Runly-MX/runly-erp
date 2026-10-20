import test from 'node:test'
import assert from 'node:assert/strict'
import { clampTreeWidth, keyboardTreeWidth, maxTreeWidth, TREE_DEFAULT } from '../area-tree-resize.js'

test('max width leaves the table minimum and stays within 200..420', () => {
  assert.equal(maxTreeWidth(1600), 420)
  assert.equal(maxTreeWidth(900), 404)
  assert.equal(maxTreeWidth(600), 200)
  assert.equal(maxTreeWidth(0), 420)
})

test('clamp respects dynamic max and falls back to default on garbage', () => {
  assert.equal(clampTreeWidth(900, 300), 300)
  assert.equal(clampTreeWidth(10), 200)
  assert.equal(clampTreeWidth('abc'), TREE_DEFAULT)
  assert.equal(clampTreeWidth(300, 150), 200)
})

test('keyboard steps, shift, home/end, enter', () => {
  assert.equal(keyboardTreeWidth(256, 'ArrowRight', false), 272)
  assert.equal(keyboardTreeWidth(256, 'ArrowLeft', true), 208)
  assert.equal(keyboardTreeWidth(210, 'ArrowLeft', true), 200)
  assert.equal(keyboardTreeWidth(256, 'Home', false), 200)
  assert.equal(keyboardTreeWidth(256, 'End', false, 350), 350)
  assert.equal(keyboardTreeWidth(300, 'Enter', false), 256)
  assert.equal(keyboardTreeWidth(300, 'a', false), null)
})
