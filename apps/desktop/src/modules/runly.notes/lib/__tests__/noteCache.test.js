import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { patchNoteInCache, toNoteRowPatch } from '../noteCache.js'

describe('patchNoteInCache', () => {
  it('patches the detail query and every list that contains the note', () => {
    const qc = new QueryClient()
    qc.setQueryData(['notes', 'n1'], { note: { id: 'n1', title: 'a', icon: '' } })
    qc.setQueryData(['notes', { view: 'all' }], { notes: [{ id: 'n1', title: 'a' }, { id: 'n2', title: 'b' }] })
    qc.setQueryData(['notes', 'tags'], { tags: [{ id: 't1' }] })

    patchNoteInCache(qc, 'n1', { title: 'nuevo', icon: 'lightbulb', coverUrl: null })

    assert.deepEqual(qc.getQueryData(['notes', 'n1']).note, { id: 'n1', title: 'nuevo', icon: 'lightbulb', cover_url: null })
    assert.deepEqual(qc.getQueryData(['notes', { view: 'all' }]).notes.map((n) => n.title), ['nuevo', 'b'])
    assert.deepEqual(qc.getQueryData(['notes', 'tags']), { tags: [{ id: 't1' }] })
  })

  it('patches infinite list pages', () => {
    const qc = new QueryClient()
    qc.setQueryData(['notes', 'infinite', {}], {
      pages: [{ notes: [{ id: 'a', title: 'x' }] }, { notes: [{ id: 'n1', title: 'a' }] }],
      pageParams: [1, 2],
    })
    patchNoteInCache(qc, 'n1', { title: 'nuevo' })
    const data = qc.getQueryData(['notes', 'infinite', {}])
    assert.equal(data.pages[1].notes[0].title, 'nuevo')
    assert.equal(data.pages[0].notes[0].title, 'x')
    assert.deepEqual(data.pageParams, [1, 2])
  })

  it('maps camelCase API fields to note row fields', () => {
    assert.deepEqual(toNoteRowPatch({ backgroundColor: '#fff', title: 'x' }), { background_color: '#fff', title: 'x' })
  })
})
