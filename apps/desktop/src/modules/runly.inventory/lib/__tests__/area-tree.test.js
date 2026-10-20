import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAreaTree, flattenAreaTree, descendantIds, areaPathLabel, canWriteAreaRole } from '../area-tree.js'

const areas = [
  { id: 'c', parentId: 'b', name: 'Hoja' },
  { id: 'a', parentId: null, name: 'Zeta' },
  { id: 'b', parentId: 'a', name: 'Medio' },
  { id: 'x', parentId: 'hidden', name: 'Alfa' },
]

test('builds a sorted forest and treats areas with an invisible parent as roots', () => {
  const tree = buildAreaTree(areas)
  assert.deepEqual(tree.map((n) => n.id), ['x', 'a'])
  assert.deepEqual(flattenAreaTree(tree).map((n) => [n.id, n.depth]), [['x', 0], ['a', 0], ['b', 1], ['c', 2]])
})

test('descendantIds and path label', () => {
  assert.deepEqual([...descendantIds(areas, 'a')].sort(), ['a', 'b', 'c'])
  assert.equal(areaPathLabel(areas, 'c'), 'Zeta / Medio / Hoja')
})

test('write roles', () => {
  assert.equal(canWriteAreaRole('viewer'), false)
  assert.equal(canWriteAreaRole('editor'), true)
})

test('filter and write options', async () => {
  const { areaFilterOptions, areaWriteOptions } = await import('../area-tree.js')
  assert.deepEqual(areaFilterOptions([]), [])
  assert.deepEqual(areaFilterOptions(areas).map((o) => o.value), ['__none__', 'x', 'a', 'b', 'c'])
  const withRoles = [{ id: 'a', parentId: null, name: 'A', role: 'viewer' }, { id: 'b', parentId: 'a', name: 'B', role: 'editor' }]
  assert.deepEqual(areaWriteOptions(withRoles, { requireArea: true }).map((o) => o.value), ['b'])
  assert.deepEqual(areaWriteOptions(withRoles).map((o) => o.value), ['__none__', 'b'])
})
