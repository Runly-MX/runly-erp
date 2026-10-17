// Guest intake form of a course share link (spec §17.4): the field contract,
// the manager's configuration and the guest's answers. Pure, no I/O.
//
// share_settings.intakeFields = [{ key, label, type, required, preset }]. The
// name is always asked (it is learner.displayName) and is not in the list.
import { LmsError } from './lms-error.js'

export const INTAKE_TYPES = ['text', 'email', 'phone', 'number']
export const MAX_CUSTOM_FIELDS = 5
export const INTAKE_LABEL_MAX = 60
export const INTAKE_VALUE_MAX = 120
const EMAIL_MAX = 200

// Presets the manager toggles. `tag` is the certificate tag that prints the answer.
export const INTAKE_PRESETS = [
  { key: 'numero_empleado', label: 'Número de empleado', type: 'text', tag: 'numero_empleado' },
  { key: 'empresa', label: 'Empresa', type: 'text', tag: 'empresa_alumno' },
  { key: 'puesto', label: 'Puesto', type: 'text', tag: 'puesto' },
  { key: 'correo', label: 'Correo', type: 'email', tag: null },
  { key: 'telefono', label: 'Teléfono', type: 'phone', tag: null },
]
const PRESET_BY_KEY = new Map(INTAKE_PRESETS.map((preset) => [preset.key, preset]))
export const EMAIL_FIELD_KEY = 'correo'

// Before intake forms existed the join form asked name + optional email: a
// course without the key keeps that behaviour.
export const DEFAULT_INTAKE_FIELDS = [{ key: 'correo', label: 'Correo', type: 'email', required: false, preset: true }]

const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[0-9()\-.\s]{7,25}$/
const NUMBER_RE = /^-?\d{1,15}(?:[.,]\d{1,4})?$/
const bad = (message) => new LmsError(message, 400)

// "Talla de playera" -> "talla_de_playera" (ascii, max 24, starts with a letter).
export function slugifyFieldKey(label) {
  const slug = String(label ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24).replace(/_+$/, '')
  if (!slug) return null
  return /^[a-z]/.test(slug) ? slug : `c_${slug}`.slice(0, 24)
}

// Stored JSON -> clean list (never throws; unknown rows are dropped).
export function readIntakeFields(value) {
  if (!Array.isArray(value)) return DEFAULT_INTAKE_FIELDS.map((field) => ({ ...field }))
  const seen = new Set()
  const out = []
  let custom = 0
  for (const raw of value) {
    const key = String(raw?.key ?? '')
    if (!KEY_RE.test(key) || seen.has(key)) continue
    const preset = PRESET_BY_KEY.get(key)
    if (preset) {
      out.push({ key, label: preset.label, type: preset.type, required: raw.required === true, preset: true })
    } else {
      const label = String(raw?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, INTAKE_LABEL_MAX)
      if (!label || custom >= MAX_CUSTOM_FIELDS) continue
      custom += 1
      out.push({ key, label, type: INTAKE_TYPES.includes(raw.type) ? raw.type : 'text', required: raw.required === true, preset: false })
    }
    seen.add(key)
  }
  return out
}

