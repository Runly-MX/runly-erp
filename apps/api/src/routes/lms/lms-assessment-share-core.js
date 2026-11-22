// Pure rules for the public link of a standalone evaluation (spec 2026-11-21
// section 8, phase 4): link settings, the consent notice and its version, and
// the registration window. No I/O. The link itself reuses the course share
// columns (share_enabled, share_token, share_settings) of lms_course.
import crypto from 'node:crypto'
import { LmsError } from './lms-error.js'
import { ACCESS_MODES } from './lms-share-core.js'
import { EMAIL_FIELD_KEY, normalizeIntakeFields, readIntakeFields } from './lms-intake-core.js'

export const ASSESSMENT_MAX_CUSTOM_FIELDS = 10
export const NOTICE_MAX = 4000
export const evaluationPath = (token) => `/app/p/lms/evaluacion/${token}`

// Only what the evaluation needs: the email identifies the person (dedupe and
// resume). Phone, city and the rest are opt-in per evaluation.
const DEFAULT_FIELDS = [{ key: EMAIL_FIELD_KEY, label: 'Correo', type: 'email', required: true, preset: true }]
const plain = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})
const cleanNotice = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, NOTICE_MAX)

// Version of a notice text: a short hash, so a changed text is a new version
// without anyone numbering it, and the accepted text is provable later.
export const noticeVersion = (text) => (text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 12) : null)

// With dedupe on, the email is always asked and required.
function withRequiredEmail(fields, dedupe) {
  if (!dedupe) return fields
  const rest = fields.filter((field) => field.key !== EMAIL_FIELD_KEY)
  return [{ ...DEFAULT_FIELDS[0] }, ...rest]
}

export function normalizeAssessmentShareSettings(raw) {
  const value = plain(raw)
  const dedupeByEmail = value.dedupeByEmail !== false
  const noticeText = cleanNotice(value.consent?.noticeText)
  return {
    accessMode: ACCESS_MODES.includes(value.accessMode) ? value.accessMode : 'open',
    dedupeByEmail,
    intakeFields: withRequiredEmail(readIntakeFields(value.intakeFields, { maxCustom: ASSESSMENT_MAX_CUSTOM_FIELDS, fallback: DEFAULT_FIELDS }), dedupeByEmail),
    // required: the person must tick it; without text there is nothing to accept.
    consent: { required: value.consent?.required === true && Boolean(noticeText), noticeText, version: noticeVersion(noticeText) },
  }
}

// PUT /lms/assessments/:id/share body. Missing keys keep the current settings.
export function normalizeAssessmentShareInput(body = {}, current = {}) {
  const base = normalizeAssessmentShareSettings(current)
  if (body.accessMode !== undefined && !ACCESS_MODES.includes(body.accessMode)) throw new LmsError('Modo de acceso inválido.', 400)
  const consentIn = plain(body.consent)
  const noticeText = consentIn.noticeText === undefined ? base.consent.noticeText : cleanNotice(consentIn.noticeText)
  const required = consentIn.required === undefined ? base.consent.required : consentIn.required === true
  if (required && !noticeText) throw new LmsError('Escribe el aviso que la persona debe aceptar.', 400)
  if (String(consentIn.noticeText ?? '').length > NOTICE_MAX) throw new LmsError(`El aviso no puede pasar de ${NOTICE_MAX} caracteres.`, 400)
  const dedupeByEmail = body.dedupeByEmail === undefined ? base.dedupeByEmail : body.dedupeByEmail !== false
  const fields = body.intakeFields === undefined ? base.intakeFields : normalizeIntakeFields(body.intakeFields, { maxCustom: ASSESSMENT_MAX_CUSTOM_FIELDS })
  return {
    enabled: body.enabled === undefined ? null : body.enabled === true,
    settings: {
      accessMode: body.accessMode ?? base.accessMode,
      dedupeByEmail,
      intakeFields: withRequiredEmail(fields, dedupeByEmail),
      consent: { required, noticeText },
    },
  }
}

// The consent the person gave at registration, or null when none is asked.
// `version` must match the notice shown: a notice changed meanwhile is refused.
export function consentRecord(settings, body, now) {
  const { consent } = settings
  if (!consent.noticeText) return null
  const given = plain(body?.consent)
  if (given.accepted !== true) {
    if (consent.required) throw new LmsError('Debes aceptar el aviso de privacidad para registrarte.', 400, 'CONSENT_REQUIRED')
    return null
  }
  if (given.version !== consent.version) throw new LmsError('El aviso cambió mientras lo leías. Revísalo de nuevo y acéptalo.', 409, 'CONSENT_CHANGED')
  return { version: consent.version, acceptedAt: new Date(now).toISOString(), text: consent.noticeText }
}

// Registration follows the evaluation window: no data is taken before it opens
// or after it closes (opening the page is always allowed).
export function availability(assessmentSettings, now) {
  const t = new Date(now).getTime()
  const { opensAt, closesAt } = assessmentSettings ?? {}
  if (opensAt && t < Date.parse(opensAt)) return 'upcoming'
  if (closesAt && t > Date.parse(closesAt)) return 'closed'
  return 'open'
}

export function registrationBlocker(assessmentSettings, now) {
  const state = availability(assessmentSettings, now)
  if (state === 'upcoming') return new LmsError('El registro abre cuando la evaluación esté disponible.', 409, 'NOT_OPEN')
  if (state === 'closed') return new LmsError('La evaluación ya cerró. No se aceptan registros.', 409, 'CLOSED')
  return null
}
