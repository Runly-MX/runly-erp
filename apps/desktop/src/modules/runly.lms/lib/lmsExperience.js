// Pure helpers for the learner experience: player sidebar thumbnails, theater
// mode memory, the course page call to action and lesson resources.
import { lmsPath } from './lmsLabels.js'

export const coursePagePath = (courseId) => lmsPath(`/course/${courseId}`)
export const playerPath = (courseId, lessonId = null) => lmsPath(`/learn/${courseId}${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ''}`)

// Placeholder of a lesson without a cover: a soft gradient tinted by kind.
export const KIND_TONES = {
  video: 'from-violet-500/25 to-fuchsia-500/15 text-violet-700 dark:text-violet-300',
  embed: 'from-sky-500/25 to-indigo-500/15 text-sky-700 dark:text-sky-300',
  text: 'from-blue-500/20 to-cyan-500/15 text-blue-700 dark:text-blue-300',
  file: 'from-slate-500/20 to-zinc-500/10 text-slate-700 dark:text-slate-300',
  quiz: 'from-amber-500/25 to-orange-500/15 text-amber-700 dark:text-amber-300',
  assignment: 'from-emerald-500/25 to-teal-500/15 text-emerald-700 dark:text-emerald-300',
}
export const kindTone = (kind) => KIND_TONES[kind] ?? KIND_TONES.file

// "4:05", "1:02:03". Empty string when unknown or zero.
export function formatClock(seconds) {
  const total = Math.round(Number(seconds) || 0)
  if (total <= 0) return ''
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// Sum of the known lesson durations of a section, in seconds.
export const sectionSeconds = (section) => (section?.lessons ?? []).reduce((sum, lesson) => sum + (Number(lesson.durationSeconds) > 0 ? Math.round(Number(lesson.durationSeconds)) : 0), 0)

export const lessonCountLabel = (count) => `${count ?? 0} ${count === 1 ? 'lección' : 'lecciones'}`
export const learnerCountLabel = (count) => `${count ?? 0} ${count === 1 ? 'alumno' : 'alumnos'}`

// Theater mode is remembered per viewer. Storage can be missing or throw.
const THEATER_KEY = 'runly.lms.theater'

export function readTheater(storage = globalThis.localStorage) {
  try { return storage?.getItem(THEATER_KEY) === '1' } catch { return false }
}

export function writeTheater(value, storage = globalThis.localStorage) {
  try { storage?.setItem(THEATER_KEY, value ? '1' : '0') } catch { /* storage unavailable: not remembered */ }
}

// Primary (and optional secondary) action of the course page.
// action: enroll | start | continue | review | certificate | preview | none
export function courseCta({ enrollment = null, certificate = null, canEnroll = false, canManage = false } = {}) {
  const status = enrollment?.status
  if (status === 'completed') {
    return certificate
      ? { action: 'certificate', label: 'Ver certificado', secondary: { action: 'review', label: 'Repasar curso' } }
      : { action: 'review', label: 'Repasar curso', secondary: null }
  }
  if (status === 'active') {
    return { action: enrollment.progressPct ? 'continue' : 'start', label: enrollment.progressPct ? 'Continuar' : 'Empezar curso', secondary: null }
  }
  if (canEnroll) return { action: 'enroll', label: status === 'dropped' ? 'Volver a inscribirme' : 'Inscribirme', secondary: null }
  if (canManage) return { action: 'preview', label: 'Vista previa', secondary: { action: 'edit', label: 'Editar curso' } }
  return { action: 'none', label: 'Inscripción por asignación', secondary: null, note: 'Pide a un responsable que te asigne este curso.' }
}

export const resourceName = (resource) => resource?.title?.trim() || resource?.fileName || 'Archivo'

// Moves an item of a list from one index to another (new array).
export function moveItem(list, from, to) {
  const next = [...(list ?? [])]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Sections open by default: the one holding `lessonId`, else the first one.
export function initialOpenSections(sections, lessonId = null) {
  const list = sections ?? []
  const holder = lessonId ? list.find((section) => (section.lessons ?? []).some((lesson) => lesson.id === lessonId)) : null
  const first = holder ?? list[0]
  return first ? [first.id] : []
}
