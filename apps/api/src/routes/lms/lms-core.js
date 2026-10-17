// Pure rules for runly.lms: progress, sequential locks, auto-completion,
// overdue state, embed URL normalization and payload normalizers. No I/O.
import { LmsError } from './lms-error.js'
import { normalizeLessonSettings } from './lms-eval-core.js'

export { LmsError }

export const LESSON_KINDS = ['video', 'embed', 'text', 'file', 'quiz', 'assignment']
export const EVALUATED_KINDS = new Set(['quiz', 'assignment'])
// Progress statuses a learner can see; only `completed` unlocks later lessons.
const PROGRESS_STATES = new Set(['completed', 'in_progress', 'pending_review', 'failed'])
export const LEVELS = ['basic', 'intermediate', 'advanced']
export const COURSE_STATUSES = ['draft', 'published', 'archived']
export const ENROLLMENT_STATUSES = ['active', 'completed', 'dropped']
export const AUTO_COMPLETE_RATIO = 0.9
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024

const counts = (lesson) => lesson.enabled !== false && lesson.required !== false

export function progressPct(lessons, completedIds) {
  const required = lessons.filter(counts)
  if (!required.length) return 0
  const done = required.filter((lesson) => completedIds.has(lesson.id)).length
  return Math.floor((done / required.length) * 100)
}

// progressById: Map lessonId -> { status }. Returns Map lessonId -> state.
export function lessonStates(lessons, progressById, { sequential, locked = true } = {}) {
  const states = new Map()
  let blocked = false
  for (const lesson of lessons) {
    const status = progressById.get(lesson.id)?.status
    let state = PROGRESS_STATES.has(status) ? status : 'available'
    if (sequential && locked && blocked && state !== 'completed') state = 'locked'
    states.set(lesson.id, state)
    if (counts(lesson) && status !== 'completed') blocked = true
  }
  return states
}

export function shouldAutoComplete({ kind, positionSeconds, durationSeconds }) {
  if (kind !== 'video' && kind !== 'embed') return false
  const duration = Number(durationSeconds)
  if (!Number.isFinite(duration) || duration <= 0) return false
  return Number(positionSeconds) >= duration * AUTO_COMPLETE_RATIO
}

export function isOverdue(enrollment, now = new Date()) {
  if (!enrollment || enrollment.status !== 'active' || !enrollment.dueAt) return false
  return new Date(enrollment.dueAt).getTime() < now.getTime()
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/

export function normalizeEmbedUrl(raw) {
  const invalid = () => new LmsError('El enlace del video debe ser una dirección https válida.', 400)
  let url
  try { url = new URL(String(raw ?? '').trim()) } catch { throw invalid() }
  if (url.protocol !== 'https:') throw invalid()
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  let youtubeId = null
  if (host === 'youtu.be') youtubeId = url.pathname.split('/')[1]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') youtubeId = url.searchParams.get('v')
    else {
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
      if (match) youtubeId = match[2]
    }
  }
  if (youtubeId) {
    if (!YOUTUBE_ID.test(youtubeId)) throw invalid()
    return `https://www.youtube-nocookie.com/embed/${youtubeId}`
  }
  if (host === 'vimeo.com') {
    const match = url.pathname.match(/^\/(\d+)/)
    if (match) return `https://player.vimeo.com/video/${match[1]}`
  }
  return url.toString()
}

const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key)

function optionalText(value, max, label) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text.length > max) throw new LmsError(`${label} es demasiado largo.`, 400)
  return text || null
}

function requiredTitle(value, label = 'El título') {
  const title = String(value ?? '').trim()
  if (!title) throw new LmsError(`${label} es obligatorio.`, 400)
  if (title.length > 200) throw new LmsError(`${label} no puede pasar de 200 caracteres.`, 400)
  return title
}

function optionalInt(value, label) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) throw new LmsError(`${label} debe ser un número entero no negativo.`, 400)
  return n
}

