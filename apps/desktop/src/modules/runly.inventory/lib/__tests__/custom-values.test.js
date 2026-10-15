import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filledCustomValues } from '../custom-values.js'

const f = (fieldType) => ({ id: 'f', label: 'F', fieldType })

test('filledCustomValues keeps only fields with a value', () => {
  const rows = [
    { field: f('text'), value: 'x' },
    { field: f('text'), value: '' },
    { field: f('text'), value: '   ' },
    { field: f('text'), value: null },
    { field: f('boolean'), value: 'false' },
    { field: f('boolean'), value: 'true' },
    { field: f('number'), value: '0' },
    { value: 'orphan' },
  ]
  assert.deepEqual(filledCustomValues(rows).map((r) => r.value), ['x', 'true', '0'])
  assert.deepEqual(filledCustomValues(undefined), [])
})
