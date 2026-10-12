import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanDayHours, copyMondayToActive, dayHoursFromShift, formatHm, formatHoursShort, presetLongDays, presetWeekdays,
  setDayActive, setDayTime, suggestNameFromDayHours, summarizeSchedule, weeklyMinutes,
} from './shiftSchedule.js'

test('weekly total subtracts the break per worked day', () => {
  assert.equal(weeklyMinutes(presetWeekdays(), 0), 5 * 9 * 60)
  assert.equal(weeklyMinutes(presetWeekdays(), 60), 5 * 8 * 60)
  assert.equal(weeklyMinutes(presetLongDays(), 60), (4 * 9 + 5) * 60)
  assert.equal(weeklyMinutes({ 1: { start: '22:00', end: '06:00' } }, 0), 8 * 60)
})

test('format helpers', () => {
  assert.equal(formatHoursShort(2520), '42 h')
  assert.equal(formatHoursShort(2535), '42 h 15 min')
  assert.equal(formatHm(125), '2:05')
  assert.equal(formatHm(0), '0:00')
})

test('summary merges consecutive days with the same hours', () => {
  assert.equal(summarizeSchedule(presetLongDays()), 'Lun-Jue 08:00-18:00 · Vie 08:00-14:00')
  assert.equal(summarizeSchedule(presetWeekdays()), 'Lun-Vie 08:00-17:00')
  assert.equal(summarizeSchedule({ 1: { start: '08:00', end: '17:00' }, 3: { start: '08:00', end: '17:00' }, 0: { start: '09:00', end: '13:00' } }), 'Lun 08:00-17:00 · Mié 08:00-17:00 · Dom 09:00-13:00')
  assert.equal(summarizeSchedule({ 6: { start: '08:00', end: '12:00' }, 0: { start: '08:00', end: '12:00' } }), 'Sáb y Dom 08:00-12:00')
  assert.equal(summarizeSchedule({}), 'Sin días laborables')
})

test('legacy shifts are expanded to dayHours', () => {
  const legacy = dayHoursFromShift({ startTime: '07:00', endTime: '15:00', days: [1, 2] })
  assert.deepEqual(legacy, { 1: { start: '07:00', end: '15:00' }, 2: { start: '07:00', end: '15:00' } })
  assert.equal(Object.keys(dayHoursFromShift({ startTime: '07:00', endTime: '15:00', days: [] })).length, 7)
  assert.deepEqual(dayHoursFromShift({ dayHours: { 5: { start: '08:00', end: '14:00' } }, startTime: '1', endTime: '2' }), { 5: { start: '08:00', end: '14:00' } })
})

test('editing helpers', () => {
  const copied = copyMondayToActive({ 1: { start: '07:00', end: '16:00' }, 2: { start: '09:00', end: '10:00' } })
  assert.deepEqual(copied[2], { start: '07:00', end: '16:00' })
  const on = setDayActive(presetLongDays(), 6, true)
  assert.deepEqual(on[6], { start: '08:00', end: '18:00' })
  assert.equal(setDayActive(on, 6, false)[6], undefined)
  assert.equal(setDayTime(presetWeekdays(), 1, 'end', '12:00')[1].end, '12:00')
  assert.equal(cleanDayHours({ 1: { start: '8am', end: '17:00' } }), null)
  assert.deepEqual(cleanDayHours({ 1: { start: '08:00', end: '17:00' }, 9: { start: '08:00', end: '17:00' } }), { 1: { start: '08:00', end: '17:00' } })
})

test('name suggestion', () => {
  assert.equal(suggestNameFromDayHours(presetWeekdays()), 'Matutino 08:00–17:00')
  assert.equal(suggestNameFromDayHours(presetLongDays()), 'Matutino 08:00–18:00 (variable)')
  assert.equal(suggestNameFromDayHours({}), '')
})
