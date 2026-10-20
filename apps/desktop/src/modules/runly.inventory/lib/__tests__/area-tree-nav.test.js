import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAreaTree } from '../area-tree.js'
import { ancestorAreaIds, treeKeyAction, visibleTreeRows } from '../area-tree-nav.js'

const areas = [
  { id: 'a', parentId: null, name: 'A' },
  { id: 'b', parentId: 'a', name: 'B' },
  { id: 'c', parentId: 'b', name: 'C' },
  { id: 'd', parentId: null, name: 'D' },
]
const tree = buildAreaTree(areas)

test('visible rows start with Todas and General and hide collapsed children', () => {
  assert.deepEqual(visibleTreeRows(tree, new Set()).map((r) => r.value), ['', '__none__', 'a', 'd'])
  assert.deepEqual(visibleTreeRows(tree, new Set(['a'])).map((r) => r.value), ['', '__none__', 'a', 'b', 'd'])
})

test('ancestorAreaIds lists parents nearest first', () => {
  assert.deepEqual(ancestorAreaIds(areas, 'c'), ['b', 'a'])
  assert.deepEqual(ancestorAreaIds(areas, 'a'), [])
})

test('keyboard model: arrows move, left/right collapse and expand', () => {
  const collapsed = visibleTreeRows(tree, new Set())
  assert.deepEqual(treeKeyAction(collapsed, 'a', 'ArrowRight'), { toggle: 'expand' })
  assert.deepEqual(treeKeyAction(collapsed, 'a', 'ArrowDown'), { focus: 'd' })
  const open = visibleTreeRows(tree, new Set(['a']))
  assert.deepEqual(treeKeyAction(open, 'a', 'ArrowRight'), { focus: 'b' })
  assert.deepEqual(treeKeyAction(open, 'a', 'ArrowLeft'), { toggle: 'collapse' })
  assert.deepEqual(treeKeyAction(open, 'b', 'ArrowLeft'), { focus: 'a' })
  assert.deepEqual(treeKeyAction(open, 'd', 'End'), { focus: 'd' })
  assert.deepEqual(treeKeyAction(open, 'd', 'Enter'), { select: true })
})
