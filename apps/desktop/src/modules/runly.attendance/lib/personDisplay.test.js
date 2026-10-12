import test from 'node:test'
import assert from 'node:assert/strict'
import { enrichPerson, shiftHours } from './personDisplay.js'

const lookups = { rows: {
  groups: [{ id: 'g1', name: 'Planta' }], categories: [{ id: 'c1', name: 'Soldador' }],
  shifts: [{ id: 's1', name: 'Matutino', startTime: '08:00', endTime: '16:00' }],
} }

test('enrichPerson resolves names and shift hours', () => {
  const p = enrichPerson({ id: 1, groupId: 'g1', categoryId: 'c1', shiftId: 's1', hr: null }, lookups)
  assert.equal(p.groupName, 'Planta')
  assert.equal(p.categoryName, 'Soldador')
  assert.equal(p.shiftName, 'Matutino')
  assert.equal(p.shiftHours, '08:00–16:00')
  assert.equal(p.hrLinked, 'no')
})

test('enrichPerson yields empty strings before lookups load', () => {
  const p = enrichPerson({ id: 1, groupId: 'g1', enabled: false }, { rows: {} })
  assert.equal(p.groupName, '')
  assert.equal(p.statusKey, 'inactive')
  assert.equal(shiftHours(null), '')
})
