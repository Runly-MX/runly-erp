import test from 'node:test'
import assert from 'node:assert/strict'
import { nextSelectedNote } from '../stableNoteIdentity.js'

const base = { id: 'n1', title: 'A', icon: '', cover_url: null, updated_at: '1', content: '<p>a</p>' }

test('keeps previous object when only updated_at/content change', () => {
  const next = nextSelectedNote(base, { ...base, updated_at: '2', content: '<p>ab</p>' })
  assert.equal(next, base)
})

test('takes incoming when a relevant field changes', () => {
  const incoming = { ...base, cover_url: 'x' }
  assert.equal(nextSelectedNote(base, incoming), incoming)
})

test('takes incoming when the note id changes', () => {
  const incoming = { ...base, id: 'n2' }
  assert.equal(nextSelectedNote(base, incoming), incoming)
})
