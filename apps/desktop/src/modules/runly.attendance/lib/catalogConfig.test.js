import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGS, emptyForm, validateCatalogForm } from './catalogConfig.js'

test('shift form validates HH:MM and requires name', () => {
  const form = { ...emptyForm(CATALOGS.shifts), name: '', startTime: '8am', endTime: '17:00' }
  const { errors } = validateCatalogForm(CATALOGS.shifts, form)
  assert.ok(errors.name)
  assert.ok(errors.startTime)
  assert.equal(errors.endTime, undefined)
})

test('blank optional numbers become null, numbers are coerced', () => {
  const form = { ...emptyForm(CATALOGS.sites), name: 'Planta', latitude: '19.4', radiusM: '' }
  const { errors, payload } = validateCatalogForm(CATALOGS.sites, form)
  assert.deepEqual(errors, {})
  assert.equal(payload.latitude, 19.4)
  assert.equal(payload.radiusM, null)
  assert.equal(payload.address, null)
})
