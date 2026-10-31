import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isEconomicInventoryField, projectInventoryEconomics } from '../inventory-economic-projection.js'

test('ordinary technical numbers remain visible in documentary inventory', () => {
  const fields = ['capacidad', 'potencia', 'cantidad', 'costado', 'taxonomia'].map(fieldKey => ({ fieldKey, fieldType: 'number' }))
  const item = { purchasePrice: 1500, customValues: fields.map(field => ({ field, value: '42' })) }
  const before = structuredClone(item)
  const projected = projectInventoryEconomics(item, 'DOCUMENTARY')
  for (const field of fields) assert.equal(isEconomicInventoryField(field), false)
  assert.deepEqual(projected.customValues.map(cv => cv.value), fields.map(() => '42'))
  assert.equal(projected.purchasePrice, null)
  assert.equal(projected.purchaseEconomicContext.numericCustomFieldsSuppressed, false)
  assert.deepEqual(item, before)
})

test('monetary types, explicit metadata and reliable economic identifiers stay hidden', () => {
  const fields = [
    { fieldType: 'currency' }, { fieldType: 'money' },
    { fieldType: 'number', options: { economic: true } },
    ...['precioCompra', 'unit_price', 'legacy_amount', 'costo_adquisicion', 'valorAdquisición'].map(fieldKey => ({ fieldKey, fieldType: 'number' })),
    { label: 'Importe SINABE', fieldType: 'text' },
  ]
  const item = { customValues: fields.map(field => ({ field, value: '98765' })) }
  const before = structuredClone(item)
  for (const field of fields) assert.equal(isEconomicInventoryField(field), true, JSON.stringify(field))
  for (const cv of projectInventoryEconomics(item, 'DOCUMENTARY').customValues) {
    assert.equal(cv.value, null)
    assert.equal(cv.economicValueSuppressed, true)
  }
  assert.deepEqual(item, before)
  assert.equal(projectInventoryEconomics(item, 'FINANCIAL'), item)
})