// PUT /share body.intakeFields -> validated list. Throws LmsError 400.
export function normalizeIntakeFields(input) {
  if (!Array.isArray(input)) throw bad('Envía la lista de campos del formulario.')
  if (input.length > INTAKE_PRESETS.length + MAX_CUSTOM_FIELDS) throw bad('Demasiados campos en el formulario.')
  const seen = new Set()
  let custom = 0
  const fields = input.map((raw) => {
    const presetKey = PRESET_BY_KEY.has(raw?.key) ? raw.key : null
    if (presetKey) {
      if (seen.has(presetKey)) throw bad(`El campo ${PRESET_BY_KEY.get(presetKey).label} está repetido.`)
      seen.add(presetKey)
      const preset = PRESET_BY_KEY.get(presetKey)
      return { key: preset.key, label: preset.label, type: preset.type, required: raw.required === true, preset: true }
    }
    const label = String(raw?.label ?? '').replace(/\s+/g, ' ').trim()
    if (!label) throw bad('Cada campo personalizado necesita una etiqueta.')
    if (label.length > INTAKE_LABEL_MAX) throw bad(`La etiqueta «${label.slice(0, 20)}…» no puede pasar de ${INTAKE_LABEL_MAX} caracteres.`)
    const key = raw?.key ? String(raw.key) : slugifyFieldKey(label)
    if (!key || !KEY_RE.test(key)) throw bad(`Clave inválida para «${label}»: usa minúsculas, números y guion bajo.`)
    if (PRESET_BY_KEY.has(key) || key === 'nombre') throw bad(`La clave «${key}» está reservada.`)
    if (seen.has(key)) throw bad(`La clave «${key}» está repetida.`)
    seen.add(key)
    custom += 1
    if (custom > MAX_CUSTOM_FIELDS) throw bad(`Máximo ${MAX_CUSTOM_FIELDS} campos personalizados.`)
    const type = raw?.type === undefined ? 'text' : raw.type
    if (!INTAKE_TYPES.includes(type)) throw bad(`Tipo de campo inválido para «${label}».`)
    return { key, label, type, required: raw?.required === true, preset: false }
  })
  return fields
}

function checkValue(field, value) {
  if (field.type === 'email') {
    if (value.length > EMAIL_MAX || !EMAIL_RE.test(value)) throw bad(`${field.label}: el correo no es válido.`)
    return value.toLowerCase()
  }
  if (value.length > INTAKE_VALUE_MAX) throw bad(`${field.label}: máximo ${INTAKE_VALUE_MAX} caracteres.`)
  if (field.type === 'phone' && (!PHONE_RE.test(value) || value.replace(/\D/g, '').length < 7)) throw bad(`${field.label}: el teléfono no es válido.`)
  if (field.type === 'number' && !NUMBER_RE.test(value)) throw bad(`${field.label}: escribe solo números.`)
  return value
}

// answers (object) -> { key: value } for the configured fields only. Empty
// optional answers are omitted; unknown keys are ignored. `fixed` overrides
// answers the guest cannot change (the invited email). Throws LmsError 400.
export function normalizeIntakeAnswers(fields, answers, fixed = {}) {
  const source = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {}
  const out = {}
  for (const field of fields ?? []) {
    const given = Object.prototype.hasOwnProperty.call(fixed, field.key) ? fixed[field.key] : source[field.key]
    const value = given === null || given === undefined ? '' : String(given).replace(/\s+/g, ' ').trim()
    if (!value) {
      if (field.required) throw bad(`${field.label} es obligatorio.`)
      continue
    }
    out[field.key] = checkValue(field, value)
  }
  return out
}

// Stored guest_profile -> plain { key: string } (never throws).
export function readGuestProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [key, raw] of Object.entries(value)) {
    if (KEY_RE.test(key) && (typeof raw === 'string' || typeof raw === 'number')) out[key] = String(raw).slice(0, EMAIL_MAX)
  }
  return out
}

// ---- certificates --------------------------------------------------------------
// Fixed tags for the intake presets; any other answer prints as {{campo_<key>}}.
export const GUEST_CERT_TAGS = ['empresa_alumno', 'numero_empleado', 'puesto']
export const CUSTOM_CERT_TAG_RE = /^campo_[a-z][a-z0-9_]{0,23}$/
export const isGuestCertTag = (tag) => GUEST_CERT_TAGS.includes(tag) || CUSTOM_CERT_TAG_RE.test(tag)

// guest_profile -> certificate vars. Preset tags are always present ('' when
// missing) so a template never prints a raw tag; custom answers only when given.
export function guestCertVars(profile) {
  const answers = readGuestProfile(profile)
  const vars = Object.fromEntries(GUEST_CERT_TAGS.map((tag) => [tag, '']))
  for (const [key, value] of Object.entries(answers)) {
    const preset = PRESET_BY_KEY.get(key)
    if (preset?.tag) vars[preset.tag] = value
    else if (!preset) vars[`campo_${key}`] = value
  }
  return vars
}

export const SAMPLE_GUEST_CERT_VARS = { empresa_alumno: 'Empresa del alumno', numero_empleado: '000123', puesto: 'Puesto del alumno' }
