import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dayDiff, dependentsOf, parseDay, pushedDates, wouldCreateCycle } from '../projects-schedule.js'

const e = (blockerId, blockedId) => ({ blockerId, blockedId })
const ymd = (date) => (date ? date.toISOString().slice(0, 10) : null) // eslint-disable-line no-restricted-syntax -- noon UTC task dates

test('days are whole-day arithmetic on noon UTC dates', () => {
  const a = parseDay('2026-11-03')
  assert.equal(dayDiff(a, addDays(a, 5)), 5)
  assert.equal(parseDay('2026-11-03T08:00:00Z').toISOString(), '2026-11-03T12:00:00.000Z')
  assert.equal(parseDay('2026-02-30'), null)
  assert.equal(parseDay('mañana'), null)
  assert.equal(parseDay(null), null)
})

test('the cycle guard follows the whole chain, not just one hop', () => {
  const edges = [e('A', 'B'), e('B', 'C')]
  assert.equal(wouldCreateCycle(edges, 'C', 'A'), true)   // A -> B -> C -> A
  assert.equal(wouldCreateCycle(edges, 'B', 'A'), true)   // direct reverse
  assert.equal(wouldCreateCycle(edges, 'A', 'A'), true)
  assert.equal(wouldCreateCycle(edges, 'A', 'C'), false)  // a diamond is fine
  assert.equal(wouldCreateCycle([e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D')], 'D', 'A'), true)
  assert.equal(wouldCreateCycle([e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D')], 'A', 'D'), false)
  assert.equal(wouldCreateCycle([], 'A', 'B'), false)
})

test('dependents are found transitively, nearest first, without repeats', () => {
  const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D'), e('D', 'E')]
  assert.deepEqual(dependentsOf(edges, 'A'), ['B', 'C', 'D', 'E'])
  assert.deepEqual(dependentsOf(edges, 'D'), ['E'])
  assert.deepEqual(dependentsOf(edges, 'E'), [])
})

test('pushing shifts each dependent by the same days, keeps its length and skips undated ones', () => {
  const tasks = new Map([
    ['B', { startDate: parseDay('2026-11-10'), dueDate: parseDay('2026-11-12') }],
    ['C', { startDate: null, dueDate: parseDay('2026-11-20') }],
    ['D', { startDate: null, dueDate: null }],
  ])
  const moved = pushedDates(tasks, ['B', 'C', 'D', 'ghost'], 3)
  assert.deepEqual(moved.map((m) => [m.id, ymd(m.startDate), ymd(m.dueDate)]), [['B', '2026-11-13', '2026-11-15'], ['C', null, '2026-11-23']])
  assert.deepEqual(pushedDates(tasks, ['B'], 0), [])
  assert.deepEqual(pushedDates(tasks, ['B'], -2), [])
})
