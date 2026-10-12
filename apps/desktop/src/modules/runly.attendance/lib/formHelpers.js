// Pure helpers behind the attendance forms: pickers' option lists, suggestions and generators.
// Everything here is dependency-free so it can be unit tested with node --test.

const pad2 = (n) => String(n).padStart(2, '0')

// ---- Days ---------------------------------------------------------------
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
export const DAY_PRESETS = [
  { key: 'weekdays', label: 'Lunes a viernes', days: [1, 2, 3, 4, 5] },
  { key: 'sixdays', label: 'Lunes a sábado', days: [1, 2, 3, 4, 5, 6] },
  { key: 'all', label: 'Todos', days: ALL_DAYS },
]

const sortDays = (days) => [...new Set(days.map(Number))].sort((a, b) => a - b)

// An empty list means "every day" in the data model; the chips show it as all selected.
export const effectiveDays = (days) => (Array.isArray(days) && days.length ? sortDays(days) : ALL_DAYS)

// Toggles one weekday; the last remaining day cannot be removed.
export function toggleDay(days, day) {
  const current = effectiveDays(days)
  if (current.includes(day)) return current.length === 1 ? current : current.filter((d) => d !== day)
  return sortDays([...current, day])
}

export const isSameDays = (a, b) => {
  const x = effectiveDays(a)
  const y = effectiveDays(b)
  return x.length === y.length && x.every((d, i) => d === y[i])
}

// All seven days are stored as [] (= every day).
export const normalizeDays = (days) => {
  const list = effectiveDays(days)
  return list.length === 7 ? [] : list
}

// ---- Time ---------------------------------------------------------------
export function formatTime12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return String(hhmm)
  return `${h % 12 === 0 ? 12 : h % 12}:${pad2(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

// "08:00" every `step` minutes; labels are 12h friendly, the 24h text stays searchable.
export function buildTimeOptions(step = 15, current) {
  const options = []
  for (let min = 0; min < 24 * 60; min += step) {
    const value = `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
    options.push({ value, label: value, keywords: value })
  }
  if (current && /^\d{2}:\d{2}$/.test(current) && !options.some((o) => o.value === current)) {
    options.push({ value: current, label: current, keywords: current })
    options.sort((a, b) => a.value.localeCompare(b.value))
  }
  return options
}

const shiftPart = (hhmm) => {
  const h = Number(String(hhmm).slice(0, 2))
  if (h < 5) return 'Nocturno'
  if (h < 12) return 'Matutino'
  if (h < 19) return 'Vespertino'
  return 'Nocturno'
}

// "Matutino 08:00–16:00" from the start and end times; '' while either is missing.
export function suggestShiftName(start, end) {
  const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t ?? '')
  if (!ok(start) || !ok(end)) return ''
  return `${shiftPart(start)} ${start}–${end}`
}

export const TOLERANCE_OPTIONS = [
  { value: '0', label: 'Sin tolerancia' },
  { value: '5', label: '5 minutos' },
  { value: '10', label: '10 minutos' },
  { value: '15', label: '15 minutos' },
  { value: '30', label: '30 minutos' },
]

export const RADIUS_OPTIONS = [
  { value: 'none', label: 'Sin límite' },
  { value: '50', label: '50 m' },
  { value: '100', label: '100 m' },
  { value: '200', label: '200 m' },
  { value: '300', label: '300 m' },
  { value: '500', label: '500 m' },
  { value: '1000', label: '1 km' },
]
export const DEFAULT_RADIUS_M = 200

// Adds a stored value that is not one of the presets (e.g. an old 75 m radius) so it still displays.
export function withCurrentOption(options, current, formatLabel) {
  if (current == null || current === '' || options.some((o) => o.value === String(current))) return options
  const extra = { value: String(current), label: formatLabel(Number(current)) }
  return [...options, extra].sort((a, b) => (a.value === 'none' ? -1 : b.value === 'none' ? 1 : Number(a.value) - Number(b.value)))
}
export const radiusOptionsFor = (current) => withCurrentOption(RADIUS_OPTIONS, current, (m) => (m >= 1000 ? `${m / 1000} km` : `${m} m`))
export const toleranceOptionsFor = (current) => withCurrentOption(TOLERANCE_OPTIONS, current, (m) => `${m} minutos`)

