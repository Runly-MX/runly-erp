import test from 'node:test'
import assert from 'node:assert/strict'
import { nextOccurrence } from '../automation-schedule-math.js'

const TZ = 'America/Mexico_City' // UTC-6 all year since 2022 (no DST)
const iso = (date) => date.toISOString()

test('hourly schedules fire on the next top of the hour', () => {
  assert.equal(iso(nextOccurrence({ every: 'hour' }, new Date('2026-10-26T14:20:00Z'), TZ)), '2026-10-26T15:00:00.000Z')
  assert.equal(iso(nextOccurrence({ every: 'hour' }, new Date('2026-10-26T15:00:00Z'), TZ)), '2026-10-26T16:00:00.000Z')
})

test('daily schedules use the zone wall clock and roll to tomorrow once passed', () => {
  // 08:00 Mexico City = 14:00 UTC
  assert.equal(iso(nextOccurrence({ every: 'day', at: '08:00' }, new Date('2026-10-26T13:59:00Z'), TZ)), '2026-10-26T14:00:00.000Z')
  assert.equal(iso(nextOccurrence({ every: 'day', at: '08:00' }, new Date('2026-10-26T14:00:00Z'), TZ)), '2026-10-27T14:00:00.000Z')
  // Late evening local time (22:00 local = 04:00 UTC next day) keeps the local date.
  assert.equal(iso(nextOccurrence({ every: 'day', at: '23:30' }, new Date('2026-10-27T04:00:00Z'), TZ)), '2026-10-27T05:30:00.000Z')
})

test('weekly and monthly schedules pick the right day, including month rollover', () => {
  // 2026-10-26 is a Monday (weekday 1)
  assert.equal(iso(nextOccurrence({ every: 'week', weekday: 1, at: '08:00' }, new Date('2026-10-26T14:00:00Z'), TZ)), '2026-11-02T14:00:00.000Z')
  assert.equal(iso(nextOccurrence({ every: 'week', weekday: 5, at: '09:00' }, new Date('2026-10-26T14:00:00Z'), TZ)), '2026-10-30T15:00:00.000Z')
  assert.equal(iso(nextOccurrence({ every: 'month', day: 28, at: '08:00' }, new Date('2026-10-29T00:00:00Z'), TZ)), '2026-11-28T14:00:00.000Z')
  assert.equal(iso(nextOccurrence({ every: 'month', day: 1, at: '00:00' }, new Date('2026-12-15T00:00:00Z'), TZ)), '2027-01-01T06:00:00.000Z')
})

test('a zone with daylight saving time keeps the wall clock across the change', () => {
  // New York leaves DST on 2026-11-01: 08:00 is 12:00Z before, 13:00Z after.
  assert.equal(iso(nextOccurrence({ every: 'day', at: '08:00' }, new Date('2026-10-31T13:00:00Z'), 'America/New_York')), '2026-11-01T13:00:00.000Z')
  assert.equal(iso(nextOccurrence({ every: 'day', at: '08:00' }, new Date('2026-10-30T13:00:00Z'), 'America/New_York')), '2026-10-31T12:00:00.000Z')
})
