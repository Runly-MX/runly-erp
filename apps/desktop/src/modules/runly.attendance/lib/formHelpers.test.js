import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTimeOptions, buildTimezoneOptions, generatePin, isWeakPin, normalizeDays, suggestKioskName, suggestNextCode,
  suggestQuotaName, suggestShiftName, timezoneLabel, toggleDay, formatCoords, osmUrl, radiusOptionsFor,
} from './formHelpers.js'

test('time options step every 15 minutes with friendly labels', () => {
  const options = buildTimeOptions(15)
  assert.equal(options.length, 96)
  assert.deepEqual(options[0], { value: '00:00', label: '12:00 a. m.', keywords: '00:00' })
  assert.equal(options.find((o) => o.value === '16:45').label, '4:45 p. m.')
  assert.equal(buildTimeOptions(15, '08:05').some((o) => o.value === '08:05'), true)
})

test('shift name is suggested from the times', () => {
  assert.equal(suggestShiftName('08:00', '16:00'), 'Matutino 08:00–16:00')
  assert.equal(suggestShiftName('14:00', '22:00'), 'Vespertino 14:00–22:00')
  assert.equal(suggestShiftName('22:00', '06:00'), 'Nocturno 22:00–06:00')
  assert.equal(suggestShiftName('', '16:00'), '')
})

test('day chips keep at least one day and store all seven as empty', () => {
  assert.deepEqual(toggleDay([], 0), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(toggleDay([1], 1), [1])
  assert.deepEqual(toggleDay([1, 2], 5), [1, 2, 5])
  assert.deepEqual(normalizeDays([0, 1, 2, 3, 4, 5, 6]), [])
  assert.deepEqual(normalizeDays([5, 1]), [1, 5])
})

test('quota name joins category, group and site', () => {
  const lookups = { groups: new Map([['g', 'Contratista Uno']]), categories: new Map([['c', 'Soldadores']]), sites: new Map() }
  assert.equal(suggestQuotaName({ groupId: 'g', categoryId: 'c' }, lookups), 'Soldadores · Contratista Uno')
  assert.equal(suggestQuotaName({}, lookups), '')
})

test('next code continues the dominant pattern', () => {
  assert.equal(suggestNextCode([]), '1')
  assert.equal(suggestNextCode(['1', '2', '9']), '10')
  assert.equal(suggestNextCode(['EMP-007', 'EMP-009', 'X1']), 'EMP-010')
  assert.equal(suggestNextCode(['A', 'B']), '1')
})

test('generated PIN has 4 digits and avoids weak patterns', () => {
  for (const weak of ['0000', '1234', '4321', '1212', '7777']) assert.equal(isWeakPin(weak), true)
  assert.equal(isWeakPin('4821'), false)
  const seq = ['1234', '0000', '5839']
  assert.equal(generatePin(() => Number(seq.shift())), '5839')
  for (let i = 0; i < 50; i += 1) assert.match(generatePin(), /^\d{4}$/)
})

test('timezone labels are Spanish with offset and options are grouped Latin America first', () => {
  const date = new Date('2026-01-15T12:00:00Z')
  assert.equal(timezoneLabel('America/Mexico_City', date), 'Ciudad de México (GMT-6)')
  assert.equal(timezoneLabel('Asia/Kolkata', date), 'Kolkata (GMT+5:30)')
  const options = buildTimezoneOptions({ zones: ['Europe/Madrid', 'America/New_York', 'America/Mexico_City', 'Asia/Tokyo'], current: 'Africa/Cairo', date })
  assert.equal(options[0].value, 'America/Mexico_City')
  assert.equal(options[0].group, 'América Latina')
  assert.equal(options.at(-1).group, 'Otras zonas')
  assert.ok(options.some((o) => o.value === 'Africa/Cairo'))
})

test('kiosk name suggestion avoids duplicates', () => {
  assert.equal(suggestKioskName([], null), 'Kiosko 1')
  assert.equal(suggestKioskName(['Kiosko 1'], null), 'Kiosko 2')
  assert.equal(suggestKioskName([], 'Planta'), 'Kiosko Planta')
  assert.equal(suggestKioskName(['kiosko planta'], 'Planta'), 'Kiosko Planta 2')
})

test('location helpers', () => {
  assert.equal(formatCoords(19.4326, -99.1332), 'Lat 19.4326, Lng -99.1332')
  assert.match(osmUrl(19.4, -99.1), /mlat=19.4&mlon=-99.1#map=17\/19.4\/-99.1/)
  assert.equal(radiusOptionsFor(75).some((o) => o.value === '75'), true)
})
