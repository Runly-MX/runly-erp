import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCoordinates } from './geo-point.js'

test('parseCoordinates reads plain pairs and map links', () => {
  const point = { latitude: 19.432608, longitude: -99.133209 }
  assert.deepEqual(parseCoordinates('19.432608, -99.133209'), point)
  assert.deepEqual(parseCoordinates(' 19.432608 -99.133209 '), point)
  assert.deepEqual(parseCoordinates('https://www.google.com/maps/place/Zocalo/@19.432608,-99.133209,17z'), point)
  assert.deepEqual(parseCoordinates('https://www.google.com/maps/place/X/data=!3d19.432608!4d-99.133209'), point)
  assert.deepEqual(parseCoordinates('https://maps.google.com/?q=19.432608,-99.133209'), point)
  assert.deepEqual(parseCoordinates('https://www.openstreetmap.org/?mlat=19.432608&mlon=-99.133209#map=17'), point)
  assert.equal(parseCoordinates('95, 10'), null)
  assert.equal(parseCoordinates('Av. Reforma 222'), null)
  assert.equal(parseCoordinates(''), null)
})
