// Shared loaders and serializers for quizzes, assignments and grading.
import {
  attemptOutcome, attemptsAllowed, learnerQuestion, normalizeQuizSettings, revealAllowed, revealedQuestion, scoreAttempt,
} from './lms-eval-core.js'
import { learnerKind } from './lms-share-core.js'

const iso = (value) => (value ? new Date(value).toISOString() : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value) => typeof value === 'string' && UUID.test(value)

export function serializeQuestion(row) {
  return {
    id: row.id,
    lessonId: row.lessonId,
    kind: row.kind,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? row.options : [],
    explanation: row.explanation,
    points: row.points,
    position: row.position,
  }
}

// Every question an attempt drew, including ones disabled later.
export async function loadAttemptQuestions(db, attempts) {
  const ids = [...new Set(attempts.flatMap((attempt) => attempt.questionIds ?? []))]
  if (!ids.length) return new Map()
  const rows = await db.lmsQuizQuestion.findMany({ where: { id: { in: ids } } })
  return new Map(rows.map((row) => [row.id, row]))
}

// revealAll: graders see everything; learners follow showAnswers once submitted.
export function serializeAttempt(row, questionsById, rawSettings, { revealAll = false } = {}) {
  const settings = normalizeQuizSettings(rawSettings)
  const questions = (row.questionIds ?? []).map((id) => questionsById.get(id)).filter(Boolean)
  const done = row.status !== 'in_progress'
  const reveal = revealAll || (done && revealAllowed(settings.showAnswers, row.passed))
  const order = row.optionOrder ?? {}
  const score = reveal ? scoreAttempt(questions, row.answers ?? {}, row.manualPoints ?? {}) : null
  const payload = {
    id: row.id,
    lessonId: row.lessonId,
    number: row.number,
    status: row.status,
    startedAt: iso(row.startedAt),
    deadlineAt: iso(row.deadlineAt),
    submittedAt: iso(row.submittedAt),
    answers: row.answers ?? {},
    scorePct: row.scorePct,
    scorePoints: row.scorePoints,
    maxPoints: row.maxPoints,
    passed: row.passed,
    feedback: row.feedback,
    questions: questions.map((q) => (reveal ? revealedQuestion(q, order[q.id], score.perQuestion[q.id]) : learnerQuestion(q, order[q.id]))),
  }
  if (revealAll) Object.assign(payload, { autoPoints: row.autoPoints, manualPoints: row.manualPoints ?? {}, gradedAt: iso(row.gradedAt) })
  return payload
}

// ser: createLmsSerializers (fileNames + sign).
export async function serializeSubmissions(rows, ser) {
  const names = await ser.fileNames(rows.flatMap((row) => row.fileIds ?? []))
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    lessonId: row.lessonId,
    number: row.number,
    status: row.status,
    text: row.text,
    files: await Promise.all((row.fileIds ?? []).map(async (id) => ({ id, name: names.get(id) ?? null, url: await ser.sign(id, 'full') }))),
    submittedAt: iso(row.submittedAt),
    late: row.late,
    grade: row.grade,
    feedback: row.feedback,
    gradedAt: iso(row.gradedAt),
  })))
}

export const learnerShape = (learner) => (learner ? { id: learner.id, displayName: learner.displayName, userProfileId: learner.userProfileId, kind: learnerKind(learner) } : null)

// Lesson status a finished attempt leaves, counting every attempt and extra grants.
export async function quizOutcome(db, { enrollmentId, lessonId, settings, needsReview, passed }) {
  const [attemptsUsed, progress] = await Promise.all([
    db.lmsQuizAttempt.count({ where: { enrollmentId, lessonId } }),
    db.lmsLessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId, lessonId } } }),
  ])
  return attemptOutcome({ needsReview, passed, attemptsUsed, allowed: attemptsAllowed(settings, progress?.extraAttempts) })
}
