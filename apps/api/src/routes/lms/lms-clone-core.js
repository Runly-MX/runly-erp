// Pure planning for scripts/lms-clone-course-to-assessment.mjs (spec 2026-11-21 section 10):
// which lessons of a course become activities of a new evaluation, the exam
// adjustments applied to them, and a checksum of the copied content so the
// copy can be compared with its source. No I/O.
import { createHash } from 'node:crypto'
import { LmsError } from './lms-core.js'
import { ACTIVITY_PRESETS, mergeAssessmentSettings } from './lms-assessment-core.js'
import { normalizeLessonSettings, readRubric } from './lms-eval-core.js'

export const DEFAULT_ACCEPTED = ['xlsx', 'xls', 'pptx', 'pdf']
const TYPE_BY_KIND = { quiz: 'questionnaire', assignment: 'practical' }

// Stable JSON (sorted keys) so the checksum does not depend on key order.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value ?? null)
}
export const sha256 = (value) => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')

// The content that must be identical in source and copy: texts, questions
// (verbatim, in order), points and material file ids.
export function contentShape(activities) {
  return activities.map((activity) => ({
    title: activity.title,
    body: activity.body ?? null,
    kind: activity.kind,
    questions: activity.questions.map((q) => ({ kind: q.kind, prompt: q.prompt, options: q.options ?? [], explanation: q.explanation ?? null, points: q.points })),
    resources: activity.resources.map((r) => ({ fileId: r.fileId, title: r.title ?? null })),
    maxPoints: activityPoints(activity),
  }))
}
export const contentChecksum = (activities) => sha256(contentShape(activities))

export function activityPoints(activity) {
  if (activity.kind === 'quiz') return activity.questions.reduce((sum, q) => sum + q.points, 0)
  return normalizeLessonSettings('assignment', activity.settings).maxPoints
}

// Exam rules that differ from a course quiz/assignment on purpose; each change is reported.
function examSettings(kind, source, entry) {
  const before = normalizeLessonSettings(kind, source)
  let next
  if (kind === 'quiz') {
    // One global clock and one session govern the evaluation; answers are never shown to a candidate.
    next = normalizeLessonSettings('quiz', { ...ACTIVITY_PRESETS.questionnaire.settings, ...source, showAnswers: 'never', timeLimitMinutes: null, maxAttempts: null })
  } else {
    const rubric = entry.rubric !== undefined ? readRubric(entry.rubric) : readRubric(source?.rubric)
    if (entry.rubric !== undefined && rubric.length !== entry.rubric.length) throw new LmsError(`La rúbrica de «${entry.from}» tiene criterios inválidos.`, 400)
    const maxPoints = entry.maxPoints ?? (rubric.length ? undefined : before.maxPoints)
    if (rubric.length && entry.maxPoints !== undefined && rubric.reduce((sum, c) => sum + c.points, 0) !== entry.maxPoints) {
      throw new LmsError(`La rúbrica de «${entry.from}» no suma ${entry.maxPoints} puntos.`, 400)
    }
    next = normalizeLessonSettings('assignment', {
      ...source,
      allowFiles: true,
      acceptedTypes: entry.acceptedTypes ?? source?.acceptedTypes ?? DEFAULT_ACCEPTED,
      maxFiles: entry.maxFiles ?? source?.maxFiles ?? 2,
      maxFileMb: entry.maxFileMb ?? source?.maxFileMb ?? 50,
      maxPoints, rubric,
      dueDaysAfterEnroll: null,
    })
  }
  const adjustments = Object.keys(next).filter((key) => canonical(next[key]) !== canonical(before[key])).map((key) => ({ setting: key, from: before[key] ?? null, to: next[key] ?? null }))
  return { settings: next, adjustments }
}

