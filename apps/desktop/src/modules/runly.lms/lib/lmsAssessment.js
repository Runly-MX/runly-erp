// Pure helpers for the evaluation screens (spec 2026-11-21): labels, the
// settings form <-> API values, activity forms and points display.
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
// ISO instant -> "YYYY-MM-DDTHH:mm" in the viewer's local time (DateTimeField value).
export function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function localInputToIso(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
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
    opensAt: isoToLocalInput(s.opensAt),
    closesAt: isoToLocalInput(s.closesAt),
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
  const opens = localInputToIso(form.opensAt), closes = localInputToIso(form.closesAt)
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
      opensAt: localInputToIso(form.opensAt),
      closesAt: localInputToIso(form.closesAt),
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
    if (!intIn(form.maxPoints, 1, 1000)) errors.maxPoints = 'Escribe de 1 a 1000 puntos.'
    if (blank(form.body)) errors.body = 'Escribe las instrucciones de la actividad.'
  }
  return errors
}

export function activityFormToPayload(form) {
  const settings = form.kind === 'quiz'
    ? { layout: form.layout, shuffleQuestions: form.shuffleQuestions, shuffleOptions: form.shuffleOptions, drawCount: blank(form.drawCount) ? null : Number(form.drawCount), showAnswers: 'never' }
    : { allowText: form.allowText, allowFiles: form.allowFiles, maxFiles: Number(form.maxFiles), maxPoints: Number(form.maxPoints) }
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
