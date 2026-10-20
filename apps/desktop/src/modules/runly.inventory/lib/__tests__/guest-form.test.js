import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applicableCustomFields, buildGuestPayload, guestItemDefaults, guestItemSchema } from '../guest-form.js'

const FIELDS = [
  { id: 'f1', fieldKey: 'k1', categoryId: null },
  { id: 'f2', fieldKey: 'k2', categoryId: 'cat-a' },
  { id: 'f3', fieldKey: 'k3', categoryId: 'cat-b' },
]

describe('guest item form', () => {
  it('requires a folder but not a name (the API generates it)', () => {
    assert.equal(guestItemSchema.safeParse(guestItemDefaults(null, '')).success, false)
    assert.equal(guestItemSchema.safeParse(guestItemDefaults(null, 'a1')).success, true)
    assert.equal(guestItemSchema.safeParse({ ...guestItemDefaults(null, 'a1'), warrantyExpiry: '31/12' }).success, false)
  })

  it('keeps only custom fields of the chosen type', () => {
    assert.deepEqual(applicableCustomFields(FIELDS, 'cat-a').map((f) => f.id), ['f1', 'f2'])
    assert.deepEqual(applicableCustomFields(FIELDS, null).map((f) => f.id), ['f1'])
  })

  it('sends areaId only on create, maps blanks to null and carries model and warranty', () => {
    const values = { ...guestItemDefaults(null, 'a1'), name: ' Taladro ', modelId: 'm1', model: 'XPS', categoryId: 'cat-a', warrantyExpiry: '2027-01-02', customValues: { k1: ' x ', k2: '', k3: 'drop' } }
    const create = buildGuestPayload(values, { create: true, customFields: FIELDS })
    assert.equal(create.areaId, 'a1')
    assert.equal(create.name, 'Taladro')
    assert.equal(create.modelId, 'm1')
    assert.equal(create.warrantyExpiry, '2027-01-02')
    assert.equal(create.brandId, null)
    assert.deepEqual(create.customValues, [{ fieldId: 'f1', value: 'x' }, { fieldId: 'f2', value: null }])
    assert.equal('status' in buildGuestPayload(values, { create: false, customFields: FIELDS, statusEditable: false }), false)
    assert.equal('areaId' in buildGuestPayload(values, { create: false, customFields: FIELDS }), false)
    assert.equal('description' in create, false)
  })

  it('prefills from an item and ignores non-writable statuses', () => {
    const d = guestItemDefaults({ areaId: 'a2', name: 'N', status: 'assigned', categoryId: 'c', modelId: 'm', warrantyExpiry: '2027-01-02T00:00:00.000Z', customValues: [{ fieldId: 'f1', value: 'v' }] }, '', FIELDS)
    assert.deepEqual([d.areaId, d.status, d.categoryId, d.brandId, d.modelId, d.warrantyExpiry, d.customValues.k1], ['a2', 'available', 'c', null, 'm', '2027-01-02', 'v'])
  })
})
