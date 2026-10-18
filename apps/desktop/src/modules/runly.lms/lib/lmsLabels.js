// Pure helpers for runly.lms screens: Spanish labels, formatting and the
// curriculum/outline transforms the player and the editor share.

export const LMS_BASE = '/app/m/runly.lms'
export const lmsPath = (subPath = '') => `${LMS_BASE}${subPath}`
// Lesson editor page; `lessonId` 'new' creates a lesson in `sectionId`.
export const lessonEditorPath = (courseId, lessonId = 'new', sectionId = null) => lmsPath(
  `/courses/${courseId}/lessons/${lessonId}${lessonId === 'new' && sectionId ? `?section=${encodeURIComponent(sectionId)}` : ''}`,
)

export const LEVEL_LABELS = { basic: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado' }
export const STATUS_LABELS = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' }
export const KIND_LABELS = { video: 'Video', embed: 'Enlace de video', text: 'Texto', file: 'Archivo', quiz: 'Examen', assignment: 'Tarea' }
export const QUESTION_KIND_LABELS = {
  single: 'Opción única', multiple: 'Opción múltiple', true_false: 'Verdadero o falso', short: 'Respuesta corta', numeric: 'Respuesta numérica',
  fill_blank: 'Completar espacios', ordering: 'Ordenar', matching: 'Relacionar columnas', open: 'Respuesta abierta',
}
export const QUESTION_KIND_DESCRIPTIONS = {
  single: 'El alumno elige una sola respuesta correcta.',
  multiple: 'El alumno marca todas las respuestas correctas.',
  true_false: 'Una afirmación que es verdadera o falsa.',
  short: 'Escribe una palabra o frase; se compara con las respuestas que aceptes.',
  numeric: 'Escribe un número; puedes aceptar un margen de error.',
  fill_blank: 'Un texto con espacios en blanco que el alumno completa.',
  ordering: 'Acomoda los elementos en el orden correcto.',
  matching: 'Une cada elemento con su pareja.',
  open: 'Respuesta libre que un instructor califica a mano.',
}
export const SHOW_ANSWERS_LABELS = { after_submit: 'Al enviar el examen', after_pass: 'Solo si aprueba', never: 'Nunca' }
export const QUIZ_LAYOUT_LABELS = { all: 'Todas en una página', one: 'Una pregunta a la vez' }
export const SUBMISSION_STATUS_LABELS = { submitted: 'Enviada', returned: 'Devuelta', approved: 'Aprobada' }
export const SUBMISSION_VARIANTS = { submitted: 'secondary', returned: 'warning', approved: 'success' }
export const REVIEW_TYPE_LABELS = { attempt: 'Examen', submission: 'Tarea' }
export const ENROLLMENT_STATUS_LABELS = { active: 'En curso', completed: 'Completado', dropped: 'Baja' }
export const SOURCE_LABELS = { self: 'Inscripción libre', assigned: 'Asignado', share: 'Enlace compartido' }

export const STATUS_VARIANTS = { draft: 'secondary', published: 'success', archived: 'outline' }
export const ENROLLMENT_VARIANTS = { active: 'secondary', completed: 'success', dropped: 'outline' }

export const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }))

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// "1 h 05 min", "12 min", "45 s". Empty string when unknown or zero.
export function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0)
  if (total <= 0) return ''
  if (total < 60) return `${total} s`
  const minutes = Math.round(total / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

// Estimated minutes of a course ("2 h 30 min", "45 min").
export const formatMinutes = (minutes) => formatDuration((Number(minutes) || 0) * 60)

export function formatShortDate(value, now = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`
}

export function isOverdue(enrollment, now = new Date()) {
  if (!enrollment) return false
  if (typeof enrollment.overdue === 'boolean') return enrollment.overdue
  return enrollment.status === 'active' && Boolean(enrollment.dueAt) && new Date(enrollment.dueAt) < now
}

// "Vence 20 oct" / "Vencido" / '' (no due date or not active).
export function dueLabel(enrollment, now = new Date()) {
  if (!enrollment?.dueAt || enrollment.status !== 'active') return ''
  if (isOverdue(enrollment, now)) return 'Vencido'
  return `Vence ${formatShortDate(enrollment.dueAt, now)}`
}

// DateField works with "YYYY-MM-DD"; the API stores a timestamp. A due date
// means "until the end of that local day".
export function dueDateToIso(dateText) {
  if (!dateText) return null
  const [y, m, d] = String(dateText).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 23, 59, 59).toISOString()
}

export function isoToDateInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Outline sections -> flat ordered lesson list.
export const flattenLessons = (sections) => (sections ?? []).flatMap((section) => section.lessons ?? [])

// Lesson the player opens first: the last one visited when it is still open,
// else the first unfinished one, else the first unlocked one.
export function pickStartLesson(sections, lastLessonId = null) {
  const lessons = flattenLessons(sections)
  const open = lessons.filter((lesson) => lesson.status !== 'locked')
  if (lastLessonId) {
    const last = open.find((lesson) => lesson.id === lastLessonId)
    if (last) return last.id
  }
  return (open.find((lesson) => lesson.status !== 'completed') ?? open[0])?.id ?? null
}

// Moves a lesson one step up/down. At a section edge it jumps to the end of
// the previous section or the start of the next one. Returns null when it
// cannot move.
export function moveLesson(sections, lessonId, delta) {
  const next = (sections ?? []).map((section) => ({ ...section, lessons: [...(section.lessons ?? [])] }))
  const sIndex = next.findIndex((section) => section.lessons.some((lesson) => lesson.id === lessonId))
  if (sIndex < 0) return null
  const lessons = next[sIndex].lessons
  const lIndex = lessons.findIndex((lesson) => lesson.id === lessonId)
  const target = lIndex + delta
  if (target >= 0 && target < lessons.length) {
    const [item] = lessons.splice(lIndex, 1)
    lessons.splice(target, 0, item)
    return next
  }
  const neighbour = next[sIndex + delta]
  if (!neighbour) return null
  const [item] = lessons.splice(lIndex, 1)
  if (delta < 0) neighbour.lessons.push(item)
  else neighbour.lessons.unshift(item)
  return next
}

export function moveSection(sections, sectionId, delta) {
  const next = [...(sections ?? [])]
  const index = next.findIndex((section) => section.id === sectionId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= next.length) return null
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export const toReorderPayload = (sections) => ({
  sections: (sections ?? []).map((section) => ({ id: section.id, lessonIds: (section.lessons ?? []).map((lesson) => lesson.id) })),
})

// Applies a saved progress result to a cached outline (lesson state + enrollment).
export function patchOutline(outline, lessonId, result) {
  if (!outline || !result) return outline
  return {
    ...outline,
    enrollment: result.enrollment ?? outline.enrollment,
    sections: (outline.sections ?? []).map((section) => ({
      ...section,
      lessons: (section.lessons ?? []).map((lesson) => (
        lesson.id === lessonId && result.lessonStatus ? { ...lesson, status: result.lessonStatus } : lesson
      )),
    })),
  }
}

// ---- Social (phase 3) ------------------------------------------------------------

// "4.5" (one decimal) / '' when there is no rating yet.
export function formatRating(avg) {
  const value = Number(avg)
  if (avg === null || avg === undefined || avg === '' || !Number.isFinite(value) || value <= 0) return ''
  return value.toFixed(1)
}

// "(12 reseñas)" style count label.
export const reviewCountLabel = (count) => `${count ?? 0} ${count === 1 ? 'reseña' : 'reseñas'}`

// "ahora", "hace 5 min", "hace 3 h", "ayer", "12 oct" (+ year when not current).
export function relativeTime(value, now = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() >= startOfToday) return `hace ${Math.floor(minutes / 60)} h`
  if (date.getTime() >= startOfToday - 86_400_000) return 'ayer'
  return formatShortDate(date, now)
}

// Distribution {1..5: n} -> rows from 5 to 1 with their share of the total.
export function ratingRows(distribution, count) {
  const total = Number(count) || 0
  return [5, 4, 3, 2, 1].map((stars) => {
    const n = Number(distribution?.[stars] ?? distribution?.[String(stars)] ?? 0)
    return { stars, count: n, pct: total ? Math.round((n / total) * 100) : 0 }
  })
}

// Player tabs under the lesson. Older links used ?tab=contenido (now Descripción).
export const PLAYER_TABS = ['descripcion', 'recursos', 'preguntas', 'anuncios']
export const normalizePlayerTab = (tab) => (PLAYER_TABS.includes(tab) ? tab : 'descripcion')

// "Califica este curso" dismissal, per course. Storage can be missing or throw
// (private mode, blocked site data): every access is guarded.
const RATE_PROMPT_KEY = 'runly.lms.ratePromptDismissed'

function readDismissed(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(RATE_PROMPT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function isRatePromptDismissed(courseId, storage = globalThis.localStorage) {
  try { return readDismissed(storage).includes(courseId) } catch { return false }
}

export function dismissRatePrompt(courseId, storage = globalThis.localStorage) {
  try {
    const list = readDismissed(storage).filter((id) => id !== courseId)
    list.push(courseId)
    storage?.setItem(RATE_PROMPT_KEY, JSON.stringify(list.slice(-200)))
  } catch { /* storage unavailable: the prompt shows again next time */ }
}
