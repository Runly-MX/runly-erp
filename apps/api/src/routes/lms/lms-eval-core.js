// Pure rules for runly.lms evaluation (quizzes and assignments). No I/O.
import { randomInt } from 'node:crypto'
import { LmsError } from './lms-error.js'

export const QUESTION_KINDS = ['single', 'multiple', 'true_false', 'open']
export const SHOW_ANSWERS = ['never', 'after_submit', 'after_pass']
export const SUBMIT_GRACE_MS = 30_000
export const SUBMISSION_MAX_BYTES = 50 * 1024 * 1024
export const SUBMISSION_MIME = [/^image\//, /^audio\//, /^video\//, /^application\/pdf$/, /^text\/plain$/, /^application\/msword$/, /^application\/vnd\.openxmlformats/, /^application\/vnd\.ms-/, /^application\/zip$/, /^application\/x-zip/]

const DAY_MS = 24 * 3600 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRUE_FALSE = [{ id: 'true', text: 'Verdadero' }, { id: 'false', text: 'Falso' }]
const has = (body, key) => Object.prototype.hasOwnProperty.call(body ?? {}, key)
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const blank = (value) => value === null || value === undefined || value === ''
const round2 = (n) => Math.round(n * 100) / 100

function clampInt(value, min, max, fallback) {
  if (blank(value)) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function normalizeQuizSettings(raw) {
  const src = isObject(raw) ? raw : {}
  return {
    passingScore: clampInt(src.passingScore, 0, 100, 70),
    maxAttempts: clampInt(src.maxAttempts, 1, 100, null),
    timeLimitMinutes: clampInt(src.timeLimitMinutes, 1, 600, null),
    drawCount: clampInt(src.drawCount, 1, 500, null),
    shuffleQuestions: src.shuffleQuestions === true,
    shuffleOptions: src.shuffleOptions !== false,
    showAnswers: SHOW_ANSWERS.includes(src.showAnswers) ? src.showAnswers : 'after_submit',
  }
}

export function normalizeAssignmentSettings(raw) {
  const src = isObject(raw) ? raw : {}
  return {
    allowText: src.allowText !== false,
    allowFiles: src.allowFiles !== false,
    maxFiles: clampInt(src.maxFiles, 1, 10, 5),
    dueDaysAfterEnroll: clampInt(src.dueDaysAfterEnroll, 1, 3650, null),
    passingScore: clampInt(src.passingScore, 0, 100, null),
  }
}

export function normalizeLessonSettings(kind, raw) {
  if (kind === 'quiz') return normalizeQuizSettings(raw)
  if (kind === 'assignment') return normalizeAssignmentSettings(raw)
  return {}
}

// ---- questions ------------------------------------------------------------
export const randomOptionId = () => `o${randomInt(36 ** 6).toString(36).padStart(6, '0')}`

function normalizeOptions(kind, raw, existing, makeId) {
  if (kind === 'open') return []
  if (!Array.isArray(raw)) throw new LmsError('Agrega las opciones de respuesta.', 400)
  if (kind === 'true_false') {
    const marked = new Set()
    raw.forEach((option, index) => {
      if (option?.correct !== true) return
      const id = option.id === 'true' || option.id === 'false' ? option.id : ['true', 'false'][index]
      if (id) marked.add(id)
    })
    if (marked.size !== 1) throw new LmsError('Indica si la respuesta correcta es Verdadero o Falso.', 400)
    return TRUE_FALSE.map((option) => ({ ...option, correct: marked.has(option.id) }))
  }
  if (raw.length < 2) throw new LmsError('Agrega al menos dos opciones.', 400)
  if (raw.length > 20) throw new LmsError('Una pregunta admite como máximo 20 opciones.', 400)
  const previous = (existing ?? []).map((option) => option?.id).filter((id) => id && id !== 'true' && id !== 'false')
  const known = new Set(previous)
  const claimed = new Set(raw.map((option) => option?.id).filter((id) => known.has(id)))
  const used = new Set()
  const options = raw.map((option, index) => {
    const text = String(option?.text ?? '').trim()
    if (!text) throw new LmsError('Escribe el texto de cada opción.', 400)
    if (text.length > 1000) throw new LmsError('Una opción es demasiado larga.', 400)
    let id = null
    if (known.has(option?.id) && !used.has(option.id)) id = option.id
    else if (previous[index] && !claimed.has(previous[index]) && !used.has(previous[index])) id = previous[index]
    while (!id || used.has(id)) id = makeId()
    used.add(id)
    return { id, text, correct: option?.correct === true }
  })
  const correct = options.filter((option) => option.correct).length
  if (kind === 'single' && correct !== 1) throw new LmsError('Marca exactamente una opción correcta.', 400)
  if (kind === 'multiple' && correct < 1) throw new LmsError('Marca al menos una opción correcta.', 400)
  return options
}

export function normalizeQuestionInput(body = {}, { partial = false, existing = null, makeId = randomOptionId } = {}) {
  const src = isObject(body) ? body : {}
  const data = {}
  if (!partial || has(src, 'kind')) {
    const kind = src.kind ?? 'single'
    if (!QUESTION_KINDS.includes(kind)) throw new LmsError('Tipo de pregunta inválido.', 400)
    data.kind = kind
  }
  if (!partial || has(src, 'prompt')) {
    const prompt = String(src.prompt ?? '').trim()
    if (!prompt) throw new LmsError('Escribe la pregunta.', 400)
    if (prompt.length > 10_000) throw new LmsError('La pregunta es demasiado larga.', 400)
    data.prompt = prompt
  }
  if (!partial || has(src, 'points')) {
    const points = Number(blank(src.points) ? 1 : src.points)
    if (!Number.isInteger(points) || points < 1 || points > 1000) throw new LmsError('Los puntos deben ser un número entero entre 1 y 1000.', 400)
    data.points = points
  }
  if (has(src, 'explanation')) {
    const explanation = String(src.explanation ?? '').trim()
    if (explanation.length > 10_000) throw new LmsError('La explicación es demasiado larga.', 400)
    data.explanation = explanation || null
  }
  const kind = data.kind ?? existing?.kind
  const kindChanged = partial && data.kind !== undefined && data.kind !== existing?.kind
  if (!partial || has(src, 'options') || kindChanged) {
    const raw = has(src, 'options') ? src.options : existing?.options ?? []
    data.options = normalizeOptions(kind, raw, existing?.options, makeId)
  }
  return data
}

// ---- attempts -------------------------------------------------------------
function shuffle(list, random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// questions: enabled, in authored order.
export function drawQuestions(questions, settings, random = Math.random) {
  const s = normalizeQuizSettings(settings)
  let picked = [...questions]
  if (s.drawCount && s.drawCount < picked.length) {
    const chosen = new Set(shuffle(picked, random).slice(0, s.drawCount).map((q) => q.id))
    picked = picked.filter((q) => chosen.has(q.id))
  }
  if (s.shuffleQuestions) picked = shuffle(picked, random)
  const optionOrder = {}
  for (const q of picked) {
    const ids = (q.options ?? []).map((option) => option.id)
    if (q.kind === 'open') optionOrder[q.id] = []
    else optionOrder[q.id] = q.kind === 'true_false' || !s.shuffleOptions ? ids : shuffle(ids, random)
  }
  return { questionIds: picked.map((q) => q.id), optionOrder }
}

// answers: { questionId: { optionIds?: [], text?: string } }; manualPoints: { questionId: n }.
export function scoreAttempt(questions, answers = {}, manualPoints = {}) {
  const perQuestion = {}
  let autoPoints = 0
  let manualTotal = 0
  let maxPoints = 0
  let needsReview = false
  for (const q of questions) {
    const points = Number(q.points) || 0
    maxPoints += points
    if (q.kind === 'open') {
      const raw = manualPoints?.[q.id]
      const n = blank(raw) ? NaN : Number(raw)
      if (!Number.isFinite(n)) {
        needsReview = true
        perQuestion[q.id] = { awarded: null, correct: null }
        continue
      }
      const awarded = round2(Math.min(points, Math.max(0, n)))
      manualTotal += awarded
      perQuestion[q.id] = { awarded, correct: awarded >= points }
      continue
    }
    const picked = answers?.[q.id]?.optionIds
    const selected = [...new Set(Array.isArray(picked) ? picked : [])]
    const correctIds = (q.options ?? []).filter((option) => option.correct).map((option) => option.id)
    const correct = q.kind === 'multiple'
      ? selected.length === correctIds.length && selected.every((id) => correctIds.includes(id))
      : selected.length === 1 && correctIds.includes(selected[0])
    const awarded = correct ? points : 0
    autoPoints += awarded
    perQuestion[q.id] = { awarded, correct }
  }
  const scorePoints = needsReview ? null : round2(autoPoints + manualTotal)
  const scorePct = needsReview ? null : maxPoints > 0 ? round2((scorePoints / maxPoints) * 100) : 0
  return { perQuestion, autoPoints, maxPoints, needsReview, scorePoints, scorePct }
}

export function attemptsAllowed(settings, extraAttempts = 0) {
  const { maxAttempts } = normalizeQuizSettings(settings)
  if (maxAttempts === null) return Infinity
  return maxAttempts + Math.max(0, Number(extraAttempts) || 0)
}

export function isExpired(attempt, now = new Date()) {
  if (!attempt?.deadlineAt) return false
  return now.getTime() > new Date(attempt.deadlineAt).getTime() + SUBMIT_GRACE_MS
}

// Lesson status an attempt leaves behind (a completed lesson never goes back; see lms-progress).
export function attemptOutcome({ needsReview, passed, attemptsUsed, allowed }) {
  if (needsReview) return 'pending_review'
  if (passed) return 'completed'
  return attemptsUsed >= allowed ? 'failed' : 'in_progress'
}

// Keeps answers for drawn questions only, and option ids the question shows.
export function sanitizeAnswers(raw, questionIds, optionOrder = {}) {
  if (!isObject(raw)) throw new LmsError('Respuestas inválidas.', 400)
  const allowed = new Set(questionIds)
  const out = {}
  for (const [questionId, value] of Object.entries(raw)) {
    if (!allowed.has(questionId)) continue
    const order = optionOrder?.[questionId] ?? []
    if (!order.length) {
      const text = String(value?.text ?? '')
      if (text.length > 20_000) throw new LmsError('Una respuesta es demasiado larga.', 400)
      out[questionId] = { text }
      continue
    }
    const ids = Array.isArray(value?.optionIds) ? value.optionIds.map(String) : []
    out[questionId] = { optionIds: [...new Set(ids)].filter((id) => order.includes(id)) }
  }
  return out
}

function orderedOptions(question, order) {
  const all = question.options ?? []
  if (!Array.isArray(order)) return all
  const byId = new Map(all.map((option) => [option.id, option]))
  return [...order.map((id) => byId.get(id)).filter(Boolean), ...all.filter((option) => !order.includes(option.id))]
}

export function learnerQuestion(question, optionOrder) {
  return {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    points: question.points,
    options: orderedOptions(question, optionOrder).map(({ id, text }) => ({ id, text })),
  }
}

// result: scoreAttempt().perQuestion[question.id].
export function revealedQuestion(question, optionOrder, result) {
  return {
    ...learnerQuestion(question, optionOrder),
    options: orderedOptions(question, optionOrder).map(({ id, text, correct }) => ({ id, text, correct: correct === true })),
    explanation: question.explanation ?? null,
    awardedPoints: result?.awarded ?? null,
    correct: result?.correct ?? null,
  }
}

export function revealAllowed(showAnswers, passed) {
  if (showAnswers === 'never') return false
  if (showAnswers === 'after_pass') return passed === true
  return true
}

// ---- assignments ----------------------------------------------------------
export function assignmentDueAt(enrollment, settings) {
  const { dueDaysAfterEnroll } = normalizeAssignmentSettings(settings)
  if (!dueDaysAfterEnroll || !enrollment?.createdAt) return null
  return new Date(new Date(enrollment.createdAt).getTime() + dueDaysAfterEnroll * DAY_MS)
}

// latest: the learner's newest submission for the lesson, or null.
export function validateSubmission({ text, fileIds } = {}, settings, latest) {
  if (latest?.status === 'submitted') throw new LmsError('Tu entrega anterior está pendiente de revisión.', 409, 'PENDING')
  if (latest?.status === 'approved') throw new LmsError('Esta tarea ya fue aprobada.', 409, 'APPROVED')
  const s = normalizeAssignmentSettings(settings)
  const body = String(text ?? '').trim()
  if (body.length > 50_000) throw new LmsError('La respuesta es demasiado larga.', 400)
  const ids = Array.isArray(fileIds) ? [...new Set(fileIds.map(String))] : []
  if (ids.some((id) => !UUID.test(id))) throw new LmsError('Identificador de archivo inválido.', 400)
  if (body && !s.allowText) throw new LmsError('Esta tarea no admite respuesta escrita.', 400)
  if (ids.length && !s.allowFiles) throw new LmsError('Esta tarea no admite archivos.', 400)
  if (ids.length > s.maxFiles) throw new LmsError(`Adjunta como máximo ${s.maxFiles} archivos.`, 400)
  if (!body && !ids.length) {
    const message = s.allowText && s.allowFiles ? 'Escribe tu respuesta o adjunta al menos un archivo.' : s.allowText ? 'Escribe tu respuesta.' : 'Adjunta al menos un archivo.'
    throw new LmsError(message, 400)
  }
  return { text: body || null, fileIds: ids }
}

export function validateGradeDecision({ decision, grade } = {}, settings) {
  if (decision !== 'approve' && decision !== 'return') throw new LmsError('Elige aprobar o devolver la entrega.', 400)
  const { passingScore } = normalizeAssignmentSettings(settings)
  let value = null
  if (!blank(grade)) {
    const n = Number(grade)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new LmsError('La calificación debe estar entre 0 y 100.', 400)
    value = round2(n)
  }
  if (decision === 'approve' && passingScore !== null) {
    if (value === null) throw new LmsError('Escribe la calificación para aprobar la entrega.', 400)
    if (value < passingScore) throw new LmsError(`Para aprobar, la calificación debe ser al menos ${passingScore}.`, 400)
  }
  return { decision, grade: value }
}
