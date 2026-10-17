// Pure helpers for the guest intake form, invite-only share links and the
// guests export (API lms-intake-core.js / lms-invite-core.js). No React.

export const MAX_CUSTOM_FIELDS = 5
export const LABEL_MAX = 60
export const VALUE_MAX = 120
export const EMAIL_KEY = 'correo'

export const INTAKE_PRESETS = [
  { key: 'numero_empleado', label: 'Número de empleado', type: 'text' },
  { key: 'empresa', label: 'Empresa', type: 'text' },
  { key: 'puesto', label: 'Puesto', type: 'text' },
  { key: 'correo', label: 'Correo', type: 'email' },
  { key: 'telefono', label: 'Teléfono', type: 'phone' },
]
const PRESET_KEYS = new Set(INTAKE_PRESETS.map((preset) => preset.key))
export const isPresetKey = (key) => PRESET_KEYS.has(key)

export const ACCESS_MODE_OPTIONS = [
  { value: 'open', label: 'Abierto', description: 'Cualquiera con el enlace entra con sus datos. Ideal para cursos cortos de una sesión.' },
  { value: 'invite', label: 'Solo por invitación', description: 'Invitas por correo; cada persona entra con su código y continúa desde cualquier dispositivo.' },
]

export const INVITE_STATUS = {
  pending: { label: 'Pendiente', variant: 'outline' },
  active: { label: 'Activo', variant: 'success' },
  revoked: { label: 'Revocado', variant: 'destructive' },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[0-9()\-.\s]{7,25}$/
const NUMBER_RE = /^-?\d{1,15}(?:[.,]\d{1,4})?$/
const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

// "Talla de playera" -> "talla_de_playera" (same rule as the API).
export function slugifyFieldKey(label) {
  const slug = String(label ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24).replace(/_+$/, '')
  if (!slug) return null
  return /^[a-z]/.test(slug) ? slug : `c_${slug}`.slice(0, 24)
}

// ---- manager: editing the field list ------------------------------------------------
export const presetEnabled = (fields, key) => (fields ?? []).some((field) => field.key === key)
export const customFields = (fields) => (fields ?? []).filter((field) => !isPresetKey(field.key))

// Presets keep the catalog order, then custom fields in their order.
export function togglePreset(fields, key, on) {
  const list = (fields ?? []).filter((field) => field.key !== key)
  if (!on) return list
  const preset = INTAKE_PRESETS.find((item) => item.key === key)
  const presets = INTAKE_PRESETS.filter((item) => item.key === key || presetEnabled(list, item.key))
    .map((item) => (item.key === key ? { ...preset, required: false, preset: true } : list.find((field) => field.key === item.key)))
  return [...presets, ...customFields(list)]
}

export const setFieldRequired = (fields, key, required) => (fields ?? []).map((field) => (field.key === key ? { ...field, required } : field))
export const setFieldLabel = (fields, key, label) => (fields ?? []).map((field) => (field.key === key ? { ...field, label } : field))
export const removeField = (fields, key) => (fields ?? []).filter((field) => field.key !== key)

// Adds a custom text field; returns { fields, error }. The key is fixed at
// creation so a later label change does not orphan stored answers.
export function addCustomField(fields, label) {
  const text = clean(label)
  if (!text) return { fields, error: 'Escribe la etiqueta del campo.' }
  if (text.length > LABEL_MAX) return { fields, error: `Máximo ${LABEL_MAX} caracteres.` }
  if (customFields(fields).length >= MAX_CUSTOM_FIELDS) return { fields, error: `Máximo ${MAX_CUSTOM_FIELDS} campos personalizados.` }
  const base = slugifyFieldKey(text)
  if (!base) return { fields, error: 'Usa letras o números en la etiqueta.' }
  const taken = new Set([...(fields ?? []).map((field) => field.key), ...PRESET_KEYS, 'nombre'])
  let key = base
  for (let n = 2; taken.has(key); n += 1) key = `${base.slice(0, 21)}_${n}`
  return { fields: [...(fields ?? []), { key, label: text, type: 'text', required: false, preset: false }], error: null }
}

// Errors before saving the list (empty custom labels).
export function intakeFieldsError(fields) {
  const empty = customFields(fields).find((field) => !clean(field.label))
  return empty ? 'Todos los campos personalizados necesitan una etiqueta.' : null
}

export const certTagFor = (key) => ({ empresa: 'empresa_alumno', numero_empleado: 'numero_empleado', puesto: 'puesto' }[key] ?? (isPresetKey(key) ? null : `campo_${key}`))

// ---- guest: filling the form ----------------------------------------------------------
function fieldError(field, value) {
  if (!value) return field.required ? 'Este dato es obligatorio.' : null
  if (field.type === 'email') return value.length > 200 || !EMAIL_RE.test(value) ? 'El correo no es válido.' : null
  if (value.length > VALUE_MAX) return `Máximo ${VALUE_MAX} caracteres.`
  if (field.type === 'phone' && (!PHONE_RE.test(value) || value.replace(/\D/g, '').length < 7)) return 'El teléfono no es válido.'
  if (field.type === 'number' && !NUMBER_RE.test(value)) return 'Escribe solo números.'
  return null
}

// { name, answers } -> { values, errors } mirroring the API. `skip` lists keys
// the guest does not fill (the invited email).
export function validateIntakeForm({ name = '', answers = {} } = {}, fields = [], { skip = [] } = {}) {
  const errors = {}
  const cleanName = clean(name)
  if (cleanName.length < 2) errors.name = 'Escribe tu nombre (al menos 2 caracteres).'
  else if (cleanName.length > 80) errors.name = 'Máximo 80 caracteres.'
  const out = {}
  for (const field of fields ?? []) {
    if (skip.includes(field.key)) continue
    let value = clean(answers?.[field.key])
    if (field.type === 'email') value = value.toLowerCase()
    const error = fieldError(field, value)
    if (error) errors[field.key] = error
    else if (value) out[field.key] = value
  }
  return { values: { name: cleanName, answers: out }, errors }
}

// ---- manager: invites -----------------------------------------------------------------
// One invite per line: "correo", "Nombre <correo>", "correo, Nombre" or
// "Nombre; correo" (comma, semicolon or tab). -> { invites, invalid }.
export function parseInviteText(text) {
  const invites = [], invalid = []
  const seen = new Set()
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const angle = /^(.*)<([^>]+)>\s*$/.exec(line)
    const parts = angle ? [angle[2], angle[1]] : line.split(/[,;\t]/)
    const emailPart = parts.find((part) => EMAIL_RE.test(part.trim()))
    if (!emailPart) { invalid.push(line); continue }
    const email = emailPart.trim().toLowerCase()
    const name = clean(parts.filter((part) => part !== emailPart).join(' ').replace(/["']/g, '')).slice(0, 80)
    if (seen.has(email)) continue
    seen.add(email)
    invites.push({ email, ...(name ? { name } : {}) })
  }
  return { invites, invalid }
}

export const inviteStatusInfo = (status) => INVITE_STATUS[status] ?? INVITE_STATUS.pending

// ---- manager: guest answers and export ------------------------------------------------
const labelFor = (key, fields) => (fields ?? []).find((field) => field.key === key)?.label
  ?? INTAKE_PRESETS.find((preset) => preset.key === key)?.label ?? key

// Configured fields first (in order), then answers to fields removed later.
export function guestAnswerRows(profile, fields = []) {
  const answers = profile && typeof profile === 'object' ? profile : {}
  const keys = [...(fields ?? []).map((field) => field.key), ...Object.keys(answers).filter((key) => !(fields ?? []).some((field) => field.key === key))]
  return keys.filter((key) => answers[key] !== undefined && answers[key] !== '').map((key) => ({ key, label: labelFor(key, fields), value: String(answers[key]) }))
}

export const isGuestEnrollment = (enrollment) => enrollment?.learner?.kind === 'guest'

const STATUS_TEXT = { active: 'En curso', completed: 'Completado', dropped: 'Baja' }

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  // Spreadsheet formula injection guard.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Guests (share-link enrollments) with their answers and progress -> CSV text
// (BOM so Excel reads UTF-8).
export function guestsCsv(enrollments, fields = []) {
  const guests = (enrollments ?? []).filter(isGuestEnrollment)
  const answerKeys = [...(fields ?? []).map((field) => field.key)]
  for (const row of guests) for (const key of Object.keys(row.learner?.guestProfile ?? {})) if (!answerKeys.includes(key)) answerKeys.push(key)
  const header = ['Nombre', 'Correo', ...answerKeys.map((key) => labelFor(key, fields)), 'Avance (%)', 'Estado', 'Inicio', 'Completado', 'Folio de certificado']
  const day = (value) => (value ? String(value).slice(0, 10) : '')
  const lines = guests.map((row) => [
    row.learner?.displayName, row.learner?.email,
    ...answerKeys.map((key) => row.learner?.guestProfile?.[key] ?? ''),
    row.progressPct ?? 0, STATUS_TEXT[row.status] ?? row.status, day(row.startedAt), day(row.completedAt), row.certificate?.folio ?? '',
  ])
  return `﻿${[header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export const isFieldKey = (key) => KEY_RE.test(String(key ?? ''))
