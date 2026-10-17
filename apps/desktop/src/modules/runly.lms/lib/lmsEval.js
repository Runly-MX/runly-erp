// Pure helpers for runly.lms evaluation (quizzes and assignments): lesson
// settings <-> form values, question form rules, answers, timers and grading.

export const QUIZ_DEFAULTS = {
  passingScore: 70, maxAttempts: null, timeLimitMinutes: null, drawCount: null,
  shuffleQuestions: false, shuffleOptions: true, showAnswers: 'after_submit',
}
export const ASSIGNMENT_DEFAULTS = { allowText: true, allowFiles: true, maxFiles: 5, dueDaysAfterEnroll: null, passingScore: null }

// Files a learner can attach to an assignment (mirrors the API allow-list).
export const SUBMISSION_ACCEPT = 'application/pdf,image/*,audio/*,video/*,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip'
export const SUBMISSION_MAX_MB = 50

// Bounds shared by the editor fields (NumberField min/max) and the validators.
export const LMS_BOUNDS = {
  passingScore: { min: 0, max: 100 },
  maxAttempts: { min: 1, max: 20 },
  timeLimitMinutes: { min: 1, max: 600 },
  drawCount: { min: 1, max: 200 },
  points: { min: 1, max: 100 },
  maxFiles: { min: 1, max: 10 },
  dueDaysAfterEnroll: { min: 1, max: 365 },
  grade: { min: 0, max: 100 },
  minutes: { min: 0, max: 10000 },
}
const B = LMS_BOUNDS

const asText = (value) => (value === null || value === undefined ? '' : String(value))
const blank = (value) => String(value ?? '').trim() === ''

// '' -> null; otherwise an integer clamped to [min, max].
export function toIntOrNull(value, { min = 0, max = Infinity } = {}) {
  if (blank(value)) return null
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return null
  return Math.min(max, Math.max(min, number))
}

// Lesson settings -> sheet form values (NumberField works with strings).
export function settingsToForm(kind, settings) {
  if (kind === 'quiz') {
    const s = { ...QUIZ_DEFAULTS, ...(settings ?? {}) }
    return {
      passingScore: asText(s.passingScore), maxAttempts: asText(s.maxAttempts), timeLimitMinutes: asText(s.timeLimitMinutes),
      drawCount: asText(s.drawCount), shuffleQuestions: Boolean(s.shuffleQuestions), shuffleOptions: s.shuffleOptions !== false,
      showAnswers: s.showAnswers || QUIZ_DEFAULTS.showAnswers,
    }
  }
  if (kind === 'assignment') {
    const s = { ...ASSIGNMENT_DEFAULTS, ...(settings ?? {}) }
    return {
      allowText: s.allowText !== false, allowFiles: s.allowFiles !== false, maxFiles: asText(s.maxFiles),
      dueDaysAfterEnroll: asText(s.dueDaysAfterEnroll), passingScore: asText(s.passingScore),
    }
  }
  return {}
}

// Sheet form values -> lesson settings payload (null for kinds without settings).
export function formToSettings(kind, form) {
  if (kind === 'quiz') {
    return {
      passingScore: toIntOrNull(form.passingScore, B.passingScore) ?? QUIZ_DEFAULTS.passingScore,
      maxAttempts: toIntOrNull(form.maxAttempts, B.maxAttempts),
      timeLimitMinutes: toIntOrNull(form.timeLimitMinutes, B.timeLimitMinutes),
      drawCount: toIntOrNull(form.drawCount, B.drawCount),
      shuffleQuestions: Boolean(form.shuffleQuestions),
      shuffleOptions: Boolean(form.shuffleOptions),
      showAnswers: form.showAnswers || QUIZ_DEFAULTS.showAnswers,
    }
  }
  if (kind === 'assignment') {
    return {
      allowText: Boolean(form.allowText),
      allowFiles: Boolean(form.allowFiles),
      maxFiles: toIntOrNull(form.maxFiles, B.maxFiles) ?? ASSIGNMENT_DEFAULTS.maxFiles,
      dueDaysAfterEnroll: toIntOrNull(form.dueDaysAfterEnroll, B.dueDaysAfterEnroll),
      passingScore: toIntOrNull(form.passingScore, B.passingScore),
    }
  }
  return null
}

