// Pure helpers for the evaluation screens (spec 2026-11-21): labels, the
// settings form <-> API values, activity forms and points display.
import { zonedLocalToDate } from '@runly/core'
import { lmsPath } from './lmsLabels.js'

export const assessmentsPath = (suffix = '') => lmsPath(`/assessments${suffix}`)
export const assessmentPath = (id) => assessmentsPath(`/${id}`)
export const activityPath = (assessmentId, activityId) => assessmentsPath(`/${assessmentId}/activities/${activityId}`)

// Creation presets (the API maps them onto quiz / assignment).
export const ACTIVITY_TYPES = [
  { value: 'questionnaire', label: 'Cuestionario', description: 'Preguntas de opción, abiertas, numéricas y más.' },
  { value: 'written', label: 'Respuesta escrita', description: 'Un texto extenso que se califica a mano.' },
  { value: 'files', label: 'Entrega de archivos', description: 'La persona sube uno o más archivos.' },
  { value: 'practical', label: 'Actividad práctica', description: 'Material descargable, texto y archivos.' },
]

// Formats an evaluation delivery can require (keys of the server's file-integrity table).
export const DELIVERY_FILE_TYPES = [
  { value: 'xlsx', label: 'Excel (.xlsx)' }, { value: 'xls', label: 'Excel 97-2003 (.xls)' }, { value: 'csv', label: 'CSV (.csv)' },
  { value: 'pdf', label: 'PDF (.pdf)' }, { value: 'docx', label: 'Word (.docx)' }, { value: 'pptx', label: 'PowerPoint (.pptx)' },
  { value: 'jpg', label: 'Imagen JPG' }, { value: 'png', label: 'Imagen PNG' }, { value: 'zip', label: 'ZIP (.zip)' },
]

// The label follows what the activity really accepts, not how it was created.
export function activityTypeLabel(activity) {
  if (activity?.kind === 'quiz') return 'Cuestionario'
  const s = activity?.settings ?? {}
  if (s.allowText && !s.allowFiles) return 'Respuesta escrita'
  if (s.allowFiles && !s.allowText) return 'Entrega de archivos'
  return 'Actividad práctica'
}

export function formatPoints(value) {
  if (value === null || value === undefined) return 'Variable'
  const n = Math.round(Number(value) * 100) / 100
  return `${n} ${n === 1 ? 'punto' : 'puntos'}`
}

export function formatTimeLimit(minutes) {
  if (!minutes) return 'Sin límite'
  const h = Math.floor(minutes / 60), m = minutes % 60
  return [h ? `${h} h` : null, m ? `${m} min` : null].filter(Boolean).join(' ')
}

const pad = (n) => String(n).padStart(2, '0')
export const DEFAULT_TIME_ZONE = 'America/Mexico_City'
// The zones a company usually needs; the browser's own is added when missing.
export const TIME_ZONE_OPTIONS = [
  { value: 'America/Mexico_City', label: 'Ciudad de México (centro)' },
  { value: 'America/Cancun', label: 'Cancún (sureste)' },
  { value: 'America/Chihuahua', label: 'Chihuahua' },
  { value: 'America/Mazatlan', label: 'Mazatlán (pacífico)' },
  { value: 'America/Hermosillo', label: 'Hermosillo' },
  { value: 'America/Tijuana', label: 'Tijuana (noroeste)' },
  { value: 'America/Bogota', label: 'Bogotá' },
  { value: 'America/Lima', label: 'Lima' },
  { value: 'America/Santiago', label: 'Santiago' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'America/New_York', label: 'Nueva York' },
  { value: 'America/Los_Angeles', label: 'Los Ángeles' },
  { value: 'Europe/Madrid', label: 'Madrid' },
  { value: 'UTC', label: 'UTC' },
]
export function timeZoneOptions(current, browser = globalThis.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone) {
  const extra = [current, browser].filter((zone, index, list) => zone && list.indexOf(zone) === index && !TIME_ZONE_OPTIONS.some((item) => item.value === zone))
  return [...TIME_ZONE_OPTIONS, ...extra.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))]
}

