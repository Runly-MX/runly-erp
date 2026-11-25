import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGeoFiles, UPSTREAM } from '../build-geo-dataset.mjs'

test('geo dataset: one file per country with ISO codes and city names only; pinned ODbL upstream', () => {
  const files = buildGeoFiles([
    { iso2: 'MX', name: 'Mexico', states: [{ iso2: 'JAL', name: 'Jalisco', cities: [{ name: 'Guadalajara', latitude: '1' }] }] },
    { iso2: 'AQ', name: 'Antarctica', states: [] },
  ])
  assert.deepEqual(JSON.parse(files.get('countries.json')).map((c) => c.isoCode), ['AQ', 'MX'])
  assert.deepEqual(JSON.parse(files.get('MX.json')), { states: [{ isoCode: 'JAL', name: 'Jalisco', cities: ['Guadalajara'] }] })
  assert.equal(UPSTREAM.license, 'ODbL-1.0')
  assert.match(UPSTREAM.sha256, /^[0-9a-f]{64}$/)
})
