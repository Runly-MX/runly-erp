// Spanish labels and small pure helpers shared by the attendance screens.

export const FLAG_LABELS = {
  clock_skew: 'Reloj desfasado',
  offline: 'Sin conexión',
  sequence: 'Secuencia irregular',
  proof_failed: 'Identidad no verificada',
  replay: 'QR reutilizado',
  manual: 'Manual',
}

// Flags that merit attention (red); the rest are informative.
const SEVERE_FLAGS = new Set(['proof_failed', 'replay', 'clock_skew'])

export const flagLabel = (flag) => FLAG_LABELS[flag] ?? String(flag)
export const flagVariant = (flag) => (SEVERE_FLAGS.has(flag) ? 'destructive' : flag === 'manual' || flag === 'offline' ? 'secondary' : 'warning')

export const flagTone = (flag) => (SEVERE_FLAGS.has(flag) ? 'rose' : flag === 'manual' ? 'slate' : flag === 'offline' ? 'blue' : 'amber')

export const DIRECTION_LABELS = { in: 'Entrada', out: 'Salida' }

export const METHOD_LABELS = {
  card: 'Tarjeta',
  pin: 'PIN',
  code: 'Código',
  phone_qr: 'Llave de teléfono',
  manual: 'Manual',
}
export const methodLabel = (method) => METHOD_LABELS[method] ?? (method || '—')

export const KIND_LABELS = { internal: 'Interno', contractor: 'Contratista', visitor: 'Visitante' }
export const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))

export const KIOSK_MODE_OPTIONS = [
  { value: 'both', label: 'Entradas y salidas' },
  { value: 'in', label: 'Solo entradas' },
  { value: 'out', label: 'Solo salidas' },
]

export const WEEKDAYS = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
]

export function fullName(person) {
  if (!person) return '—'
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.code || '—'
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export function minutesToHours(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`
}

// A kiosk is "online" when it pinged the API in the last 5 minutes.
export const KIOSK_ONLINE_MS = 5 * 60_000
export function kioskStatus(kiosk, now = Date.now()) {
  if (kiosk.revokedAt) return { key: 'revoked', label: 'Revocado', variant: 'destructive' }
  if (kiosk.pairingPending) return { key: 'pending', label: 'Pendiente de aprobar', variant: 'warning' }
  if (!kiosk.paired) return { key: 'unpaired', label: 'Sin emparejar', variant: 'secondary' }
  const seen = kiosk.lastSeenAt ? new Date(kiosk.lastSeenAt).getTime() : 0
  return now - seen < KIOSK_ONLINE_MS
    ? { key: 'online', label: 'En línea', variant: 'success' }
    : { key: 'offline', label: 'Sin conexión', variant: 'secondary' }
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value)
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Builds a CSV string (BOM-prefixed so Excel reads UTF-8 accents correctly).
export function buildCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

// Start / end of a local "YYYY-MM-DD" day as instants (ISO strings for the API).
export function dayStartIso(day) {
  return day ? new Date(`${day}T00:00:00`).toISOString() : undefined
}
export function dayEndIso(day) {
  return day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined
}

export function enrollLink(origin, code) {
  return `${origin}/app/attendance/phone?c=${encodeURIComponent(code)}`
}
export function kioskLink(origin, linkToken) {
  return `${origin}/app/kiosk/${linkToken}`
}

// Groups the live presence list into [{ key, label, count }] for charts.
export function tallyBy(counts, lookup, noneLabel) {
  return Object.entries(counts ?? {})
    .map(([key, count]) => ({ key, label: key === 'none' ? noneLabel : (lookup.get(key) ?? 'Desconocido'), count }))
    .sort((a, b) => b.count - a.count)
}
