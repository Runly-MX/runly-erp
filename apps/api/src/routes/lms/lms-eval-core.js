// Pure rules for runly.lms evaluation (quizzes and assignments). No I/O.
import { randomInt } from 'node:crypto'
import { LmsError } from './lms-error.js'
import { QUESTION_KINDS, normalizeOptionsFor, readOptions } from './lms-question-input.js'
import { displayOrder, learnerQuestion, revealedQuestion, sanitizeAnswer, scoreQuestion } from './lms-question-attempt.js'

export { QUESTION_KINDS, learnerQuestion, revealedQuestion }
export const SHOW_ANSWERS = ['never', 'after_submit', 'after_pass']
export const QUIZ_LAYOUTS = ['all', 'one']
export const SUBMIT_GRACE_MS = 30_000
export const SUBMISSION_MAX_BYTES = 50 * 1024 * 1024
export const SUBMISSION_MIME = [/^image\//, /^audio\//, /^video\//, /^application\/pdf$/, /^text\/plain$/, /^application\/msword$/, /^application\/vnd\.openxmlformats/, /^application\/vnd\.ms-/, /^application\/zip$/, /^application\/x-zip/]

const DAY_MS = 24 * 3600 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
    layout: QUIZ_LAYOUTS.includes(src.layout) ? src.layout : 'all',
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
  // fill_blank keeps its answers in the prompt, so a new prompt re-validates them.
  const promptMatters = kind === 'fill_blank' && data.prompt !== undefined
  if (!partial || has(src, 'options') || has(src, 'config') || kindChanged || promptMatters) {
    const stored = readOptions(existing?.options)
    data.options = normalizeOptionsFor(kind, {
      options: has(src, 'options') ? src.options : stored.items,
      config: has(src, 'config') ? src.config : stored.config,
      prompt: data.prompt ?? existing?.prompt,
      existing: existing?.options,
      makeId,
    })
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

// questions: enabled, in authored order. drawCount above the question count means all.
export function drawQuestions(questions, settings, random = Math.random) {
  const s = normalizeQuizSettings(settings)
  let picked = [...questions]
  if (s.drawCount && s.drawCount < picked.length) {
    const chosen = new Set(shuffle(picked, random).slice(0, s.drawCount).map((q) => q.id))
    picked = picked.filter((q) => chosen.has(q.id))
  }
  if (s.shuffleQuestions) picked = shuffle(picked, random)
  const optionOrder = {}
  for (const q of picked) optionOrder[q.id] = displayOrder(q, s.shuffleOptions, random)
  return { questionIds: picked.map((q) => q.id), optionOrder }
}

// answers: see lms-question-attempt.js; manualPoints: { questionId: n } for open
// questions; optionOrder: the attempt's display order (ordering questions the
// learner never touched are scored as shown).
export function scoreAttempt(questions, answers = {}, manualPoints = {}, optionOrder = {}) {
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
    const result = scoreQuestion(q, answers?.[q.id], optionOrder?.[q.id])
    autoPoints += result.awarded
    perQuestion[q.id] = result
  }
  autoPoints = round2(autoPoints)
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

// Keeps answers for drawn questions only, cleaned per kind. `questionsById`
// (Map) gives the kinds; without it every question is treated as choice/open
// by its option order (the shape attempts had before the extra kinds).
export function sanitizeAnswers(raw, questionIds, optionOrder = {}, questionsById = null) {
  if (!isObject(raw)) throw new LmsError('Respuestas inválidas.', 400)
  const allowed = new Set(questionIds)
  const out = {}
  for (const [questionId, value] of Object.entries(raw)) {
    if (!allowed.has(questionId)) continue
    const order = optionOrder?.[questionId] ?? []
    const question = questionsById?.get?.(questionId) ?? { kind: order.length ? 'single' : 'open', options: [] }
    out[questionId] = sanitizeAnswer(question, value, order)
  }
  return out
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
