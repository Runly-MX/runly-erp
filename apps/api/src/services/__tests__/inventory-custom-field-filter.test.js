import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInventoryWhere, parseCustomFieldFilter } from '../inventory-query.js'

const FIELD = '0198f1f2-0000-7000-8000-000000000001'

test('customField se separa en campo y valor', () => {
  assert.deepEqual(parseCustomFieldFilter(`${FIELD}::Rojo :: mate`), { fieldId: FIELD, value: 'Rojo :: mate' })
  assert.equal(parseCustomFieldFilter('sin-separador'), null)
  assert.equal(parseCustomFieldFilter('no-uuid::x'), null)
  assert.equal(parseCustomFieldFilter(`${FIELD}::  `), null)
})

test('el filtro de campo personalizado compara el valor exacto sin importar mayúsculas', () => {
  const where = buildInventoryWhere('c', { customField: `${FIELD}::Rojo` })
  assert.deepEqual(where.AND[0], { customValues: { some: { fieldId: FIELD, value: { equals: 'Rojo', mode: 'insensitive' } } } })
})
