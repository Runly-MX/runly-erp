import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildChips, clearAllPatch, countActiveFilters, isFilterActive, summarizeFilter,
} from '../components/filter-menu-helpers.js'
import { summarizeRange } from '../components/date-range-shared.js'

const filters = [
  { key: 'type', label: 'Tipo', options: [{ value: 'a', label: 'Alfa' }, { value: 'b', label: 'Beta' }] },
  { key: 'tags', label: 'Etiquetas', type: 'multiselect', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
  { key: 'flag', label: 'Marcadas', type: 'toggle' },
  { key: 'range', label: 'Fechas', type: 'daterange', fromKey: 'from', toKey: 'to' },
]

test('counts and detects active filters per type', () => {
  assert.equal(countActiveFilters(filters, {}), 0)
  const value = { type: 'a', tags: ['x', 'y'], flag: true, from: '2026-03-03', to: '' }
  assert.equal(countActiveFilters(filters, value), 4)
  assert.equal(isFilterActive(filters[1], { tags: [] }), false)
  assert.equal(isFilterActive(filters[2], { flag: false }), false)
})

test('summaries use option labels, counts and ranges', () => {
  assert.equal(summarizeFilter(filters[0], { type: 'b' }), 'Beta')
  assert.equal(summarizeFilter(filters[1], { tags: ['x', 'y'] }), 'X +1')
  assert.equal(summarizeFilter(filters[2], { flag: true }), 'Sí')
  assert.equal(summarizeFilter(filters[3], { from: '2026-03-03', to: '2026-04-09' }), '3 mar – 9 abr 2026')
  assert.equal(summarizeRange('2026-03-03', '2026-03-03'), '3 mar 2026')
  assert.equal(summarizeRange('', '2026-03-03'), 'Hasta 3 mar 2026')
})

test('chips and clear patch cover only the right keys', () => {
  const chips = buildChips(filters, { type: 'a', from: '2026-03-03', to: '2026-03-03' })
  assert.deepEqual(chips.map((c) => `${c.label}: ${c.text}`), ['Tipo: Alfa', 'Fechas: 3 mar 2026'])
  assert.deepEqual(chips[1].patch, { from: '', to: '' })
  assert.deepEqual(clearAllPatch(filters), { type: '', tags: [], flag: false, from: '', to: '' })
})

test('multiselect chips list every picked option and expose icons', () => {
  const Icon = () => null
  const spec = { key: 'tags', label: 'Etiquetas', type: 'multiselect', icon: Icon, options: [{ value: 'x', label: 'X', icon: Icon }, { value: 'y', label: 'Y' }] }
  const [two] = buildChips([spec], { tags: ['x', 'y'] })
  assert.equal(two.text, 'X, Y')
  assert.equal(two.optionIcon, null)
  const [one] = buildChips([spec], { tags: ['x'] })
  assert.equal(one.icon, Icon)
  assert.equal(one.optionIcon, Icon)
})
