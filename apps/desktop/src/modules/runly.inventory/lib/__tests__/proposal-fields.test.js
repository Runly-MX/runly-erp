import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildProposalBody, buildProposalFields } from '../proposal-fields.js'

const lookups = { categories: [{ id: 'c1', name: 'Lector' }], brands: [{ id: 'b1', name: 'DESKO' }] }

describe('proposal fields', () => {
  it('lists only the filled values, with the catalog name of relations', () => {
    const fields = buildProposalFields({ name: ' Lector HID ', model: '', categoryId: 'c1', brandId: 'b1', notes: 'x', serialNumber: 'SN-1' }, lookups)
    assert.deepEqual(fields.map((f) => [f.key, f.display]), [['name', 'Lector HID'], ['categoryId', 'Lector'], ['brandId', 'DESKO'], ['notes', 'x']])
  })
  it('the body carries only the selected fields and labels the relations', () => {
    const fields = buildProposalFields({ name: 'A', categoryId: 'c1' }, lookups)
    const body = buildProposalBody({ kind: 'change', matched: { field: 'serialNumber', value: 'SN-1' }, fields, selected: new Set(['categoryId']), message: ' hola ' })
    assert.deepEqual(body, { kind: 'change', matchedField: 'serialNumber', matchedValue: 'SN-1', changes: { categoryId: { value: 'c1', label: 'Lector' } }, message: 'hola' })
  })
  it('an access request sends no values', () => {
    const body = buildProposalBody({ kind: 'access_request', matched: { field: 'assetTag', value: 'T-1' }, fields: [], selected: new Set() })
    assert.deepEqual(body.changes, {})
  })
})
