import test from 'node:test'
import assert from 'node:assert/strict'
import { splitPinned, applyClientFilters } from '../notesView.js'

const notes = [
  { id: '1', is_pinned: true, note_type: 'document', background_color: null, content: '<p>a</p>' },
  { id: '2', is_pinned: false, note_type: 'canvas', background_color: '#fefce8', content: '' },
  { id: '3', is_pinned: false, note_type: 'document', background_color: null, content: '<img src="x"><ul data-type="taskList"><li data-type="taskItem"></li></ul>' },
]

test('splitPinned separates pinned from the rest preserving order', () => {
  const { pinned, others } = splitPinned(notes)
  assert.deepEqual(pinned.map(n => n.id), ['1'])
  assert.deepEqual(others.map(n => n.id), ['2', '3'])
})

test('applyClientFilters by type, color, image and checklist', () => {
  assert.deepEqual(applyClientFilters(notes, { type: 'canvas' }).map(n => n.id), ['2'])
  assert.deepEqual(applyClientFilters(notes, { color: '#fefce8' }).map(n => n.id), ['2'])
  assert.deepEqual(applyClientFilters(notes, { hasImage: true }).map(n => n.id), ['3'])
  assert.deepEqual(applyClientFilters(notes, { hasChecklist: true }).map(n => n.id), ['3'])
  assert.equal(applyClientFilters(notes, {}).length, 3)
})
