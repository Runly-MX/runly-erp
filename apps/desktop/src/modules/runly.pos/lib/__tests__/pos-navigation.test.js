import test from 'node:test'
import assert from 'node:assert/strict'
import { filterPosNavigation } from '../posNavigation.js'

const module = {
  key: 'runly.pos',
  navigation: ['caja', 'comandero', 'cocina', 'orders', 'admin'].map((p) => ({ path: `/app/m/runly.pos/pos/${p}` })),
}
const names = (m) => m.navigation.map((n) => n.path.split('/').pop())

test('a retail-only business does not see Comandero or Cocina', () => {
  assert.deepEqual(names(filterPosNavigation(module, ['RETAIL'])), ['caja', 'orders', 'admin'])
})

test('restaurant and mixed businesses keep every entry', () => {
  assert.equal(filterPosNavigation(module, ['RETAIL', 'HYBRID']), module)
  assert.equal(filterPosNavigation(module, ['RESTAURANT']), module)
})

test('unknown modes and other modules are never filtered', () => {
  assert.equal(filterPosNavigation(module, null), module)
  assert.equal(filterPosNavigation(module, []), module)
  const other = { key: 'runly.crm', navigation: [] }
  assert.equal(filterPosNavigation(other, ['RETAIL']), other)
})
