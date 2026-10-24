import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { flattenPages, hasMore } from '../notesPages.js'

describe('flattenPages', () => {
  it('concatenates pages and de-duplicates by id', () => {
    const pages = [{ notes: [{ id: 'a' }, { id: 'b' }] }, { notes: [{ id: 'b' }, { id: 'c' }] }]
    assert.deepEqual(flattenPages(pages).map((n) => n.id), ['a', 'b', 'c'])
  })
  it('handles missing input', () => {
    assert.deepEqual(flattenPages(undefined), [])
    assert.deepEqual(flattenPages([{}]), [])
  })
})

describe('hasMore', () => {
  it('is true only for an exactly full page', () => {
    assert.equal(hasMore({ notes: [1, 2, 3] }, 3), true)
    assert.equal(hasMore({ notes: [1, 2] }, 3), false)
    assert.equal(hasMore({ notes: [] }, 3), false)
    assert.equal(hasMore(undefined, 3), false)
  })
})
