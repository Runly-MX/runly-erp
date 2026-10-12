// Pure helpers for the weekly shift schedule: { "1": { start, end }, ... } with 0 = Sunday.
// An absent weekday is a rest day. Dependency-free so it can be unit tested with node --test.

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const DAY_SHORT = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' }
export const DAY_LONG = { 0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' }
export const DEFAULT_DAY = { start: '08:00', end: '17:00' }
export const BREAK_CHOICES = [0, 15, 30, 45, 60, 90]

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export const isValidHours = (w) => Boolean(w && HHMM.test(w.start ?? '') && HHMM.test(w.end ?? ''))

// Minutes between start and end; an end at or before the start wraps past midnight.
export function spanMinutes(w) {
  if (!isValidHours(w)) return 0
  const s = toMin(w.start)
  const e = toMin(w.end)
  return e > s ? e - s : e + 1440 - s
}

// Weekly schedule of a shift row. New shifts carry dayHours; old ones are rebuilt from
// startTime / endTime / days (an empty days list means every day).
export function dayHoursFromShift(shift) {
  if (!shift) return {}
  if (shift.dayHours && typeof shift.dayHours === 'object' && Object.keys(shift.dayHours).length) {
    return Object.fromEntries(Object.entries(shift.dayHours).filter(([, w]) => isValidHours(w)).map(([k, w]) => [k, { start: w.start, end: w.end }]))
  }
  const start = shift.startTime ?? DEFAULT_DAY.start
  const end = shift.endTime ?? DEFAULT_DAY.end
  const days = Array.isArray(shift.days) && shift.days.length ? shift.days : [0, 1, 2, 3, 4, 5, 6]
  return Object.fromEntries(days.map((d) => [String(d), { start, end }]))
}

export function weeklyMinutes(dayHours, breakMinutes = 0) {
  const brk = Math.max(0, Number(breakMinutes) || 0)
  return Object.values(dayHours ?? {}).reduce((sum, w) => (isValidHours(w) ? sum + Math.max(0, spanMinutes(w) - brk) : sum), 0)
}

// 2520 -> "42 h"; 2535 -> "42 h 15 min".
export function formatHoursShort(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// 125 -> "2:05" (used by the daily hours report).
export function formatHm(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function dayRange(days) {
  if (days.length === 1) return DAY_SHORT[days[0]]
  if (days.length === 2) return `${DAY_SHORT[days[0]]} y ${DAY_SHORT[days[1]]}`
  return `${DAY_SHORT[days[0]]}-${DAY_SHORT[days[days.length - 1]]}`
}

// "Lun-Jue 08:00-18:00 · Vie 08:00-14:00": consecutive days with the same hours are merged.
export function summarizeSchedule(dayHours) {
  const groups = []
  for (const day of WEEK_ORDER) {
    const w = dayHours?.[String(day)]
    if (!isValidHours(w)) continue
    const last = groups[groups.length - 1]
    const prevDay = last?.days[last.days.length - 1]
    const consecutive = last && WEEK_ORDER.indexOf(day) === WEEK_ORDER.indexOf(prevDay) + 1
    if (last && consecutive && last.start === w.start && last.end === w.end) last.days.push(day)
    else groups.push({ days: [day], start: w.start, end: w.end })
  }
  if (!groups.length) return 'Sin días laborables'
  return groups.map((g) => `${dayRange(g.days)} ${g.start}-${g.end}`).join(' · ')
}

// ---- Editing ------------------------------------------------------------
export const presetWeekdays = () => Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), { ...DEFAULT_DAY }]))
export const presetLongDays = () => ({
  ...Object.fromEntries([1, 2, 3, 4].map((d) => [String(d), { start: '08:00', end: '18:00' }])),
  5: { start: '08:00', end: '14:00' },
})

// Copies the first active day's hours (Monday when active) onto every active day.
export function copyMondayToActive(dayHours) {
  const firstKey = WEEK_ORDER.map(String).find((k) => dayHours?.[k])
  const source = dayHours?.['1'] ?? (firstKey ? dayHours[firstKey] : null)
  if (!source) return { ...dayHours }
  return Object.fromEntries(Object.keys(dayHours).map((k) => [k, { start: source.start, end: source.end }]))
}

// A day switched on starts with Monday's hours (or the 08:00-17:00 default).
export function setDayActive(dayHours, day, active) {
  const next = { ...dayHours }
  const key = String(day)
  if (!active) { delete next[key]; return next }
  const template = dayHours?.['1'] ?? Object.values(dayHours ?? {}).find(isValidHours) ?? DEFAULT_DAY
  next[key] = { start: template.start, end: template.end }
  return next
}

export const setDayTime = (dayHours, day, field, value) => ({ ...dayHours, [String(day)]: { ...(dayHours?.[String(day)] ?? DEFAULT_DAY), [field]: value } })

// Keeps only active days with valid times; null when there is nothing left.
export function cleanDayHours(dayHours) {
  const out = Object.fromEntries(Object.entries(dayHours ?? {}).filter(([k, w]) => /^[0-6]$/.test(k) && isValidHours(w)).map(([k, w]) => [k, { start: w.start, end: w.end }]))
  return Object.keys(out).length ? out : null
}

const shiftPart = (hhmm) => {
  const h = Number(hhmm.slice(0, 2))
  return h >= 5 && h < 12 ? 'Matutino' : h >= 12 && h < 19 ? 'Vespertino' : 'Nocturno'
}

// "Matutino 08:00–17:00" from the first active day; "(variable)" when days differ.
export function suggestNameFromDayHours(dayHours) {
  const days = WEEK_ORDER.map((d) => dayHours?.[String(d)]).filter(isValidHours)
  if (!days.length) return ''
  const first = days[0]
  const same = days.every((w) => w.start === first.start && w.end === first.end)
  return `${shiftPart(first.start)} ${first.start}–${first.end}${same ? '' : ' (variable)'}`
}
