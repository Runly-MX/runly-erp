// Daily hours engine for runly.attendance: expected vs worked time per person-day,
// overtime, late arrival, early leave and absence. Pure functions (no I/O), hours only:
// no pay multipliers. A day belongs to the local date (company timezone) of the
// session's entry, so overnight shifts stay on one day.
import { buildSessions } from './attendance-core.js'

export const DEFAULT_TZ = 'America/Mexico_City'
export const DEFAULT_RULES = { dailyThresholdMinutes: 480, overtimeRoundingMinutes: 0, requireOvertimeApproval: false }
const BREAK_DEDUCT_AFTER_MIN = 300

const pad = (n) => String(n).padStart(2, '0')
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m }

// { day: 'YYYY-MM-DD', weekday: 0..6, minutes: minutes since local midnight } for an instant.
export function localParts(instant, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(instant))
  const get = (t) => parts.find((p) => p.type === t)?.value
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { day: `${get('year')}-${get('month')}-${get('day')}`, weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

export function weekdayOfDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

// What the shift expects on a weekday: null = rest day. dayHours (per-day start/end) wins
// over the shift's default start/end + days, which is what makes "4 x 9 h and a short
// Friday" possible.
export function planForDay(shift, weekday) {
  if (!shift) return null
  const custom = shift.dayHours && typeof shift.dayHours === 'object' ? shift.dayHours[String(weekday)] : null
  let start, end
  if (shift.dayHours && Object.keys(shift.dayHours).length) {
    if (!custom?.start || !custom?.end) return null
    start = custom.start; end = custom.end
  } else {
    const days = Array.isArray(shift.days) && shift.days.length ? shift.days : [0, 1, 2, 3, 4, 5, 6]
    if (!days.includes(weekday)) return null
    start = shift.startTime; end = shift.endTime
  }
  if (!start || !end) return null
  const s = toMin(start), e = toMin(end)
  const span = e > s ? e - s : e + 1440 - s
  const breakMinutes = Math.max(0, Number(shift.breakMinutes) || 0)
  return { start, end, startMin: s, endMin: e > s ? e : e + 1440, breakMinutes, expectedMinutes: Math.max(0, span - breakMinutes), graceMinutes: Math.max(0, Number(shift.graceMinutes ?? 10)) }
}

export function roundDown(minutes, step) {
  return step > 0 ? Math.floor(minutes / step) * step : minutes
}

// Summaries for every person-day in [from, to] (YYYY-MM-DD, company timezone).
// people: [{ id, shiftId }]; shifts: Map(id -> shift); reviews: Map(`${personId}|${day}` -> review)
export function computeDays({ punches, people, shifts, reviews = new Map(), rules = {}, tz = DEFAULT_TZ, from, to, now = new Date() }) {
  const cfg = { ...DEFAULT_RULES, ...rules }
  const today = localParts(now, tz).day
  const sessions = buildSessions(punches)
  const byPersonDay = new Map()
  for (const s of sessions) {
    const key = `${s.personId}|${localParts(s.start, tz).day}`
    if (!byPersonDay.has(key)) byPersonDay.set(key, [])
    byPersonDay.get(key).push(s)
  }
  const rows = []
  for (const person of people) {
    const shift = person.shiftId ? shifts.get(person.shiftId) ?? null : null
    for (const day of daysBetween(from, to)) {
      const plan = planForDay(shift, weekdayOfDay(day))
      const list = byPersonDay.get(`${person.id}|${day}`) ?? []
      const closed = list.filter((s) => !s.open)
      const grossMinutes = closed.reduce((n, s) => n + s.minutes, 0)
      const breakMinutes = plan?.breakMinutes ?? 0
      const workedMinutes = breakMinutes && grossMinutes >= BREAK_DEDUCT_AFTER_MIN ? grossMinutes - breakMinutes : grossMinutes
      const openSession = list.some((s) => s.open)
      if (!plan && !list.length) continue // rest day without activity: nothing to report
      const firstIn = list.length ? list[0].start : null
      const lastOut = closed.length ? closed[closed.length - 1].end : null
      let lateMinutes = 0, earlyLeaveMinutes = 0
      if (plan && firstIn) {
        const inMin = localParts(firstIn, tz).minutes
        const late = inMin - plan.startMin
        if (late > plan.graceMinutes) lateMinutes = late
      }
      if (plan && lastOut && !openSession) {
        const lp = localParts(lastOut, tz)
        const outMin = lp.day === day ? lp.minutes : lp.minutes + 1440
        const early = plan.endMin - outMin
        if (early > plan.graceMinutes) earlyLeaveMinutes = early
      }
      const absent = Boolean(plan) && !list.length && day < today
      // Overtime: beyond what the shift expects that day; rest days and no-shift people use
      // the company daily threshold (rest day with a shift: everything counts as extra).
      const baseline = plan ? plan.expectedMinutes : (shift ? 0 : cfg.dailyThresholdMinutes)
      const overtimeMinutes = roundDown(Math.max(0, workedMinutes - baseline), cfg.overtimeRoundingMinutes)
      const review = reviews.get(`${person.id}|${day}`) ?? null
      const overtimeStatus = overtimeMinutes === 0 ? 'none' : review?.status ?? (cfg.requireOvertimeApproval ? 'pending' : 'auto')
      const countedOvertime = overtimeStatus === 'approved' ? (review.approvedMinutes ?? overtimeMinutes) : overtimeStatus === 'auto' ? overtimeMinutes : 0
      rows.push({
        personId: person.id, day, weekday: weekdayOfDay(day), restDay: !plan, shiftId: shift?.id ?? null,
        planStart: plan?.start ?? null, planEnd: plan?.end ?? null, expectedMinutes: plan?.expectedMinutes ?? 0,
        workedMinutes, firstIn, lastOut, openSession, lateMinutes, earlyLeaveMinutes, absent,
        overtimeMinutes, overtimeStatus, countedOvertimeMinutes: countedOvertime,
        regularMinutes: Math.max(0, workedMinutes - overtimeMinutes),
      })
    }
  }
  return rows
}

export function totalsOf(rows) {
  const t = { daysWorked: 0, workedMinutes: 0, expectedMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, countedOvertimeMinutes: 0, pendingOvertimeMinutes: 0, lateDays: 0, lateMinutes: 0, earlyLeaveDays: 0, absentDays: 0 }
  for (const r of rows) {
    if (r.workedMinutes > 0 || r.openSession) t.daysWorked += 1
    t.workedMinutes += r.workedMinutes
    t.expectedMinutes += r.expectedMinutes
    t.regularMinutes += r.regularMinutes
    t.overtimeMinutes += r.overtimeMinutes
    t.countedOvertimeMinutes += r.countedOvertimeMinutes
    if (r.overtimeStatus === 'pending') t.pendingOvertimeMinutes += r.overtimeMinutes
    if (r.lateMinutes) { t.lateDays += 1; t.lateMinutes += r.lateMinutes }
    if (r.earlyLeaveMinutes) t.earlyLeaveDays += 1
    if (r.absent) t.absentDays += 1
  }
  return t
}
