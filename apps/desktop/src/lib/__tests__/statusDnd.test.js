import test from 'node:test'
import assert from 'node:assert/strict'
import { durationFor, DND_DURATIONS, STATUS_DURATIONS, untilText, tomorrowMorning, endOfWeek } from '../statusDnd.js'

const now = new Date(2026, 10, 4, 12, 0, 0) // Wed 4 Nov 2026 12:00 local

test('durations resolve to future instants and "none" has no expiry', () => {
  assert.equal(durationFor('none', STATUS_DURATIONS, now), null)
  assert.equal(durationFor('1h', STATUS_DURATIONS, now), new Date(now.getTime() + 3_600_000).toISOString())
  assert.ok(new Date(durationFor('today', STATUS_DURATIONS, now)) > now)
})

test('Do Not Disturb offers "hasta mañana" at 08:00 and never "no borrar"', () => {
  assert.ok(!DND_DURATIONS.some((d) => d.value === 'none'))
  const tomorrow = new Date(durationFor('tomorrow', DND_DURATIONS, now))
  assert.deepEqual([tomorrow.getDate(), tomorrow.getHours()], [5, 8])
  assert.equal(new Date(tomorrowMorning(now)).getHours(), 8)
})

test('the week ends on Sunday', () => {
  assert.equal(new Date(endOfWeek(now)).getDay(), 0)
  assert.equal(new Date(endOfWeek(new Date(2026, 10, 8, 9))).getDate(), 8) // already Sunday
})

test('until text says the time today and the date otherwise', () => {
  assert.match(untilText(new Date(2026, 10, 4, 15, 30).toISOString(), now), /^hasta las /)
  assert.match(untilText(new Date(2026, 10, 6, 15, 30).toISOString(), now), /^hasta el /)
  assert.equal(untilText(null), '')
})
