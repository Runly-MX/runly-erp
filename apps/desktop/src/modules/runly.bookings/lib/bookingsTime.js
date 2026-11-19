// Wall-clock helpers in a booking space's IANA time zone. Display and picking
// only: availability and validation always come from the Booking Engine.

const formatters = new Map()
function partsFormatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
    }))
  }
  return formatters.get(timeZone)
}
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function zonedParts(date, timeZone) {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(date)).map((x) => [x.type, x.value]))
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second), weekday: WEEKDAY[p.weekday] }
}

function offsetMs(instant, timeZone) {
  const p = zonedParts(instant, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000
}

// Local wall time -> instant. A time inside a DST gap moves forward, like the server.
export function wallToInstant({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = guess - offsetMs(guess, timeZone)
  return new Date(guess - offsetMs(first, timeZone))
}

const pad = (n) => String(n).padStart(2, '0')
export const dayKey = (date, timeZone) => { const p = zonedParts(date, timeZone); return `${p.year}-${pad(p.month)}-${pad(p.day)}` }
export const keyParts = (key) => { const [year, month, day] = key.split('-').map(Number); return { year, month, day } }
export function addDays(key, days) {
  const { year, month, day } = keyParts(key)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
export const weekdayOf = (key) => { const { year, month, day } = keyParts(key); return new Date(Date.UTC(year, month - 1, day)).getUTCDay() }
// Weeks start on Monday (es-MX).
export const weekStart = (key) => addDays(key, -((weekdayOf(key) + 6) % 7))
export const monthStart = (key) => `${key.slice(0, 7)}-01`
export function daysInMonth(key) { const { year, month } = keyParts(key); return new Date(Date.UTC(year, month, 0)).getUTCDate() }

// [from, to) instants covering whole local days.
export function daysRange(startKey, days, timeZone) {
  return { from: wallToInstant(keyParts(startKey), timeZone), to: wallToInstant(keyParts(addDays(startKey, days)), timeZone) }
}

export const formatTime = (date, timeZone) => new Intl.DateTimeFormat('es-MX', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date))
export const formatDay = (date, timeZone, options = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('es-MX', { timeZone, ...options }).format(new Date(date))
export const formatDateTime = (date, timeZone) => `${formatDay(date, timeZone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${formatTime(date, timeZone)}`
export const formatKey = (key, options) => formatDay(wallToInstant({ ...keyParts(key), hour: 12 }, 'UTC'), 'UTC', options)

// Minutes since local midnight, for placing blocks on a day grid.
export function minuteOfDay(date, timeZone) { const p = zonedParts(date, timeZone); return p.hour * 60 + p.minute }

export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City' } catch { return 'America/Mexico_City' }
}

export function supportedTimeZones() {
  try { return Intl.supportedValuesOf('timeZone') } catch { return ['America/Mexico_City', 'America/Monterrey', 'America/Cancun', 'America/Tijuana', 'America/Hermosillo', 'America/Mazatlan', 'UTC'] }
}
