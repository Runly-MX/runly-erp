// Pure rules of the consolidated grading of an evaluation session (spec
// 2026-11-21 section 9, phase 5). No I/O.
//  - Activity maximum and grading basis are frozen in the session snapshot at
//    start (question points, rubric); later edits never change them.
//  - Quiz score: auto (existing engine) + manual points per open question.
//  - Delivery score: direct points 0..max or the sum of the rubric criteria.
//  - Total = sum of activity scores; maximum = sum of frozen maxima (may exceed
//    100, never renormalized). Missing deliveries score 0.
import { LmsError } from './lms-error.js'
import { readRubric, scoreAttempt } from './lms-eval-core.js'

const round2 = (n) => Math.round(n * 100) / 100
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const blank = (value) => value === null || value === undefined || value === ''

export const REASON_MIN = 5
export const COMMENT_MAX = 5000
export const DECISIONS = ['pending', 'advance', 'hold', 'reject']
export const DECISION_LABELS = { pending: 'Sin decisión', advance: 'Avanza', hold: 'En espera', reject: 'No avanza' }

export function normalizeReason(value, { required = false } = {}) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (required && text.length < REASON_MIN) throw new LmsError('Escribe el motivo (al menos 5 caracteres).', 400, 'REASON_REQUIRED')
  return text || null
}

export function normalizeComment(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (text.length > COMMENT_MAX) throw new LmsError('El comentario es demasiado largo.', 400)
  return text || null
}

// Snapshot item of one activity, or null.
export const snapshotItem = (session, lessonId) => (Array.isArray(session?.snapshot?.activities) ? session.snapshot.activities.find((item) => item.lessonId === lessonId) : null) ?? null

// Questions with the points frozen at start (older sessions: the current ones).
export function frozenQuestions(item, questions) {
  const frozen = isObject(item?.questionPoints) ? item.questionPoints : null
  return questions.map((q) => (frozen && Object.prototype.hasOwnProperty.call(frozen, q.id) ? { ...q, points: Number(frozen[q.id]) || 0 } : q))
}

// Quiz attempt score on the frozen basis. manualPoints: { questionId: n }.
export function quizScore(item, questions, attempt, manualPoints = attempt?.manualPoints ?? {}) {
  return scoreAttempt(frozenQuestions(item, questions), attempt?.answers ?? {}, manualPoints, attempt?.optionOrder ?? {})
}

// Grader input for open questions -> { questionId: points } (partial allowed:
// questions not sent keep their stored value). Each value 0..question points.
export function normalizeManualPoints(input, questions, stored = {}) {
  const src = isObject(input) ? input : {}
  const open = new Map(questions.filter((q) => q.kind === 'open').map((q) => [q.id, q]))
  const out = { ...(isObject(stored) ? stored : {}) }
  for (const [id, raw] of Object.entries(src)) {
    const q = open.get(id)
    if (!q) throw new LmsError('Solo se califican a mano las preguntas abiertas.', 400)
    if (blank(raw)) { delete out[id]; continue }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > Number(q.points)) throw new LmsError(`Los puntos deben estar entre 0 y ${q.points}.`, 400, 'POINTS_OUT_OF_RANGE')
    out[id] = round2(n)
  }
  return out
}

// Grader input for a delivery -> { points, rubricScores } on the frozen basis.
// With a rubric, every criterion sent is 0..its points and the total is their
// sum (null while any criterion is unscored); without one, direct points.
export function deliveryScore(body, item, fallbackSettings = {}) {
  const rubric = readRubric(item?.rubric ?? fallbackSettings.rubric)
  const max = Number(item?.maxPoints ?? fallbackSettings.maxPoints ?? 100)
  if (rubric.length) {
    const given = isObject(body?.rubricScores) ? body.rubricScores : {}
    const scores = {}
    for (const criterion of rubric) {
      const raw = given[criterion.id]
      if (blank(raw)) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > criterion.points) throw new LmsError(`«${criterion.label}»: de 0 a ${criterion.points} puntos.`, 400, 'POINTS_OUT_OF_RANGE')
      scores[criterion.id] = round2(n)
    }
    const complete = rubric.every((criterion) => scores[criterion.id] !== undefined)
    return { rubricScores: scores, points: complete ? round2(rubric.reduce((sum, criterion) => sum + scores[criterion.id], 0)) : null, rubric, max }
  }
  if (blank(body?.points)) return { rubricScores: {}, points: null, rubric, max }
  const n = Number(body.points)
  if (!Number.isFinite(n) || n < 0 || n > max) throw new LmsError(`Los puntos deben estar entre 0 y ${max}.`, 400, 'POINTS_OUT_OF_RANGE')
  return { rubricScores: {}, points: round2(n), rubric, max }
}

