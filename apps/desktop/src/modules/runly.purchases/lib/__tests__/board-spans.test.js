import test from 'node:test'
import assert from 'node:assert/strict'
import { boardSpans } from '../board-spans.js'

test('first small panel sits beside the wide one, the rest share a row', () => {
  assert.deepEqual(boardSpans(4), ['xl:col-span-4', 'xl:col-span-4', 'xl:col-span-4', 'xl:col-span-4'])
  assert.deepEqual(boardSpans(3), ['xl:col-span-4', 'xl:col-span-6', 'lg:col-span-2 xl:col-span-6'])
})

test('a lone small panel fills the wide panel row remainder', () => {
  assert.deepEqual(boardSpans(1), ['lg:col-span-2 xl:col-span-4'])
  assert.deepEqual(boardSpans(2), ['xl:col-span-4', 'xl:col-span-12'])
})
