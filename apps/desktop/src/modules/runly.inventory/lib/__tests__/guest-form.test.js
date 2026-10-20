import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NONE, applicableCustomFields, buildGuestPayload, guestItemDefaults, guestItemSchema } from '../guest-form.js'

const FIELDS = [
  { id: 'f1', fieldKey: 'k1', categoryId: null },
  { id: 'f2', fieldKey: 'k2', categoryId: 'cat-a' },
  { id: 'f3', fieldKey: 'k3', categoryId: 'cat-b' },
]

describe('guest item form', () => {
  it('requires a name and a folder', () => {
    assert.equal(guestItemSchema.safeParse({ ...guestItemDefaults(null, ''), name: '' }).success, false)
    assert.equal(guestItemSchema.safeParse(guestItemDefaults(null, 'a1')).success, false)
    assert.equal(guestItemSchema.safeParse({ ...guestItemDefaults(null, 'a1'), name: 'Taladro' }).success, true)
  })

  it('keeps only custom fields of the chosen category', () => {
    assert.deepEqual(applicableCustomFields(FIELDS, 'cat-a').map((f) => f.id), ['f1', 'f2'])
    assert.deepEqual(applicableCustomFields(FIELDS, NONE).map((f) => f.id), ['f1'])
  })

  it('sends areaId only on create and maps blanks to null', () => {
    const values = { ...guestItemDefaults(null, 'a1'), name: ' Taladro ', categoryId: 'cat-a', customValues: { k1: ' x ', k2: '', k3: 'drop' } }
    const create = buildGuestPayload(values, { create: true, customFields: FIELDS })
    assert.equal(create.areaId, 'a1')
    assert.equal(create.name, 'Taladro')
    assert.equal(create.brandId, null)
    assert.deepEqual(create.customValues, [{ fieldId: 'f1', value: 'x' }, { fieldId: 'f2', value: null }])
    assert.equal('status' in buildGuestPayload(values, { create: false, customFields: FIELDS, statusEditable: false }), false)
    assert.equal('areaId' in buildGuestPayload(values, { create: false, customFields: FIELDS }), false)
  })

  it('prefills from an item and ignores non-writable statuses', () => {
    const d = guestItemDefaults({ areaId: 'a2', name: 'N', status: 'assigned', categoryId: 'c', customValues: [{ fieldId: 'f1', value: 'v' }] }, '', FIELDS)
    assert.equal(d.areaId, 'a2')
    assert.equal(d.status, 'available')
    assert.equal(d.categoryId, 'c')
    assert.equal(d.brandId, NONE)
    assert.equal(d.customValues.k1, 'v')
  })
})
