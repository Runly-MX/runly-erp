import test from 'node:test'
import assert from 'node:assert/strict'
import { checkManualEntry, minutesText, summarize, timerMinutes, weekStart } from '../projects-time.js'

const NOW = new Date('2026-11-04T15:00:00Z')

test('a timer reports whole minutes, at least one, and is capped at 12 hours', () => {
  assert.deepEqual(timerMinutes('2026-11-04T14:30:10Z', NOW), { minutes: 30, capped: false })
  assert.deepEqual(timerMinutes('2026-11-04T14:59:50Z', NOW), { minutes: 1, capped: false })
  assert.deepEqual(timerMinutes('2026-11-03T20:00:00Z', NOW), { minutes: 720, capped: true })
  assert.deepEqual(timerMinutes('2026-11-04T12:00:00Z', NOW), { minutes: 180, capped: false })
})

test('manual entries are 1 to 1440 whole minutes and never far in the future', () => {
  assert.equal(checkManualEntry({ minutes: 90 }, NOW).minutes, 90)
  assert.match(checkManualEntry({ minutes: 0 }, NOW).error, /1 minuto/)
  assert.match(checkManualEntry({ minutes: 1441 }, NOW).error, /24 horas/)
  assert.match(checkManualEntry({ minutes: 1.5 }, NOW).error, /1 minuto/)
  assert.match(checkManualEntry({ minutes: 30, startedAt: '2026-11-09T10:00:00Z' }, NOW).error, /futuro/)
  assert.match(checkManualEntry({ minutes: 30, startedAt: 'ayer' }, NOW).error, /no es válida/)
  assert.equal(checkManualEntry({ minutes: 30, startedAt: '2026-11-04T23:00:00Z' }, NOW).minutes, 30)
})

test('weeks start on Monday (UTC)', () => {
  assert.equal(weekStart('2026-11-04T10:00:00Z'), '2026-11-02')
  assert.equal(weekStart('2026-11-02T00:00:00Z'), '2026-11-02')
  assert.equal(weekStart('2026-11-08T23:59:00Z'), '2026-11-02')
  assert.equal(weekStart('2026-11-09T00:00:00Z'), '2026-11-09')
})

test('summaries add finished entries by task, person and week and ignore running timers', () => {
  const summary = summarize([
    { taskId: 'a', userId: 'u1', startedAt: '2026-11-03T10:00:00Z', minutes: 60 },
    { taskId: 'a', userId: 'u2', startedAt: '2026-11-04T10:00:00Z', minutes: 30 },
    { taskId: 'b', userId: 'u1', startedAt: '2026-11-10T10:00:00Z', minutes: 45 },
    { taskId: 'b', userId: 'u1', startedAt: '2026-11-10T11:00:00Z', minutes: null },
  ])
  assert.deepEqual(summary, { total: 135, byTask: { a: 90, b: 45 }, byUser: { u1: 105, u2: 30 }, byWeek: { '2026-11-02': 90, '2026-11-09': 45 } })
})

test('minutes read as hours and minutes', () => {
  assert.deepEqual([minutesText(45), minutesText(60), minutesText(95), minutesText(0)], ['45 min', '1 h', '1 h 35 min', '0 min'])
})