const outOfRange = (value, min, max) => !blank(value) && (!Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max)

// field -> Spanish message for the lesson sheet.
export function validateSettings(kind, form) {
  const errors = {}
  if (kind === 'quiz') {
    if (blank(form.passingScore) || outOfRange(form.passingScore, 0, 100)) errors.passingScore = 'Escribe un porcentaje entre 0 y 100.'
    if (outOfRange(form.maxAttempts, 1, 20)) errors.maxAttempts = 'Escribe un número entre 1 y 20, o déjalo vacío.'
    if (outOfRange(form.timeLimitMinutes, 1, 600)) errors.timeLimitMinutes = 'Escribe de 1 a 600 minutos, o déjalo vacío.'
    if (outOfRange(form.drawCount, 1, 200)) errors.drawCount = 'Escribe un número entre 1 y 200, o déjalo vacío.'
  }
  if (kind === 'assignment') {
    if (!form.allowText && !form.allowFiles) errors.allowText = 'Permite al menos texto o archivos.'
    if (form.allowFiles && (blank(form.maxFiles) || outOfRange(form.maxFiles, 1, 10))) errors.maxFiles = 'Escribe un número entre 1 y 10.'
    if (outOfRange(form.dueDaysAfterEnroll, 1, 365)) errors.dueDaysAfterEnroll = 'Escribe de 1 a 365 días, o déjalo vacío.'
    if (outOfRange(form.passingScore, 0, 100)) errors.passingScore = 'Escribe un número entre 0 y 100, o déjalo vacío.'
  }
  return errors
}

// ---- Question authoring ---------------------------------------------------------
const blankOption = () => ({ text: '', correct: false })

export function emptyQuestionForm(kind = 'single') {
  return { kind, prompt: '', points: '1', explanation: '', options: [blankOption(), blankOption()], trueFalse: 'true' }
}

export function questionToForm(question) {
  if (!question) return emptyQuestionForm()
  const options = (question.options ?? []).map((option) => ({ text: option.text ?? '', correct: Boolean(option.correct) }))
  const trueOption = (question.options ?? []).find((option) => option.id === 'true')
  return {
    kind: question.kind,
    prompt: question.prompt ?? '',
    points: asText(question.points ?? 1),
    explanation: question.explanation ?? '',
    options: question.kind === 'single' || question.kind === 'multiple' ? options : [blankOption(), blankOption()],
    trueFalse: trueOption && !trueOption.correct ? 'false' : 'true',
  }
}

// Kind switch: choice kinds keep their rows (single keeps one correct answer).
export function changeQuestionKind(form, kind) {
  if (kind === 'single') {
    let seen = false
    const options = form.options.map((option) => {
      const correct = option.correct && !seen
      if (option.correct) seen = true
      return { ...option, correct }
    })
    return { ...form, kind, options }
  }
  return { ...form, kind }
}

// "Correcta" toggle: exclusive for single, independent for multiple.
export function setOptionCorrect(form, index, checked) {
  return {
    ...form,
    options: form.options.map((option, i) => {
      if (i === index) return { ...option, correct: checked }
      return form.kind === 'single' && checked ? { ...option, correct: false } : option
    }),
  }
}

export function validateQuestionForm(form) {
  const errors = {}
  if (blank(form.prompt)) errors.prompt = 'Escribe la pregunta.'
  if (outOfRange(form.points, 1, 100) || blank(form.points)) errors.points = 'Escribe un número entero de 1 a 100.'
  if (form.kind === 'single' || form.kind === 'multiple') {
    const correct = form.options.filter((option) => option.correct).length
    if (form.options.length < 2) errors.options = 'Agrega al menos dos opciones.'
    else if (form.options.some((option) => blank(option.text))) errors.options = 'Completa o elimina las opciones vacías.'
    else if (form.kind === 'single' && correct !== 1) errors.options = 'Marca exactamente una opción correcta.'
    else if (form.kind === 'multiple' && correct < 1) errors.options = 'Marca al menos una opción correcta.'
  }
  return errors
}

