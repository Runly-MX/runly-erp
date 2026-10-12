import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDays, localParts, planForDay, totalsOf, weekdayOfDay } from '../attendance-days.js'

const TZ = 'America/Mexico_City' // UTC-6 in October 2026 (no DST)
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00-06:00`)
const punch = (personId, direction, day, hhmm) => ({ personId, direction, occurredAt: at(day, hhmm), status: 'valid' })

// 9 h Mon-Thu, 6 h Friday (08:00-17:00 with 60 min break = 8 h expected; Fri 08:00-15:00 with the same break = 6 h)
const flexShift = {
  id: 's1', graceMinutes: 10, breakMinutes: 60,
  dayHours: { 1: { start: '08:00', end: '17:00' }, 2: { start: '08:00', end: '17:00' }, 3: { start: '08:00', end: '17:00' }, 4: { start: '08:00', end: '17:00' }, 5: { start: '08:00', end: '15:00' } },
}

test('a flexible shift expects different hours per weekday and rest on weekends', () => {
  assert.equal(planForDay(flexShift, 1).expectedMinutes, 480)
  assert.equal(planForDay(flexShift, 5).expectedMinutes, 360)
  assert.equal(planForDay(flexShift, 6), null)
  assert.equal(weekdayOfDay('2026-10-12'), 1)
  assert.equal(localParts(at('2026-10-12', '23:30'), TZ).day, '2026-10-12')
})

test('classic shifts (start/end + days) still work and overnight spans midnight', () => {
  const classic = { startTime: '09:00', endTime: '18:00', days: [1, 2, 3, 4, 5], graceMinutes: 5, breakMinutes: 0 }
  assert.equal(planForDay(classic, 3).expectedMinutes, 540)
  assert.equal(planForDay(classic, 0), null)
  const night = { startTime: '22:00', endTime: '06:00', days: [1], breakMinutes: 0 }
  assert.equal(planForDay(night, 1).expectedMinutes, 480)
})

test('Friday of 6 h: working 8 h gives 2 h of overtime; Monday of 9 h gross has none', () => {
  const people = [{ id: 'p', shiftId: 's1' }]
  const punches = [
    punch('p', 'in', '2026-10-12', '08:00'), punch('p', 'out', '2026-10-12', '17:00'), // Mon 9 h gross - 60 break = 8 h
    punch('p', 'in', '2026-10-16', '08:00'), punch('p', 'out', '2026-10-16', '17:00'), // Fri 9 h gross = 8 h net
  ]
  const rows = computeDays({ punches, people, shifts: new Map([['s1', flexShift]]), tz: TZ, from: '2026-10-12', to: '2026-10-16', now: at('2026-10-20', '12:00') })
  const mon = rows.find((r) => r.day === '2026-10-12'), fri = rows.find((r) => r.day === '2026-10-16')
  assert.equal(mon.workedMinutes, 480); assert.equal(mon.overtimeMinutes, 0)
  assert.equal(fri.workedMinutes, 480); assert.equal(fri.expectedMinutes, 360); assert.equal(fri.overtimeMinutes, 120)
  assert.equal(rows.filter((r) => r.absent).length, 3) // Tue, Wed, Thu planned and past, no punches
})

test('late arrival beyond tolerance, early leave, and absence only for past planned days', () => {
  const people = [{ id: 'p', shiftId: 's1' }]
  const punches = [punch('p', 'in', '2026-10-12', '08:25'), punch('p', 'out', '2026-10-12', '16:00')]
  const rows = computeDays({ punches, people, shifts: new Map([['s1', flexShift]]), tz: TZ, from: '2026-10-12', to: '2026-10-13', now: at('2026-10-13', '07:00') })
  const mon = rows[0], tue = rows[1]
  assert.equal(mon.lateMinutes, 25); assert.equal(mon.earlyLeaveMinutes, 60)
  assert.equal(tue.absent, false) // today, not over yet
  const within = computeDays({ punches: [punch('p', 'in', '2026-10-12', '08:08'), punch('p', 'out', '2026-10-12', '17:00')], people, shifts: new Map([['s1', flexShift]]), tz: TZ, from: '2026-10-12', to: '2026-10-12' })
  assert.equal(within[0].lateMinutes, 0) // inside the 10 min grace
})

test('rest-day work counts fully as overtime, approval and rounding rules apply', () => {
  const people = [{ id: 'p', shiftId: 's1' }]
  const punches = [punch('p', 'in', '2026-10-17', '09:00'), punch('p', 'out', '2026-10-17', '12:50')] // Saturday 3h50
  const base = { punches, people, shifts: new Map([['s1', flexShift]]), tz: TZ, from: '2026-10-17', to: '2026-10-17', now: at('2026-10-20', '12:00') }
  const auto = computeDays({ ...base, rules: { overtimeRoundingMinutes: 15 } })[0]
  assert.equal(auto.restDay, true); assert.equal(auto.overtimeMinutes, 225); assert.equal(auto.overtimeStatus, 'auto'); assert.equal(auto.countedOvertimeMinutes, 225)
  const pending = computeDays({ ...base, rules: { requireOvertimeApproval: true } })[0]
  assert.equal(pending.overtimeStatus, 'pending'); assert.equal(pending.countedOvertimeMinutes, 0)
  const approved = computeDays({ ...base, rules: { requireOvertimeApproval: true }, reviews: new Map([['p|2026-10-17', { status: 'approved', approvedMinutes: 120 }]]) })[0]
  assert.equal(approved.countedOvertimeMinutes, 120)
  const t = totalsOf([approved, pending])
  assert.equal(t.daysWorked, 2)
})

test('people without a shift use the daily threshold (8 h by default)', () => {
  const rows = computeDays({ punches: [punch('q', 'in', '2026-10-12', '08:00'), punch('q', 'out', '2026-10-12', '18:00')], people: [{ id: 'q', shiftId: null }], shifts: new Map(), tz: TZ, from: '2026-10-12', to: '2026-10-12' })
  assert.equal(rows[0].overtimeMinutes, 120)
})
