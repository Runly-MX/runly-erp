// Signed self-service ("Mis horas" / "Olvidé checar"). The phone signs the UTF-8 message
// `<action>|<personId>|<unixSeconds>[|extra...]` (valid 5 minutes) with its non-exportable key.
// Hours only: nothing here ever mentions pay.
import { bytesToBase64Url } from '../../kiosk/lib/encoding.js'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'

export const MAX_CORRECTION_DAYS = 14
const CACHE_PREFIX = 'runly-attendance-phone-hours:'

export async function signSelf(action, personId, ts, extra, privateKey, subtle = globalThis.crypto.subtle) {
  const message = [action, personId, ts, ...(extra ?? [])].join('|')
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(message))
  return bytesToBase64Url(signature)
}

const REVOKED = 'Este teléfono ya no está autorizado. Pide una nueva invitación a tu administrador.'
export const OFFLINE_MESSAGE = 'Necesitas conexión a internet.'

export function selfServiceErrorMessage({ code, status, fallback } = {}) {
  if (code === 'NETWORK' || status === 0) return OFFLINE_MESSAGE
  if (code === 'BAD_SIGNATURE' || code === 'UNKNOWN_PERSON') return REVOKED
  if (code === 'CORRECTIONS_OFF') return 'Tu empresa no permite solicitar checadas olvidadas.'
  if (status === 429) return 'Demasiados intentos. Espera unos segundos e inténtalo de nuevo.'
  if (status === 409) return 'Ya existe una solicitud o una checada para ese momento.'
  if (status === 400 && fallback) return fallback
  return 'No se pudo completar la solicitud. Inténtalo de nuevo.'
}

async function postSigned(path, body, fetchImpl) {
  let response
  try {
    response = await fetchImpl(`${getApiUrl()}/public/attendance/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    const error = new Error(OFFLINE_MESSAGE)
    error.code = 'NETWORK'
    error.status = 0
    throw error
  }
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(selfServiceErrorMessage({ code: json.code, status: response.status, fallback: typeof json.error === 'string' ? json.error : undefined }))
    error.code = json.code ?? null
    error.status = response.status
    throw error
  }
  return json.data
}

export async function fetchMyHours(identity, { fetchImpl = fetch, now = Date.now() } = {}) {
  const ts = Math.floor(now / 1000)
  const signature = await signSelf('me', identity.personId, ts, [], identity.privateKey)
  return postSigned('me', { personId: identity.personId, ts, signature }, fetchImpl)
}

export async function requestCorrection(identity, { direction, occurredAt, reason }, { fetchImpl = fetch, now = Date.now() } = {}) {
  const ts = Math.floor(now / 1000)
  const signature = await signSelf('corr', identity.personId, ts, [direction, occurredAt], identity.privateKey)
  const text = typeof reason === 'string' ? reason.trim() : ''
  return postSigned('me/correction', { personId: identity.personId, ts, direction, occurredAt, ...(text ? { reason: text } : {}), signature }, fetchImpl)
}

// ---- local cache of the last successful response ----
export function loadCachedHours(personId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(CACHE_PREFIX + personId)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveCachedHours(personId, data, savedAt = Date.now(), storage = globalThis.localStorage) {
  try { storage?.setItem(CACHE_PREFIX + personId, JSON.stringify({ savedAt, data })) } catch { /* ignore */ }
}

// ---- formatting ----
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// 'YYYY-MM-DD' -> 'Lun 12 oct' (no timezone math: the day string is already the company-local day).
export function formatDayLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day ?? ''))
  if (!m) return String(day ?? '')
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

export function formatDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`
}

export const METHOD_LABELS = {
  pin: 'PIN', code: 'Código', card: 'Tarjeta', phone_qr: 'Mi QR', phone_scan: 'Escaneo', manual: 'Manual',
}
export const methodLabel = (method) => METHOD_LABELS[method] ?? 'Otro'

export const OVERTIME_STATUS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  approved: { label: 'Aprobada', tone: 'green' },
  auto: { label: 'Aprobada', tone: 'green' },
  rejected: { label: 'Rechazada', tone: 'gray' },
}
export const CORRECTION_STATUS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  approved: { label: 'Aprobada', tone: 'green' },
  rejected: { label: 'Rechazada', tone: 'gray' },
}

// Compact schedule: groups consecutive weekdays with the same hours. dayHours keys: 0..6 (0 = Sunday).
export function formatSchedule(shift) {
  if (!shift) return ''
  const dayHours = shift.dayHours
  if (dayHours && typeof dayHours === 'object') {
    const order = [1, 2, 3, 4, 5, 6, 0]
    const groups = []
    for (const d of order) {
      const h = dayHours[d] ?? dayHours[String(d)]
      if (!h?.start || !h?.end) continue
      const label = `${h.start}-${h.end}`
      const last = groups[groups.length - 1]
      if (last && last.label === label && order.indexOf(last.to) === order.indexOf(d) - 1) last.to = d
      else groups.push({ from: d, to: d, label })
    }
    return groups.map((g) => `${g.from === g.to ? WEEKDAYS[g.from] : `${WEEKDAYS[g.from]}-${WEEKDAYS[g.to]}`} ${g.label}`).join(' · ')
  }
  const days = Array.isArray(shift.days) ? shift.days : []
  const names = days.map((d) => WEEKDAYS[Number(d) % 7]).join(', ')
  const range = shift.startTime && shift.endTime ? `${shift.startTime}-${shift.endTime}` : ''
  return [names, range].filter(Boolean).join(' ')
}

export function hoursPreview(data) {
  const t = data?.week?.totals
  if (!t) return ''
  const extra = t.overtimeMinutes > 0 ? ` · ${formatMinutes(t.overtimeMinutes)} extra` : ''
  return `Esta semana ${formatMinutes(t.workedMinutes)} h${extra}`
}

// Validates a local date ('YYYY-MM-DD') + time ('HH:MM'). Returns { iso } or { error }.
export function buildOccurredAt(date, time, now = new Date()) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '')
  const tm = /^(\d{2}):(\d{2})$/.exec(time ?? '')
  if (!dm || !tm) return { error: 'Elige la fecha y la hora.' }
  const local = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0, 0)
  if (Number.isNaN(local.getTime())) return { error: 'Elige la fecha y la hora.' }
  if (local.getTime() > now.getTime()) return { error: 'La hora no puede ser futura.' }
  if (now.getTime() - local.getTime() > MAX_CORRECTION_DAYS * 86_400_000) return { error: `Solo puedes solicitar checadas de los últimos ${MAX_CORRECTION_DAYS} días.` }
  return { iso: local.toISOString() }
}

export function localDateInput(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function localTimeInput(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
