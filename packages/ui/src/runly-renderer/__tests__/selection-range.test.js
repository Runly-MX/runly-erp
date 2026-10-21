import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toggleWithRange } from '../selection-range.js'

const ids = ['a', 'b', 'c', 'd', 'e']

describe('toggleWithRange', () => {
  it('a plain click toggles only that row', () => {
    assert.deepEqual([...toggleWithRange({ selected: new Set(), ids, id: 'c' })], ['c'])
    assert.deepEqual([...toggleWithRange({ selected: new Set(['c']), ids, id: 'c' })], [])
  })
  it('shift-click selects everything between the anchor and the clicked row, in either direction', () => {
    assert.deepEqual([...toggleWithRange({ selected: new Set(['b']), ids, id: 'd', anchorId: 'b', shift: true })].sort(), ['b', 'c', 'd'])
    assert.deepEqual([...toggleWithRange({ selected: new Set(['d']), ids, id: 'b', anchorId: 'd', shift: true })].sort(), ['b', 'c', 'd'])
  })
  it('shift-click on a selected row unselects the range', () => {
    const selected = new Set(['a', 'b', 'c', 'd'])
    assert.deepEqual([...toggleWithRange({ selected, ids, id: 'c', anchorId: 'a', shift: true })], ['d'])
  })
  it('without a usable anchor shift behaves like a plain click', () => {
    assert.deepEqual([...toggleWithRange({ selected: new Set(), ids, id: 'c', shift: true })], ['c'])
    assert.deepEqual([...toggleWithRange({ selected: new Set(), ids, id: 'c', anchorId: 'gone', shift: true })], ['c'])
  })
})
