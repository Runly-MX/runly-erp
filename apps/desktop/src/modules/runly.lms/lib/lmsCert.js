// Pure helpers for runly.lms certificates (phase 4): placeholders, labels,
// blob normalization and verification links. No React, no DOM globals at import.

export const CERT_PLACEHOLDERS = [
  { key: 'alumno', label: 'Alumno' },
  { key: 'curso', label: 'Curso' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'horas', label: 'Horas' },
  { key: 'folio', label: 'Folio' },
  { key: 'empresa', label: 'Empresa' },
]

export const DEFAULT_CERT_TITLE = 'Certificado de finalización'
export const DEFAULT_CERT_BODY = 'Se otorga a {{alumno}} por haber completado el curso {{curso}}, con una duración de {{horas}} horas, el {{fecha}}.'
export const NO_TEMPLATE = 'none'

const CERT_ERRORS = {
  NOT_COMPLETED: 'La persona aún no completa el curso.',
  NO_TEMPLATE: 'El curso no tiene una plantilla de certificado. Elígela en Configuración.',
  ALREADY_ISSUED: 'Esta inscripción ya tiene un certificado vigente.',
  IN_USE: 'La plantilla está asignada a uno o más cursos. Quítala de esos cursos antes de desactivarla.',
}

export const certErrorMessage = (error, fallback = 'No se pudo completar la acción.') => (
  CERT_ERRORS[error?.details?.code] ?? (error?.message || fallback)
)

// Inserts "{{key}}" at the textarea selection; returns the new text and caret.
export function insertPlaceholder(text, key, start, end) {
  const value = String(text ?? '')
  const from = Number.isInteger(start) ? Math.max(0, Math.min(start, value.length)) : value.length
  const to = Number.isInteger(end) ? Math.max(from, Math.min(end, value.length)) : from
  const token = `{{${key}}}`
  return { text: value.slice(0, from) + token + value.slice(to), caret: from + token.length }
}

// A valid certificate is one that exists and is not revoked.
export const hasValidCertificate = (enrollment) => Boolean(enrollment?.certificate && !enrollment.certificate.revokedAt)
export const canIssueCertificate = (enrollment) => enrollment?.status === 'completed' && !hasValidCertificate(enrollment)

const LONG_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// "16 de octubre de 2026" (local date). Empty string when invalid.
export function formatLongDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getDate()} de ${LONG_MONTHS[date.getMonth()]} de ${date.getFullYear()}`
}

// "4 h", "1,5 h". Empty string when unknown.
export function formatHours(hours) {
  const value = Number(hours)
  if (!Number.isFinite(value) || value <= 0) return ''
  return `${String(Math.round(value * 10) / 10).replace('.', ',')} h`
}

export const certificateFileName = (certificate) => `certificado-${String(certificate?.folio || 'runly').replace(/[^\w-]+/g, '_')}.pdf`

// Absolute URL for an API path; absolute URLs pass through.
export function toAbsoluteUrl(pathOrUrl, base) {
  const value = String(pathOrUrl ?? '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const root = String(base ?? '').replace(/\/+$/, '')
  return `${root}${value.startsWith('/') ? '' : '/'}${value}`
}

// Public verification link: the API sends an absolute verifyUrl when it knows
// the app base URL, otherwise a relative "/app/p/lms/cert/<token>".
export function verificationLink(certificate, origin) {
  if (certificate?.verifyUrl) return toAbsoluteUrl(certificate.verifyUrl, origin)
  return certificate?.token ? toAbsoluteUrl(`/app/p/lms/cert/${encodeURIComponent(certificate.token)}`, origin) : ''
}

const isBlob = (value) => typeof Blob !== 'undefined' && value instanceof Blob

// SDK download methods may resolve to a Blob, `{ blob }` (withMeta), a fetch
// Response or `{ data: Blob }`. Always resolves to a Blob or throws.
export async function toBlob(result) {
  if (isBlob(result)) return result
  if (isBlob(result?.blob)) return result.blob
  if (isBlob(result?.data)) return result.data
  if (result && typeof result.blob === 'function') {
    if (result.ok === false) {
      let details = null
      try { details = await result.json() } catch { /* not JSON */ }
      const error = new Error(details?.message || details?.error || `Error ${result.status}`)
      error.status = result.status
      error.details = details
      throw error
    }
    return result.blob()
  }
  throw new Error('La respuesta no contiene un archivo.')
}