// source: { course, sections, lessons, questions, resources } as read from the DB (enabled rows).
// map (optional, from --map): { title, minutes, sessions, activities: [{ from, type?, title?, maxPoints?, rubric?, acceptedTypes?, maxFiles?, maxFileMb?, material?: [lessonId] }] }
export function planClone(source, map = {}) {
  const { course } = source
  if (course.kind !== 'course') throw new LmsError('El origen debe ser un curso, no una evaluación.', 400)
  const sectionPos = new Map(source.sections.map((s) => [s.id, s.position]))
  const lessons = [...source.lessons].sort((a, b) => (sectionPos.get(a.sectionId) ?? 0) - (sectionPos.get(b.sectionId) ?? 0) || a.position - b.position)
  const byId = new Map(lessons.map((l) => [l.id, l]))
  const questionsOf = (id) => source.questions.filter((q) => q.lessonId === id).sort((a, b) => a.position - b.position)
  const resourcesOf = (id) => source.resources.filter((r) => r.lessonId === id).sort((a, b) => a.position - b.position)

  const entries = map.activities?.length
    ? map.activities
    : lessons.filter((l) => TYPE_BY_KIND[l.kind]).map((l) => ({ from: l.id }))
  const activities = entries.map((entry) => {
    const lesson = byId.get(entry.from)
    if (!lesson) throw new LmsError(`La lección ${entry.from} no está en el curso de origen.`, 400)
    const type = entry.type ?? TYPE_BY_KIND[lesson.kind]
    const preset = ACTIVITY_PRESETS[type]
    if (!preset || preset.kind !== lesson.kind) throw new LmsError(`«${lesson.title}» (${lesson.kind}) no puede ser una actividad de tipo ${type}.`, 400)
    const { settings, adjustments } = examSettings(lesson.kind, lesson.settings, entry)
    return {
      from: lesson.id, type, kind: lesson.kind, title: entry.title ?? lesson.title, body: lesson.body ?? null, settings, adjustments,
      questions: lesson.kind === 'quiz' ? questionsOf(lesson.id) : [],
      resources: resourcesOf(lesson.id).map((r) => ({ fileId: r.fileId, title: r.title ?? null, fromLessonId: lesson.id })),
    }
  })
  if (!activities.length) throw new LmsError('El curso no tiene exámenes ni tareas que copiar.', 400)

  // Material: file lessons (or any lesson named in a map entry) become downloadable resources.
  const used = new Set(activities.map((a) => a.from))
  const target = activities.find((a) => a.type === 'practical') ?? activities[0]
  const defaultMaterial = map.activities?.length ? [] : lessons.filter((l) => l.kind === 'file' && l.fileId).map((l) => ({ target, lesson: l }))
  const named = (map.activities ?? []).flatMap((entry, index) => (entry.material ?? []).map((id) => {
    const lesson = byId.get(id)
    if (!lesson) throw new LmsError(`La lección de material ${id} no está en el curso de origen.`, 400)
    return { target: activities[index], lesson }
  }))
  for (const { target: activity, lesson } of [...defaultMaterial, ...named]) {
    const files = lesson.fileId ? [{ fileId: lesson.fileId, title: lesson.title }] : resourcesOf(lesson.id).map((r) => ({ fileId: r.fileId, title: r.title ?? lesson.title }))
    for (const file of files) if (!activity.resources.some((r) => r.fileId === file.fileId)) activity.resources.push({ ...file, fromLessonId: lesson.id })
    used.add(lesson.id)
  }
  const skipped = lessons.filter((l) => !used.has(l.id)).map((l) => ({ lessonId: l.id, title: l.title, kind: l.kind }))

  const assessmentSettings = { ...mergeAssessmentSettings({ timeLimitMinutes: map.minutes ?? 60, maxSessions: map.sessions ?? 1 }, {}), sourceCourseId: course.id }
  const points = activities.map(activityPoints)
  return {
    assessment: { title: map.title ?? course.title, summary: course.summary ?? null, description: course.description ?? null, settings: assessmentSettings },
    activities, skipped,
    totalPoints: points.reduce((sum, value) => sum + value, 0),
    checksum: contentChecksum(activities),
  }
}

// The map a dry run writes for the owner to adjust (B1) before --apply.
export function defaultMap(plan) {
  return {
    title: plan.assessment.title,
    minutes: plan.assessment.settings.timeLimitMinutes,
    sessions: plan.assessment.settings.maxSessions,
    activities: plan.activities.map((a) => ({
      from: a.from, type: a.type, title: a.title,
      ...(a.kind === 'assignment' ? { maxPoints: a.settings.maxPoints, rubric: a.settings.rubric, acceptedTypes: a.settings.acceptedTypes, maxFiles: a.settings.maxFiles } : {}),
      material: [...new Set(a.resources.map((r) => r.fromLessonId).filter((id) => id !== a.from))],
    })),
  }
}
