// Pure workload rules (no database): spreads the estimate of each open task over the
// working days (Mon-Fri) between its dates and adds it up per person and week. Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 3.
import { weekStart } from './projects-time.js'

export const DEFAULT_WEEKLY_CAPACITY = 40 * 60
const DAY_MS = 86_400_000
const MAX_WEEKS = 26

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10) // eslint-disable-line no-restricted-syntax -- UTC calendar days
const isWorkday = (ms) => { const d = new Date(ms).getUTCDay(); return d !== 0 && d !== 6 }
const dayStart = (date) => { const d = new Date(date); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }

// Mondays covering [from, to] (inclusive days), capped so a wrong range cannot explode.
export function weeksBetween(from, to) {
  const weeks = []
  let cursor = Date.parse(`${weekStart(from)}T00:00:00.000Z`)
  const end = dayStart(to)
  while (cursor <= end && weeks.length < MAX_WEEKS) { weeks.push(dayKey(cursor)); cursor += 7 * DAY_MS }
  return weeks
}

// tasks: [{ id, assigneeId, startDate, dueDate, estimateMinutes, done }]
// capacity: { [userId]: weeklyMinutes } (missing = the default).
// Returns { weeks, people: [{ userId, capacity, byWeek: { week: minutes }, items: { week: [{ taskId, minutes }] }, unscheduled: [taskId] }] }.
// Open tasks without dates or estimate are listed apart ("unscheduled"), never invented into a week.
export function buildWorkload({ tasks, from, to, capacity = {} }) {
  const weeks = weeksBetween(from, to)
  const lo = dayStart(from)
  const hi = dayStart(to)
  const people = new Map()
  const person = (userId) => {
    if (!people.has(userId)) people.set(userId, { userId, capacity: capacity[userId] ?? DEFAULT_WEEKLY_CAPACITY, byWeek: {}, items: {}, unscheduled: [] })
    return people.get(userId)
  }
  for (const task of tasks) {
    if (task.done || !task.assigneeId) continue
    const who = person(task.assigneeId)
    const first = task.startDate ?? task.dueDate
    const last = task.dueDate ?? task.startDate
    if (!first || !(task.estimateMinutes > 0)) { who.unscheduled.push(task.id); continue }
    let a = dayStart(first)
    let b = dayStart(last)
    if (a > b) [a, b] = [b, a]
    const days = []
    for (let t = a; t <= b; t += DAY_MS) if (isWorkday(t)) days.push(t)
    // A range that is only a weekend still carries the work: it lands on those days.
    const spread = days.length ? days : Array.from({ length: Math.round((b - a) / DAY_MS) + 1 }, (_, i) => a + i * DAY_MS)
    const perDay = task.estimateMinutes / spread.length
    const taskWeeks = {}
    for (const t of spread) {
      if (t < lo || t > hi) continue
      const week = weekStart(t)
      taskWeeks[week] = (taskWeeks[week] ?? 0) + perDay
    }
    for (const [week, minutes] of Object.entries(taskWeeks)) {
      who.byWeek[week] = (who.byWeek[week] ?? 0) + minutes
      ;(who.items[week] ??= []).push({ taskId: task.id, minutes: Math.round(minutes) })
    }
  }
  for (const entry of people.values()) for (const week of Object.keys(entry.byWeek)) entry.byWeek[week] = Math.round(entry.byWeek[week])
  return { weeks, people: [...people.values()] }
}