// Question form -> POST/PATCH body ({ kind, prompt, options: [{ text, correct }], points, explanation }).
export function formToQuestion(form) {
  let options = []
  if (form.kind === 'single' || form.kind === 'multiple') options = form.options.map((option) => ({ text: option.text.trim(), correct: Boolean(option.correct) }))
  if (form.kind === 'true_false') options = [{ text: 'Verdadero', correct: form.trueFalse === 'true' }, { text: 'Falso', correct: form.trueFalse === 'false' }]
  return {
    kind: form.kind,
    prompt: form.prompt.trim(),
    options,
    points: toIntOrNull(form.points, B.points) ?? 1,
    explanation: form.explanation.trim() || null,
  }
}

// ---- Attempts -------------------------------------------------------------------
export function isAnswered(question, answer) {
  if (!answer) return false
  if (question.kind === 'open') return !blank(answer.text)
  return Array.isArray(answer.optionIds) && answer.optionIds.length > 0
}

export const countUnanswered = (questions, answers) => (questions ?? []).filter((question) => !isAnswered(question, answers?.[question.id])).length

// New answer after clicking an option: single/true_false keep one, multiple toggles
// (kept in display order).
export function selectOption(question, answer, optionId) {
  if (question.kind !== 'multiple') return { optionIds: [optionId] }
  const chosen = new Set(answer?.optionIds ?? [])
  if (chosen.has(optionId)) chosen.delete(optionId)
  else chosen.add(optionId)
  return { optionIds: (question.options ?? []).map((option) => option.id).filter((id) => chosen.has(id)) }
}

// Milliseconds left (never negative); null when there is no deadline.
export function remainingMs(deadlineAt, now = Date.now()) {
  if (!deadlineAt) return null
  const end = new Date(deadlineAt).getTime()
  return Number.isFinite(end) ? Math.max(0, end - now) : null
}

// "4:05", "1:02:03".
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000))
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

// What the quiz start card can offer. `attemptsAllowed` null = unlimited.
export function quizState(summary) {
  if (!summary) return { resume: false, pendingReview: false, remaining: 0, canStart: false, outOfAttempts: false }
  const allowed = summary.attemptsAllowed
  const used = summary.attemptsUsed ?? 0
  const remaining = allowed === null || allowed === undefined ? Infinity : Math.max(0, allowed - used)
  const resume = Boolean(summary.currentAttemptId)
  const pendingReview = summary.lastAttempt?.status === 'submitted'
  return {
    resume, pendingReview, remaining,
    canStart: resume || (!pendingReview && remaining > 0),
    outOfAttempts: !resume && remaining === 0 && !summary.passed,
  }
}

export function attemptsText(used, allowed) {
  if (allowed === null || allowed === undefined) return `${used ?? 0} usados · sin límite`
  return `${used ?? 0} de ${allowed}`
}

export const formatPct = (value) => (value === null || value === undefined ? '—' : `${Math.round(Number(value) * 10) / 10}%`)

// ---- Grading --------------------------------------------------------------------
// Manual points of an attempt's open questions: { values, errors }.
export function validateManualPoints(questions, draft) {
  const values = {}, errors = {}
  for (const question of questions ?? []) {
    if (question.kind !== 'open') continue
    const raw = draft?.[question.id]
    const number = Number(raw)
    if (blank(raw) || !Number.isFinite(number) || number < 0 || number > question.points) errors[question.id] = `Escribe de 0 a ${question.points} puntos.`
    else values[question.id] = number
  }
  return { values, errors }
}
