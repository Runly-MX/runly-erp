import test from 'node:test'
import assert from 'node:assert/strict'
import { reminderOptions, remindText } from '../reminderOptions.js'

test('options are all in the future and tomorrow/monday do not repeat', () => {
  const now = new Date(2026, 10, 4, 12, 0) // Wednesday
  const options = reminderOptions(now)
  assert.deepEqual(options.map((o) => o.key), ['20m', '1h', '3h', 'tomorrow', 'monday', 'week'])
  assert.ok(options.every((o) => new Date(o.iso) > now))
  assert.equal(new Date(options.find((o) => o.key === 'monday').iso).getDay(), 1)
  assert.equal(new Date(options.find((o) => o.key === 'tomorrow').iso).getHours(), 9)
})

test('on a Sunday "tomorrow" is Monday, so the Monday option is dropped', () => {
  const sunday = new Date(2026, 10, 8, 12, 0)
  assert.ok(!reminderOptions(sunday).some((o) => o.key === 'monday'))
})

test('on a Monday the Monday option means next week', () => {
  const monday = new Date(2026, 10, 2, 12, 0)
  const next = new Date(reminderOptions(monday).find((o) => o.key === 'monday').iso)
  assert.equal(next.getDate(), 9)
})

test('reminder text says today or the date', () => {
  const now = new Date(2026, 10, 4, 12, 0)
  assert.match(remindText(new Date(2026, 10, 4, 15, 0).toISOString(), now), /^hoy /)
  assert.ok(remindText(new Date(2026, 10, 6, 9, 0).toISOString(), now).length > 5)
  assert.equal(remindText(null), '')
})
