import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityProgress, clockOffset, crossedWarning, formatClock, remainingFrom } from './lmsSession.js'

test('device clock 10 minutes ahead or behind does not change the remaining time', () => {
  const server = Date.parse('2026-12-01T10:00:00Z')
  const expiresAt = '2026-12-01T11:00:00.000Z'
  for (const skew of [10 * 60_000, -10 * 60_000, 0]) {
    const device = server + skew
    const offset = clockOffset(new Date(server).toISOString(), device - 100, device + 100)
    assert.equal(remainingFrom(expiresAt, offset, device), 60 * 60_000)
    assert.equal(remainingFrom(expiresAt, offset, device + 15 * 60_000), 45 * 60_000)
  }
  assert.equal(remainingFrom(null, 0, server), null)
  assert.equal(remainingFrom(expiresAt, 0, server + 2 * 3600_000), 0)
})

test('clock format and warnings at 10, 5 and 1 minutes', () => {
  assert.equal(formatClock(60 * 60_000), '1:00:00')
  assert.equal(formatClock(59_500), '01:00')
  assert.equal(formatClock(null), null)
  assert.equal(crossedWarning(10 * 60_000 + 1, 10 * 60_000), 10)
  assert.equal(crossedWarning(5 * 60_000 + 500, 4 * 60_000), 5)
  assert.equal(crossedWarning(9 * 60_000, 8 * 60_000), null)
  assert.equal(crossedWarning(null, 1000), null)
})

test('activity progress for the stepper and the final review', () => {
  assert.deepEqual(activityProgress({ kind: 'quiz', attempt: { questionCount: 10, answeredCount: 3 } }), { done: 3, total: 10, complete: false, label: '3 de 10 respondidas' })
  assert.equal(activityProgress({ kind: 'assignment', submission: { text: '', files: [] } }).label, 'Sin entregar')
  assert.equal(activityProgress({ kind: 'assignment', submission: { text: 'x', files: [{}, {}] } }).label, 'Texto escrito · 2 archivos')
})
