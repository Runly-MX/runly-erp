import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGS, emptyForm, formFromItem, validateCatalogForm } from './catalogConfig.js'

test('shift form requires name and a valid weekly schedule', () => {
  const form = { ...emptyForm(CATALOGS.shifts), name: '', dayHours: { 1: { start: '8am', end: '17:00' } } }
  const { errors } = validateCatalogForm(CATALOGS.shifts, form)
  assert.ok(errors.name)
  assert.ok(errors.dayHours)
  const ok = validateCatalogForm(CATALOGS.shifts, { ...emptyForm(CATALOGS.shifts), name: 'X' })
  assert.deepEqual(ok.errors, {})
  assert.equal(ok.payload.breakMinutes, 0)
  assert.equal(Object.keys(ok.payload.dayHours).length, 5)
})

test('editing an old shift builds dayHours from startTime, endTime and days', () => {
  const form = formFromItem(CATALOGS.shifts, { name: 'Viejo', startTime: '07:00', endTime: '15:00', days: [1, 2], graceMinutes: 5 })
  assert.deepEqual(form.dayHours, { 1: { start: '07:00', end: '15:00' }, 2: { start: '07:00', end: '15:00' } })
  assert.equal(form.breakMinutes, 0)
})

test('site location is flattened to address, coordinates and radius', () => {
  const form = { ...emptyForm(CATALOGS.sites), name: 'Planta', location: { address: ' Av. 1 ', latitude: 19.4, longitude: -99.1, radiusM: '200' } }
  const { errors, payload } = validateCatalogForm(CATALOGS.sites, form)
  assert.deepEqual(errors, {})
  assert.equal(payload.address, 'Av. 1')
  assert.equal(payload.latitude, 19.4)
  assert.equal(payload.radiusM, 200)
  assert.ok(payload.timezone)
})

test('site without a point clears coordinates and radius', () => {
  const form = { ...emptyForm(CATALOGS.sites), name: 'Planta' }
  const { payload } = validateCatalogForm(CATALOGS.sites, form)
  assert.equal(payload.latitude, null)
  assert.equal(payload.radiusM, null)
  assert.equal(payload.address, null)
})

test('shift and quota names are generated when left empty', () => {
  const shift = { ...emptyForm(CATALOGS.shifts), name: '' }
  assert.equal(validateCatalogForm(CATALOGS.shifts, shift).payload.name, 'Matutino 08:00–17:00')
  const lookups = { groups: new Map([['g', 'Contratista Uno']]), categories: new Map([['c', 'Soldadores']]), sites: new Map() }
  const quota = { ...emptyForm(CATALOGS.quotas), groupId: 'g', categoryId: 'c' }
  assert.equal(validateCatalogForm(CATALOGS.quotas, quota, lookups).payload.name, 'Soldadores · Contratista Uno')
  assert.deepEqual(validateCatalogForm(CATALOGS.quotas, quota, lookups).payload.days, [])
})
