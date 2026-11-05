import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGeoPoint } from '../geo-point.js'

test('normalizeGeoPoint: untouched, clear, valid and invalid pairs', () => {
  assert.equal(normalizeGeoPoint(undefined, undefined), null)
  assert.deepEqual(normalizeGeoPoint(null, ''), { latitude: null, longitude: null })
  assert.deepEqual(normalizeGeoPoint('19.4326081', -99.1332), { latitude: 19.432608, longitude: -99.1332 })
  assert.throws(() => normalizeGeoPoint(19.4, null), /juntas/)
  assert.throws(() => normalizeGeoPoint(91, 0), /latitud/)
  assert.throws(() => normalizeGeoPoint(0, 'abc'), /longitud/)
})
