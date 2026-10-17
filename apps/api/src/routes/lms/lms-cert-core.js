// Pure rules for runly.lms certificates: template input, placeholder text,
// folios, hours, tokens and Spanish dates. No I/O.
import { randomBytes } from 'node:crypto'
import { LmsError } from './lms-error.js'

export const DEFAULT_CERT_TITLE = 'Certificado de finalización'
export const DEFAULT_CERT_BODY = 'Se otorga el presente certificado a {{alumno}} por haber concluido satisfactoriamente el curso {{curso}}, con una duración de {{horas}} horas, el {{fecha}}.'
export const CERT_PLACEHOLDERS = ['alumno', 'curso', 'fecha', 'horas', 'folio', 'empresa']
export const BODY_MAX = 2000

const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function required(value, label, max) {
  const text = String(value ?? '').trim()
  if (!text) throw new LmsError(`${label} es obligatorio.`, 400)
  if (text.length > max) throw new LmsError(`${label} no puede pasar de ${max} caracteres.`, 400)
  return text
}

function optional(value, label, max) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text.length > max) throw new LmsError(`${label} es demasiado largo.`, 400)
  return text || null
}

export function normalizeHexColor(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(text)) return text
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((ch) => ch + ch).join('')}`
  throw new LmsError('El color debe ser hexadecimal, por ejemplo #1e40af.', 400)
}

export function normalizeTemplateInput(body = {}, { partial = false } = {}) {
  const data = {}
  if (!partial || has(body, 'name')) data.name = required(body.name, 'El nombre', 120)
  if (!partial || has(body, 'title')) data.title = required(has(body, 'title') ? body.title : DEFAULT_CERT_TITLE, 'El título', 200)
  if (!partial || has(body, 'body')) {
    data.body = has(body, 'body') ? optional(body.body, 'El texto', BODY_MAX) : DEFAULT_CERT_BODY
  }
  if (has(body, 'signerName')) data.signerName = optional(body.signerName, 'El nombre de quien firma', 120)
  if (has(body, 'signerTitle')) data.signerTitle = optional(body.signerTitle, 'El cargo de quien firma', 120)
  if (has(body, 'signatureFileId')) {
    const id = body.signatureFileId === null || body.signatureFileId === '' ? null : String(body.signatureFileId).trim()
    if (id && !UUID.test(id)) throw new LmsError('Identificador de firma inválido.', 400)
    data.signatureFileId = id
  }
  if (!partial || has(body, 'accentColor')) data.accentColor = normalizeHexColor(body.accentColor)
  if (!partial || has(body, 'showLogo')) data.showLogo = body.showLogo !== false
  if (partial && has(body, 'enabled')) data.enabled = body.enabled !== false
  return data
}

// Plain text in, plain text out; unknown placeholders stay as written.
export function renderTemplateText(body, vars = {}) {
  return String(body ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) => {
    const name = key.toLowerCase()
    return Object.prototype.hasOwnProperty.call(vars, name) && vars[name] !== null && vars[name] !== undefined ? String(vars[name]) : match
  })
}

export function formatFolio(year, seq) {
  return `${year}-${String(seq).padStart(6, '0')}`
}

export function nextSequence(lastFolio, year) {
  const match = /^(\d{4})-(\d+)$/.exec(String(lastFolio ?? ''))
  if (!match || Number(match[1]) !== Number(year)) return 1
  return Number(match[2]) + 1
}

// estimatedMinutes wins; otherwise the sum of lesson durations.
export function certificateHours({ estimatedMinutes = null, lessonDurationsSeconds = [] } = {}) {
  const minutes = estimatedMinutes !== null && estimatedMinutes !== undefined
    ? Number(estimatedMinutes) || 0
    : lessonDurationsSeconds.reduce((sum, value) => sum + (Number(value) > 0 ? Number(value) : 0), 0) / 60
  if (minutes <= 0) return 0
  return Math.max(0.5, Math.round((minutes / 60) * 2) / 2)
}

export const formatHours = (hours) => (Number.isInteger(hours) ? String(hours) : String(Number(hours).toFixed(1)))

export function newToken() {
  return randomBytes(18).toString('base64url')
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function formatIssueDate(date) {
  const d = new Date(date)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}
