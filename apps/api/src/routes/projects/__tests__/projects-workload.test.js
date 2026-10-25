import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWorkload, weeksBetween, DEFAULT_WEEKLY_CAPACITY } from '../projects-workload.js'

const d = (s) => new Date(`${s}T12:00:00.000Z`)

test('weeksBetween lists the Mondays that cover the range', () => {
  assert.deepEqual(weeksBetween(d('2026-10-28'), d('2026-11-10')), ['2026-10-26', '2026-11-02', '2026-11-09'])
})

test('an estimate is spread over working days and split across weeks', () => {
  // Thu 29 Oct .. Tue 3 Nov = Thu, Fri, Mon, Tue = 4 workdays, 240 min each.
  const out = buildWorkload({ from: d('2026-10-26'), to: d('2026-11-08'), tasks: [{ id: 't1', assigneeId: 'u1', startDate: d('2026-10-29'), dueDate: d('2026-11-03'), estimateMinutes: 960 }] })
  const [p] = out.people
  assert.equal(p.byWeek['2026-10-26'], 480)
  assert.equal(p.byWeek['2026-11-02'], 480)
  assert.equal(p.capacity, DEFAULT_WEEKLY_CAPACITY)
})

test('only the part inside the range counts; done and unassigned tasks are ignored', () => {
  const out = buildWorkload({ from: d('2026-11-02'), to: d('2026-11-08'), tasks: [
    { id: 'a', assigneeId: 'u1', startDate: d('2026-10-26'), dueDate: d('2026-11-06'), estimateMinutes: 1000 },
    { id: 'b', assigneeId: 'u1', dueDate: d('2026-11-03'), estimateMinutes: 600, done: true },
    { id: 'c', assigneeId: null, dueDate: d('2026-11-03'), estimateMinutes: 600 },
  ] })
  assert.equal(out.people.length, 1)
  assert.equal(out.people[0].byWeek['2026-11-02'], 500)
})

test('tasks without dates or estimate are listed as unscheduled; capacity override applies', () => {
  const out = buildWorkload({ from: d('2026-11-02'), to: d('2026-11-08'), capacity: { u1: 1200 }, tasks: [
    { id: 'x', assigneeId: 'u1', estimateMinutes: 120 },
    { id: 'y', assigneeId: 'u1', dueDate: d('2026-11-04') },
  ] })
  assert.deepEqual(out.people[0].unscheduled, ['x', 'y'])
  assert.equal(out.people[0].capacity, 1200)
})

test('a weekend-only task still lands on its week', () => {
  const out = buildWorkload({ from: d('2026-11-02'), to: d('2026-11-08'), tasks: [{ id: 'w', assigneeId: 'u1', dueDate: d('2026-11-07'), estimateMinutes: 90 }] })
  assert.equal(out.people[0].byWeek['2026-11-02'], 90)
})
