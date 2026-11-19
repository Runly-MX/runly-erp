import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dayKey, daysRange, minuteOfDay, wallToInstant, weekStart } from './bookingsTime.js'

test('wall time converts to the instant the server uses, across DST', () => {
  assert.equal(wallToInstant({ year: 2027, month: 1, day: 11, hour: 9 }, 'America/Mexico_City').toISOString(), '2027-01-11T15:00:00.000Z')
  assert.equal(wallToInstant({ year: 2027, month: 3, day: 14, hour: 1 }, 'America/New_York').toISOString(), '2027-03-14T06:00:00.000Z')
  assert.equal(wallToInstant({ year: 2027, month: 3, day: 14, hour: 4 }, 'America/New_York').toISOString(), '2027-03-14T08:00:00.000Z')
  assert.equal(wallToInstant({ year: 2027, month: 7, day: 1, hour: 9 }, 'America/New_York').toISOString(), '2027-07-01T13:00:00.000Z')
})

test('local days, weeks and minute positions follow the space zone, not the browser', () => {
  assert.equal(dayKey('2027-01-12T05:30:00Z', 'America/Mexico_City'), '2027-01-11')
  assert.equal(minuteOfDay('2027-01-12T05:30:00Z', 'America/Mexico_City'), 23 * 60 + 30)
  assert.equal(weekStart('2027-01-14'), '2027-01-11')
  assert.equal(weekStart('2027-01-17'), '2027-01-11')
  assert.equal(addDays('2027-02-28', 1), '2027-03-01')
  const spring = daysRange('2027-03-14', 1, 'America/New_York')
  assert.equal((spring.to - spring.from) / 3600000, 23)
})