// ISO instant -> "YYYY-MM-DDTHH:mm" on the wall clock of `timeZone` (DateTimeField
// value); without a zone, the viewer's own. Instants are always stored in UTC.
export function isoToLocalInput(iso, timeZone = undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (!timeZone) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
export function localInputToIso(value, timeZone = undefined) {
  if (!value) return null
  const d = timeZone ? zonedLocalToDate(value, timeZone) : new Date(value)
  return !d || Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// An instant as people read it in the evaluation's zone, with the zone named.
export function formatInZone(iso, timeZone = DEFAULT_TIME_ZONE) {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('es-MX', { timeZone, dateStyle: 'long', timeStyle: 'short', timeZoneName: 'short' }).format(new Date(iso))
  } catch { return new Date(iso).toLocaleString('es-MX') }
}

const text = (value) => (value === null || value === undefined ? '' : String(value))
const blank = (value) => String(value ?? '').trim() === ''
const intIn = (value, min, max) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max

export function assessmentToForm(assessment) {
  const s = assessment?.settings ?? {}
  return {
    title: assessment?.title ?? '',
    description: assessment?.description ?? '',
    limited: Boolean(s.timeLimitMinutes),
    timeLimitMinutes: text(s.timeLimitMinutes ?? 60),
    maxSessions: text(s.maxSessions ?? 1),
    timeZone: s.timeZone ?? DEFAULT_TIME_ZONE,
    opensAt: isoToLocalInput(s.opensAt, s.timeZone ?? DEFAULT_TIME_ZONE),
    closesAt: isoToLocalInput(s.closesAt, s.timeZone ?? DEFAULT_TIME_ZONE),
    passingPoints: text(s.passingPoints),
    showResultsToCandidate: s.showResultsToCandidate === true,
    materialAfterSubmit: s.materialAfterSubmit === true,
  }
}

export function validateAssessmentForm(form) {
  const errors = {}
  if (blank(form.title)) errors.title = 'El título es obligatorio.'
  if (form.limited && !intIn(form.timeLimitMinutes, 1, 600)) errors.timeLimitMinutes = 'Escribe de 1 a 600 minutos.'
  if (!intIn(form.maxSessions, 1, 20)) errors.maxSessions = 'Escribe de 1 a 20 intentos.'
  if (!blank(form.passingPoints) && !(Number(form.passingPoints) >= 0)) errors.passingPoints = 'Escribe un número de 0 en adelante, o déjalo vacío.'
  const opens = localInputToIso(form.opensAt, form.timeZone), closes = localInputToIso(form.closesAt, form.timeZone)
  if (opens && closes && Date.parse(closes) <= Date.parse(opens)) errors.closesAt = 'El cierre debe ser después de la apertura.'
  return errors
}

export function assessmentFormToPayload(form) {
  return {
    title: String(form.title ?? '').trim(),
    description: String(form.description ?? '').trim() || null,
    settings: {
      timeLimitMinutes: form.limited ? Number(form.timeLimitMinutes) : null,
      maxSessions: Number(form.maxSessions),
      timeZone: form.timeZone,
      opensAt: localInputToIso(form.opensAt, form.timeZone),
      closesAt: localInputToIso(form.closesAt, form.timeZone),
      passingPoints: blank(form.passingPoints) ? null : Number(form.passingPoints),
      showResultsToCandidate: form.showResultsToCandidate === true,
      materialAfterSubmit: form.materialAfterSubmit === true,
    },
  }
}

// ---- activities -------------------------------------------------------------
export function activityToForm(activity) {
  const s = activity?.settings ?? {}
  return {
    title: activity?.title ?? '',
    body: activity?.body ?? '',
    kind: activity?.kind ?? 'quiz',
    // quiz
    layout: s.layout ?? 'one',
    shuffleQuestions: s.shuffleQuestions === true,
    shuffleOptions: s.shuffleOptions === true,
    drawCount: text(s.drawCount),
    // assignment
    allowText: s.allowText !== false,
    allowFiles: s.allowFiles !== false,
    maxFiles: text(s.maxFiles ?? 5),
    acceptedTypes: Array.isArray(s.acceptedTypes) ? s.acceptedTypes : [],
    maxFileMb: text(s.maxFileMb ?? 50),
    maxPoints: text(s.maxPoints ?? 100),
  }
}

export function validateActivityForm(form) {
  const errors = {}
  if (blank(form.title)) errors.title = 'El título es obligatorio.'
  if (form.kind === 'quiz' && !blank(form.drawCount) && !intIn(form.drawCount, 1, 500)) errors.drawCount = 'Escribe de 1 a 500, o déjalo vacío.'
  if (form.kind === 'assignment') {
    if (!form.allowText && !form.allowFiles) errors.allowText = 'Permite texto, archivos o ambos.'
    if (form.allowFiles && !intIn(form.maxFiles, 1, 10)) errors.maxFiles = 'Escribe de 1 a 10.'
    if (form.allowFiles && !intIn(form.maxFileMb, 1, 50)) errors.maxFileMb = 'Escribe de 1 a 50 MB.'
    if (!intIn(form.maxPoints, 1, 1000)) errors.maxPoints = 'Escribe de 1 a 1000 puntos.'
    if (blank(form.body)) errors.body = 'Escribe las instrucciones de la actividad.'
  }
  return errors
}

export function activityFormToPayload(form) {
  const settings = form.kind === 'quiz'
    ? { layout: form.layout, shuffleQuestions: form.shuffleQuestions, shuffleOptions: form.shuffleOptions, drawCount: blank(form.drawCount) ? null : Number(form.drawCount), showAnswers: 'never' }
    : {
      allowText: form.allowText, allowFiles: form.allowFiles, maxFiles: Number(form.maxFiles), maxPoints: Number(form.maxPoints),
      // Empty list: any common format (the server checks the real content either way).
      acceptedTypes: form.acceptedTypes?.length ? [...form.acceptedTypes] : null, maxFileMb: Number(form.maxFileMb),
    }
  return { title: String(form.title ?? '').trim(), body: String(form.body ?? '').trim() || null, settings }
}

export const isActivityDirty = (form, baseline) => Boolean(form && baseline) && JSON.stringify(activityFormToPayload(form)) !== JSON.stringify(activityFormToPayload(baseline))

// New order after moving one activity up (-1) or down (+1); same list when out of range.
export function moveActivity(ids, id, delta) {
  const index = ids.indexOf(id), target = index + delta
  if (index < 0 || target < 0 || target >= ids.length) return ids
  const next = [...ids]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
