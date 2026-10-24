import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REFERENCE_TYPES, referenceTypeOf } from '../entityReferenceTypes.js'

const API_KEYS = ['contact', 'hr_employee', 'vehicle', 'inventory_item', 'project', 'task', 'calendar_event', 'ledger_account', 'file']

test('registry covers exactly the API relation target keys', () => {
  assert.deepEqual([...REFERENCE_TYPES.map((t) => t.value)].sort(), [...API_KEYS].sort())
})

test('every type is unique and has a label and an icon', () => {
  assert.equal(new Set(REFERENCE_TYPES.map((t) => t.value)).size, REFERENCE_TYPES.length)
  for (const type of REFERENCE_TYPES) {
    assert.ok(type.label)
    assert.ok(type.Icon)
  }
})

test('referenceTypeOf returns null for unknown values', () => {
  assert.equal(referenceTypeOf('contact').label, 'Contacto')
  assert.equal(referenceTypeOf('nope'), null)
})