// ---- Quotas -------------------------------------------------------------
// "Soldadores · Contratista Uno": category, group and site names that are set.
export function suggestQuotaName(form, lookups) {
  const pick = (map, id) => (id && map?.get ? map.get(id) : null)
  return [pick(lookups?.categories, form.categoryId), pick(lookups?.groups, form.groupId), pick(lookups?.sites, form.siteId)].filter(Boolean).join(' · ')
}

// ---- Location -----------------------------------------------------------
export const hasCoords = (lat, lng) => lat !== '' && lat != null && lng !== '' && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
export const formatCoords = (lat, lng) => `Lat ${Number(lat).toFixed(4)}, Lng ${Number(lng).toFixed(4)}`
export const osmUrl = (lat, lng) => `https://www.openstreetmap.org/?mlat=${Number(lat)}&mlon=${Number(lng)}#map=17/${Number(lat)}/${Number(lng)}`

// ---- Timezones ----------------------------------------------------------
const CITY_NAMES = {
  'America/Mexico_City': 'Ciudad de México', 'America/Monterrey': 'Monterrey', 'America/Merida': 'Mérida', 'America/Cancun': 'Cancún',
  'America/Tijuana': 'Tijuana', 'America/Chihuahua': 'Chihuahua', 'America/Hermosillo': 'Hermosillo', 'America/Mazatlan': 'Mazatlán',
  'America/Bogota': 'Bogotá', 'America/Lima': 'Lima', 'America/Santiago': 'Santiago de Chile', 'America/Argentina/Buenos_Aires': 'Buenos Aires',
  'America/Sao_Paulo': 'São Paulo', 'America/Caracas': 'Caracas', 'America/Guatemala': 'Guatemala', 'America/Costa_Rica': 'Costa Rica',
  'America/Panama': 'Panamá', 'America/El_Salvador': 'El Salvador', 'America/Tegucigalpa': 'Tegucigalpa', 'America/Managua': 'Managua',
  'America/Santo_Domingo': 'Santo Domingo', 'America/Havana': 'La Habana', 'America/La_Paz': 'La Paz', 'America/Montevideo': 'Montevideo',
  'America/Asuncion': 'Asunción', 'America/Guayaquil': 'Guayaquil', 'America/Puerto_Rico': 'Puerto Rico',
  'America/New_York': 'Nueva York', 'America/Chicago': 'Chicago', 'America/Denver': 'Denver', 'America/Phoenix': 'Phoenix',
  'America/Los_Angeles': 'Los Ángeles', 'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawái', 'America/Toronto': 'Toronto',
  'America/Vancouver': 'Vancouver', 'America/Edmonton': 'Edmonton', 'America/Winnipeg': 'Winnipeg', 'America/Halifax': 'Halifax',
  'Europe/Madrid': 'Madrid', 'Atlantic/Canary': 'Islas Canarias', 'Europe/London': 'Londres', 'Europe/Paris': 'París', 'Europe/Berlin': 'Berlín',
  'Europe/Rome': 'Roma', 'Europe/Lisbon': 'Lisboa', 'Europe/Amsterdam': 'Ámsterdam', 'Europe/Brussels': 'Bruselas', 'Europe/Zurich': 'Zúrich',
  'Europe/Vienna': 'Viena', 'Europe/Moscow': 'Moscú', 'Europe/Athens': 'Atenas', 'Europe/Istanbul': 'Estambul', UTC: 'Hora universal',
}
const LATAM = new Set([
  'America/Mexico_City', 'America/Monterrey', 'America/Merida', 'America/Cancun', 'America/Tijuana', 'America/Chihuahua', 'America/Hermosillo',
  'America/Mazatlan', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'America/Caracas',
  'America/Guatemala', 'America/Costa_Rica', 'America/Panama', 'America/El_Salvador', 'America/Tegucigalpa', 'America/Managua', 'America/Santo_Domingo',
  'America/Havana', 'America/La_Paz', 'America/Montevideo', 'America/Asuncion', 'America/Guayaquil', 'America/Puerto_Rico', 'America/Belize',
])
const NORTH_AMERICA = new Set([
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax',
])
const GROUPS = ['América Latina', 'Estados Unidos y Canadá', 'España y Europa', 'Otras zonas']
const FALLBACK_ZONES = Object.keys(CITY_NAMES)