// Per-activity scores and the session totals. rows: [{ lessonId, kind, score,
// pending }] where score is null while a person still has to grade it.
export function sessionTotals(session, rows) {
  const items = Array.isArray(session?.snapshot?.activities) ? session.snapshot.activities : []
  const byLesson = new Map(rows.map((row) => [row.lessonId, row]))
  const activities = items.map((item) => {
    const row = byLesson.get(item.lessonId)
    return { lessonId: item.lessonId, kind: item.kind, title: item.title, maxPoints: Number(item.maxPoints) || 0, score: row?.score ?? null, pending: row ? row.pending : false, status: row?.status ?? null }
  })
  const pending = activities.filter((item) => item.pending).length
  const scored = round2(activities.reduce((sum, item) => sum + (Number(item.score) || 0), 0))
  return {
    activities,
    maxPoints: round2(activities.reduce((sum, item) => sum + item.maxPoints, 0)),
    // partial while something is pending; final once nothing is.
    scorePoints: scored,
    complete: pending === 0,
    pendingCount: pending,
  }
}

// Score row of a quiz attempt inside a session.
export function attemptRow(item, questions, attempt) {
  const score = quizScore(item, questions, attempt)
  const pendingOpen = Object.values(score.perQuestion).filter((value) => value.awarded === null).length
  const partial = round2(Object.values(score.perQuestion).reduce((sum, value) => sum + (Number(value.awarded) || 0), 0))
  return { lessonId: attempt.lessonId, kind: 'quiz', status: attempt.status, pending: score.needsReview, pendingOpen, score: score.needsReview ? partial : score.scorePoints, final: score.scorePoints, perQuestion: score.perQuestion }
}

// Score row of a delivery inside a session (missing = 0, nothing to grade).
export function submissionRow(submission) {
  if (submission.status === 'missing') return { lessonId: submission.lessonId, kind: 'assignment', status: 'missing', pending: false, score: 0 }
  const points = submission.points === null || submission.points === undefined ? null : Number(submission.points)
  return { lessonId: submission.lessonId, kind: 'assignment', status: submission.status, pending: points === null, score: points }
}

// Session incidents (spec 6.1). Extending is allowed only while the session is
// running and before its deadline plus the write grace: a session that already
// ran out is closed by the next request and is never revived; it takes a new
// attempt instead.
export function extendBlocker(session, minutes, now, graceMs) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return new LmsError('Extiende de 1 a 240 minutos.', 400)
  if (session.status !== 'in_progress') return new LmsError('La sesión ya terminó: no se puede extender. Autoriza un intento adicional si corresponde.', 409, 'SESSION_CLOSED')
  if (!session.expiresAt) return new LmsError('Esta evaluación no tiene límite de tiempo.', 409, 'NO_TIME_LIMIT')
  if (new Date(now).getTime() > new Date(session.expiresAt).getTime() + graceMs) {
    return new LmsError('El tiempo de la sesión ya venció: no se puede extender. Autoriza un intento adicional si corresponde.', 409, 'EXPIRED')
  }
  return null
}

// Voiding keeps every answer and file. A graded session is final: voiding it
// would hide a published result, so it needs a regrade instead.
export function voidBlocker(session) {
  if (session.status === 'voided') return null // idempotent
  if (session.status === 'graded') return new LmsError('La sesión ya está calificada: no se puede anular.', 409, 'ALREADY_GRADED')
  return null
}
