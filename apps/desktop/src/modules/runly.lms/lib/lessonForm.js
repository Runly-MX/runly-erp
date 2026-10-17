// Pure helpers for the lesson editor page: lesson <-> form values, validation,
// save payload and the unsaved-changes check.
import { formToSettings, settingsToForm, validateSettings } from './lmsEval.js'

export const EMPTY_LESSON_FORM = {
  title: '', kind: 'video', sectionId: null, body: '', embedUrl: '', durationMinutes: '', required: true, upload: null, cover: null, settings: {},
}

export function lessonToForm(lesson, sectionId = null) {
  if (!lesson) return { ...EMPTY_LESSON_FORM, sectionId, settings: settingsToForm(EMPTY_LESSON_FORM.kind) }
  return {
    title: lesson.title ?? '',
    kind: lesson.kind ?? 'text',
    sectionId: lesson.sectionId ?? sectionId,
    body: lesson.body ?? '',
    embedUrl: lesson.embedUrl ?? '',
    durationMinutes: lesson.durationSeconds ? String(Math.round(lesson.durationSeconds / 60)) : '',
    required: lesson.required !== false,
    upload: lesson.fileId ? { fileId: lesson.fileId, fileName: lesson.fileName, durationSeconds: lesson.durationSeconds } : null,
    cover: lesson.coverFileId ? { fileId: lesson.coverFileId, url: lesson.coverUrl ?? null } : null,
    settings: settingsToForm(lesson.kind, lesson.settings),
  }
}

// Switching kind drops the media, the video thumbnail and the settings of the previous kind.
export function changeLessonKind(form, kind, lesson = null) {
  if (kind === form.kind) return form
  return { ...form, kind, upload: null, cover: form.kind === 'video' ? null : form.cover ?? null, settings: settingsToForm(kind, lesson?.kind === kind ? lesson.settings : null) }
}

// field -> Spanish message ({} when valid).
export function validateLessonForm(form) {
  const errors = {}
  if (!String(form.title ?? '').trim()) errors.title = 'El título es obligatorio.'
  if (!form.sectionId) errors.sectionId = 'Elige la sección de la lección.'
  if ((form.kind === 'video' || form.kind === 'file') && !form.upload?.fileId) {
    errors.upload = form.kind === 'video' ? 'Sube el video de la lección.' : 'Sube el archivo de la lección.'
  }
  if (form.kind === 'embed' && !/^https:\/\//i.test(String(form.embedUrl ?? '').trim())) errors.embedUrl = 'Escribe un enlace que empiece con https://'
  if (form.kind === 'text' && !String(form.body ?? '').trim()) errors.body = 'Escribe el contenido de la lección.'
  if (form.kind === 'assignment' && !String(form.body ?? '').trim()) errors.body = 'Escribe las instrucciones de la tarea.'
  const settingsErrors = validateSettings(form.kind, form.settings)
  if (Object.keys(settingsErrors).length) errors.settings = settingsErrors
  return errors
}

// Save payload. An existing lesson never sends its section: moves between
// sections happen through drag and drop, and sending a stale section here
// would undo them.
export function lessonFormToPayload(form, { id = null } = {}) {
  const minutes = Number(form.durationMinutes)
  const durationSeconds = form.kind === 'video' && form.upload?.durationSeconds
    ? form.upload.durationSeconds
    : (minutes > 0 && form.kind !== 'quiz' ? Math.round(minutes * 60) : null)
  const media = form.kind === 'video' || form.kind === 'file'
  const settings = formToSettings(form.kind, form.settings)
  return {
    id: id ?? undefined,
    sectionId: id ? undefined : form.sectionId,
    title: String(form.title ?? '').trim(),
    kind: form.kind,
    body: String(form.body ?? '').trim() || null,
    fileId: media ? form.upload?.fileId ?? null : null,
    coverFileId: form.cover?.fileId ?? null,
    embedUrl: form.kind === 'embed' ? String(form.embedUrl ?? '').trim() : null,
    durationSeconds,
    required: form.required,
    ...(settings ? { settings } : {}),
  }
}

// Unsaved changes: compares what would be saved (trailing spaces and the
// section of an existing lesson do not count).
export function isLessonFormDirty(form, baseline, { id = null } = {}) {
  if (!form || !baseline) return false
  return JSON.stringify(lessonFormToPayload(form, { id })) !== JSON.stringify(lessonFormToPayload(baseline, { id }))
}