function optionalUuid(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) throw new LmsError('Identificador inválido.', 400)
  return text
}

export function normalizeCourseInput(body = {}, { partial = false } = {}) {
  const data = {}
  if (!partial || has(body, 'title')) data.title = requiredTitle(body.title)
  if (has(body, 'summary')) data.summary = optionalText(body.summary, 500, 'El resumen')
  if (has(body, 'description')) data.description = optionalText(body.description, 50_000, 'La descripción')
  if (has(body, 'category')) data.category = optionalText(body.category, 100, 'La categoría')
  if (has(body, 'coverFileId')) data.coverFileId = optionalUuid(body.coverFileId)
  if (has(body, 'level')) {
    if (!LEVELS.includes(body.level)) throw new LmsError('Nivel inválido.', 400)
    data.level = body.level
  }
  if (has(body, 'status')) {
    if (!COURSE_STATUSES.includes(body.status)) throw new LmsError('Estado inválido.', 400)
    data.status = body.status
  }
  if (has(body, 'visibility')) {
    if (!['internal', 'public'].includes(body.visibility)) throw new LmsError('Visibilidad inválida.', 400)
    data.visibility = body.visibility
  }
  if (has(body, 'estimatedMinutes')) data.estimatedMinutes = optionalInt(body.estimatedMinutes, 'La duración estimada')
  if (has(body, 'sequential')) data.sequential = body.sequential === true
  if (has(body, 'selfEnroll')) data.selfEnroll = body.selfEnroll === true
  if (has(body, 'certificateTemplateId')) data.certificateTemplateId = optionalUuid(body.certificateTemplateId)
  return data
}

// currentKind: the stored kind on partial updates, so `settings` normalize by kind.
export function normalizeLessonInput(body = {}, { partial = false, currentKind = null } = {}) {
  const data = {}
  if (!partial || has(body, 'title')) data.title = requiredTitle(body.title)
  if (!partial || has(body, 'kind')) {
    const kind = body.kind ?? 'text'
    if (!LESSON_KINDS.includes(kind)) throw new LmsError('Tipo de lección inválido.', 400)
    data.kind = kind
  }
  const kind = data.kind ?? currentKind
  if (!partial || has(body, 'settings') || (data.kind && data.kind !== currentKind)) {
    // A new kind without settings starts from that kind's defaults.
    data.settings = normalizeLessonSettings(kind, has(body, 'settings') ? body.settings : {})
    if (kind === 'assignment' && !data.settings.allowText && !data.settings.allowFiles) {
      throw new LmsError('La tarea debe admitir texto, archivos o ambos.', 400)
    }
  }
  if (has(body, 'body')) data.body = optionalText(body.body, 200_000, 'El contenido')
  if (has(body, 'fileId')) data.fileId = optionalUuid(body.fileId)
  if (has(body, 'coverFileId')) data.coverFileId = optionalUuid(body.coverFileId)
  if (has(body, 'embedUrl')) {
    const raw = String(body.embedUrl ?? '').trim()
    data.embedUrl = raw ? normalizeEmbedUrl(raw) : null
  }
  if (has(body, 'durationSeconds')) data.durationSeconds = optionalInt(body.durationSeconds, 'La duración')
  if (has(body, 'required')) data.required = body.required !== false
  if (has(body, 'sectionId')) {
    const sectionId = optionalUuid(body.sectionId)
    if (!sectionId) throw new LmsError('La sección es obligatoria.', 400)
    data.sectionId = sectionId
  }
  if (data.kind === 'embed' && !partial && !data.embedUrl) throw new LmsError('Escribe el enlace del video.', 400)
  return data
}

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0)

export function orderLessons(sections = []) {
  return [...sections].sort(byPosition).flatMap((section) => [...(section.lessons ?? [])].sort(byPosition).filter((lesson) => lesson.enabled !== false))
}
