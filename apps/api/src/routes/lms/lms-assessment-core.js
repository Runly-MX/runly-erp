// Pure rules for runly.lms standalone evaluations (spec 2026-11-21): settings,
// activity presets and points. No I/O.
import { LmsError } from './lms-error.js'
import { normalizeLessonSettings } from './lms-eval-core.js'

export const ACTIVITY_KINDS = ['quiz', 'assignment']

// Creation presets. The type is not stored: the UI derives the label from kind
// and settings (activityType), so an edited activity keeps a truthful label.
export const ACTIVITY_PRESETS = {
  questionnaire: { kind: 'quiz', settings: { showAnswers: 'never', layout: 'one', shuffleOptions: false } },
  written: { kind: 'assignment', settings: { allowText: true, allowFiles: false } },
  files: { kind: 'assignment', settings: { allowText: false, allowFiles: true } },
  practical: { kind: 'assignment', settings: { allowText: true, allowFiles: true } },
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const blank = (value) => value === null || value === undefined || value === ''

function intOrNull(value, min, max, label) {
  if (blank(value)) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw new LmsError(`${label} debe ser un número entero entre ${min} y ${max}.`, 400)
  return n
}

function dateOrNull(value, label) {
  if (blank(value)) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new LmsError(`${label} no es una fecha válida.`, 400)
  return date.toISOString()
}

const SETTING_DEFAULTS = {
  timeLimitMinutes: null,
  maxSessions: 1,
  opensAt: null,
  closesAt: null,
  passingPoints: null,
  showResultsToCandidate: false,
  materialAfterSubmit: false,
  sourceCourseId: null,
}

// Stored JSON -> clean settings (never throws).
export function readAssessmentSettings(raw) {
  const src = isObject(raw) ? raw : {}
  const safe = (fn, fallback) => { try { return fn() } catch { return fallback } }
  return {
    timeLimitMinutes: safe(() => intOrNull(src.timeLimitMinutes, 1, 600, 'x'), null),
    maxSessions: safe(() => intOrNull(src.maxSessions, 1, 20, 'x'), null) ?? 1,
    opensAt: safe(() => dateOrNull(src.opensAt, 'x'), null),
    closesAt: safe(() => dateOrNull(src.closesAt, 'x'), null),
    passingPoints: Number.isFinite(Number(src.passingPoints)) && !blank(src.passingPoints) && Number(src.passingPoints) >= 0 ? Number(src.passingPoints) : null,
    showResultsToCandidate: src.showResultsToCandidate === true,
    materialAfterSubmit: src.materialAfterSubmit === true,
    sourceCourseId: typeof src.sourceCourseId === 'string' ? src.sourceCourseId : null,
  }
}

// PATCH body.settings merged onto the stored settings; validates what is sent.
// sourceCourseId is set only by the clone script, never through the API.
export function mergeAssessmentSettings(input, current = {}) {
  if (input === undefined) return readAssessmentSettings(current)
  if (!isObject(input)) throw new LmsError('Configuración inválida.', 400)
  const next = { ...SETTING_DEFAULTS, ...readAssessmentSettings(current) }
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key)
  if (has('timeLimitMinutes')) next.timeLimitMinutes = intOrNull(input.timeLimitMinutes, 1, 600, 'El tiempo límite (minutos)')
  if (has('maxSessions')) next.maxSessions = intOrNull(input.maxSessions, 1, 20, 'Los intentos') ?? 1
  if (has('opensAt')) next.opensAt = dateOrNull(input.opensAt, 'La fecha de apertura')
  if (has('closesAt')) next.closesAt = dateOrNull(input.closesAt, 'La fecha de cierre')
  if (has('passingPoints')) {
    if (blank(input.passingPoints)) next.passingPoints = null
    else {
      const n = Number(input.passingPoints)
      if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new LmsError('Los puntos mínimos son inválidos.', 400)
      next.passingPoints = Math.round(n * 100) / 100
    }
  }
  if (has('showResultsToCandidate')) next.showResultsToCandidate = input.showResultsToCandidate === true
  if (has('materialAfterSubmit')) next.materialAfterSubmit = input.materialAfterSubmit === true
  if (next.opensAt && next.closesAt && Date.parse(next.closesAt) <= Date.parse(next.opensAt)) {
    throw new LmsError('La fecha de cierre debe ser posterior a la de apertura.', 400)
  }
  return next
}

// { kind, settings } for a new activity: preset (optional) + explicit kind/settings.
export function activityDraft(body = {}) {
  const preset = body?.type !== undefined ? ACTIVITY_PRESETS[body.type] : null
  if (body?.type !== undefined && !preset) throw new LmsError('Tipo de actividad inválido.', 400)
  const kind = body?.kind ?? preset?.kind
  if (!ACTIVITY_KINDS.includes(kind)) throw new LmsError('Una actividad es un cuestionario o una entrega.', 400)
  if (preset && preset.kind !== kind) throw new LmsError('El tipo de actividad no coincide.', 400)
  const settings = { ...(preset?.settings ?? {}), ...(isObject(body?.settings) ? body.settings : {}) }
  return { kind, settings }
}

// Maximum points of an activity: assignment = settings.maxPoints; quiz = sum of
// its enabled questions, or null when each attempt draws a subset (it varies).
export function activityMaxPoints(lesson, { questionPoints = 0, questionCount = 0 } = {}) {
  const settings = normalizeLessonSettings(lesson.kind, lesson.settings)
  if (lesson.kind === 'assignment') return settings.maxPoints
  if (lesson.kind !== 'quiz') return 0
  if (settings.drawCount && settings.drawCount < questionCount) return null
  return questionPoints
}

// Sum of known maxima; null when any activity varies.
export function assessmentMaxPoints(maxima) {
  if (maxima.some((value) => value === null)) return null
  return maxima.reduce((sum, value) => sum + value, 0)
}

// Reasons an evaluation cannot be published yet (empty = ready).
export function publishProblems(activities) {
  const problems = []
  if (!activities.length) problems.push('Agrega al menos una actividad.')
  for (const activity of activities) {
    if (activity.kind === 'quiz' && !activity.questionCount) problems.push(`«${activity.title}» no tiene preguntas.`)
  }
  return problems
}