function groupOf(zone) {
  if (LATAM.has(zone)) return GROUPS[0]
  if (NORTH_AMERICA.has(zone)) return GROUPS[1]
  if (zone.startsWith('Europe/') || zone === 'Atlantic/Canary') return GROUPS[2]
  return GROUPS[3]
}

// Offset in minutes from UTC for a zone at `date` (0 when the zone is unknown).
export function zoneOffsetMinutes(zone, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part)
    if (!m) return 0
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
  } catch { return 0 }
}

export function offsetLabel(minutes) {
  if (!minutes) return 'GMT'
  const abs = Math.abs(minutes)
  const rest = abs % 60
  return `GMT${minutes < 0 ? '-' : '+'}${Math.floor(abs / 60)}${rest ? `:${pad2(rest)}` : ''}`
}

export function timezoneLabel(zone, date = new Date()) {
  const city = CITY_NAMES[zone] ?? (zone.split('/').slice(1).join(' / ').replace(/_/g, ' ') || zone)
  return `${city} (${offsetLabel(zoneOffsetMinutes(zone, date))})`
}

export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

function supportedZones() {
  try {
    const zones = Intl.supportedValuesOf('timeZone')
    if (zones?.length) return zones
  } catch { /* older engines */ }
  return FALLBACK_ZONES
}

// Combobox options grouped (Latin America, USA/Canada, Spain/Europe first), sorted by offset then name.
// `current` is always included even when the engine does not list it (e.g. "UTC").
export function buildTimezoneOptions({ zones = supportedZones(), current, date = new Date() } = {}) {
  const list = new Set(zones)
  if (current) list.add(current)
  list.add('UTC')
  const rows = [...list].map((zone) => ({
    value: zone,
    label: timezoneLabel(zone, date),
    group: groupOf(zone),
    keywords: `${zone} ${zone.replace(/_/g, ' ')}`,
    offset: zoneOffsetMinutes(zone, date),
  }))
  rows.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.offset - b.offset || a.label.localeCompare(b.label, 'es'))
  return rows.map(({ offset, ...option }) => option) // eslint-disable-line no-unused-vars
}

// ---- People -------------------------------------------------------------
// Next free employee code: continues the dominant "PREFIX + number" pattern (keeps zero padding).
export function suggestNextCode(codes) {
  const list = (codes ?? []).map((c) => String(c ?? '').trim()).filter(Boolean)
  const buckets = new Map()
  for (const code of list) {
    const m = /^(.*?)(\d+)$/.exec(code)
    if (!m) continue
    const [, prefix, digits] = m
    const bucket = buckets.get(prefix) ?? { count: 0, max: -1, width: 0 }
    bucket.count += 1
    const n = Number(digits)
    if (n > bucket.max) { bucket.max = n; bucket.width = digits.length }
    buckets.set(prefix, bucket)
  }
  if (!buckets.size) return '1'
  const [prefix, best] = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count || b[1].max - a[1].max)[0]
  const used = new Set(list)
  let n = best.max + 1
  let next = `${prefix}${String(n).padStart(best.width, '0')}`
  while (used.has(next)) { n += 1; next = `${prefix}${String(n).padStart(best.width, '0')}` }
  return next
}

export function isWeakPin(pin) {
  const d = [...pin].map(Number)
  if (d.every((x) => x === d[0])) return true
  const steps = d.slice(1).map((x, i) => x - d[i])
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true
  return pin.slice(0, 2) === pin.slice(2) // 1212-style repeats
}

function secureRandomInt(max) {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] % max
}

// Random 4-digit PIN that avoids obvious patterns (0000, 1234, 4321, 1212).
export function generatePin(random = secureRandomInt) {
  for (let i = 0; i < 100; i += 1) {
    const pin = String(random(10000)).padStart(4, '0')
    if (!isWeakPin(pin)) return pin
  }
  return '7391'
}

// ---- Kiosks -------------------------------------------------------------
// "Kiosko Planta" for the first kiosk of a site, then "Kiosko Planta 2"; plain "Kiosko 1" without a site.
export function suggestKioskName(existingNames, siteName) {
  const names = new Set((existingNames ?? []).map((n) => String(n).trim().toLowerCase()))
  const base = siteName ? `Kiosko ${siteName}` : 'Kiosko'
  if (siteName && !names.has(base.toLowerCase())) return base
  let n = siteName ? 2 : 1
  while (names.has(`${base} ${n}`.toLowerCase())) n += 1
  return `${base} ${n}`
}
