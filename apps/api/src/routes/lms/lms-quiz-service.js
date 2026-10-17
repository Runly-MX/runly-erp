// runly.lms quizzes: question authoring and the learner attempt lifecycle
// (start/resume, autosave, submit, auto-submit on expiry).
import { LmsError } from './lms-core.js'
import {
  attemptsAllowed, drawQuestions, isExpired, normalizeQuestionInput, normalizeQuizSettings, sanitizeAnswers, scoreAttempt,
} from './lms-eval-core.js'
import { loadAttemptQuestions, quizOutcome, serializeAttempt, serializeQuestion } from './lms-eval-shared.js'
import { createLmsSerializers } from './lms-serialize.js'
import { setLessonOutcome, TX_OPTS } from './lms-progress.js'

const QUESTIONS_ORDERED = [{ position: 'asc' }, { createdAt: 'asc' }]
const FULL_ATTEMPT = { enrollment: { include: { learner: true, course: true } }, lesson: true }
const notQuiz = () => new LmsError('La lección no es un examen.', 409, 'NOT_QUIZ')

export function createLmsQuizService({ prisma, learn, notifier, signFile = null }) {
  const ser = createLmsSerializers({ prisma, signFile })

  // ---- authoring ----------------------------------------------------------
  async function quizLesson(companyId, lessonId) {
    const lesson = await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, enabled: true } })
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    if (lesson.kind !== 'quiz') throw notQuiz()
    return lesson
  }

  const questionRows = (lessonId) => prisma.lmsQuizQuestion.findMany({ where: { lessonId, enabled: true }, orderBy: QUESTIONS_ORDERED })

  async function findQuestion(companyId, questionId) {
    const row = await prisma.lmsQuizQuestion.findFirst({ where: { id: questionId, companyId, enabled: true } })
    if (!row) throw new LmsError('La pregunta no existe.', 404)
    return row
  }

  async function listQuestions(companyId, lessonId) {
    const lesson = await quizLesson(companyId, lessonId)
    return (await questionRows(lesson.id)).map(serializeQuestion)
  }

  async function createQuestion(companyId, lessonId, body) {
    const lesson = await quizLesson(companyId, lessonId)
    const data = normalizeQuestionInput(body, { partial: false })
    const max = await prisma.lmsQuizQuestion.aggregate({ where: { lessonId: lesson.id, enabled: true }, _max: { position: true } })
    const row = await prisma.lmsQuizQuestion.create({ data: { ...data, companyId, lessonId: lesson.id, position: (max._max.position ?? 0) + 1 } })
    return serializeQuestion(row)
  }

  async function updateQuestion(companyId, questionId, body) {
    const existing = await findQuestion(companyId, questionId)
    const data = normalizeQuestionInput(body, { partial: true, existing })
    const row = await prisma.lmsQuizQuestion.update({ where: { id: existing.id }, data })
    return serializeQuestion(row)
  }

  // Soft delete: attempts keep pointing at the question they drew.
  async function deleteQuestion(companyId, questionId) {
    const existing = await findQuestion(companyId, questionId)
    await prisma.lmsQuizQuestion.update({ where: { id: existing.id }, data: { enabled: false } })
    return { id: existing.id }
  }

  async function reorderQuestions(companyId, lessonId, body) {
    const lesson = await quizLesson(companyId, lessonId)
    const ids = Array.isArray(body?.questionIds) ? body.questionIds.map(String) : null
    const rows = await questionRows(lesson.id)
    const known = new Set(rows.map((row) => row.id))
    if (!ids || ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
      throw new LmsError('Envía el orden completo de las preguntas del examen.', 400)
    }
    await prisma.$transaction(ids.map((id, index) => prisma.lmsQuizQuestion.update({ where: { id }, data: { position: index + 1 } })))
    return (await questionRows(lesson.id)).map(serializeQuestion)
  }

  // ---- learner ------------------------------------------------------------
  async function learnerQuiz(companyId, profileId, lessonId, { canManage = false, write = false } = {}) {
    const ctx = await learn.lessonContext(companyId, profileId, lessonId, { canManage: write ? false : canManage })
    if (ctx.lesson.kind !== 'quiz') throw notQuiz()
    if (write && ctx.course.status !== 'published') throw new LmsError('El curso no está disponible para presentar exámenes.', 409, 'NOT_PUBLISHED')
    return { ...ctx, settings: normalizeQuizSettings(ctx.lesson.settings) }
  }

  const loadFull = (attemptId) => prisma.lmsQuizAttempt.findUnique({ where: { id: attemptId }, include: FULL_ATTEMPT })
  const attemptsOf = (enrollmentId, lessonId) => prisma.lmsQuizAttempt.findMany({ where: { enrollmentId, lessonId }, orderBy: { number: 'desc' } })
  const progressOf = (enrollmentId, lessonId) => prisma.lmsLessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId, lessonId } } })

  async function learnerAttempt(row) {
    const lesson = row.lesson ?? await prisma.lmsLesson.findUnique({ where: { id: row.lessonId } })
    return serializeAttempt(row, await loadAttemptQuestions(prisma, [row]), lesson.settings)
  }

  async function ownAttempt(companyId, profileId, attemptId) {
    const row = await prisma.lmsQuizAttempt.findFirst({ where: { id: attemptId, companyId }, include: FULL_ATTEMPT })
    if (!row || !profileId || row.enrollment?.learner?.userProfileId !== profileId) throw new LmsError('El intento no existe.', 404)
    return row
  }

  function assertWritable(row) {
    if (row.enrollment.status === 'dropped') throw new LmsError('No estás inscrito en este curso.', 403, 'NOT_ENROLLED')
    if (row.enrollment.course?.status !== 'published') throw new LmsError('El curso no está disponible para presentar exámenes.', 409, 'NOT_PUBLISHED')
  }

  // Scores and closes an in_progress attempt (row includes FULL_ATTEMPT). Idempotent:
  // a concurrent submit finds status != in_progress and leaves the row alone.
  async function close(row) {
    const now = new Date()
    const settings = normalizeQuizSettings(row.lesson.settings)
    const result = await prisma.$transaction(async (tx) => {
      const byId = await loadAttemptQuestions(tx, [row])
      const questions = row.questionIds.map((id) => byId.get(id)).filter(Boolean)
      const score = scoreAttempt(questions, row.answers ?? {}, {})
      const passed = score.needsReview ? null : score.scorePct >= settings.passingScore
      const { count } = await tx.lmsQuizAttempt.updateMany({
        where: { id: row.id, status: 'in_progress' },
        data: {
          answers: row.answers ?? {},
          status: score.needsReview ? 'submitted' : 'graded',
          submittedAt: now,
          autoPoints: score.autoPoints,
          maxPoints: score.maxPoints,
          scorePoints: score.scorePoints,
          scorePct: score.scorePct,
          passed,
          ...(score.needsReview ? {} : { gradedAt: now }),
        },
      })
      if (!count) return null
      const status = await quizOutcome(tx, { enrollmentId: row.enrollmentId, lessonId: row.lessonId, settings, needsReview: score.needsReview, passed })
      await setLessonOutcome(tx, { enrollment: row.enrollment, lessonId: row.lessonId, status, now })
      return { needsReview: score.needsReview }
    }, TX_OPTS)
    if (result?.needsReview) {
      await notifier.received({
        companyId: row.companyId,
        actorId: row.enrollment.learner?.userProfileId ?? null,
        course: row.enrollment.course,
        lesson: row.lesson,
        learnerName: row.enrollment.learner?.displayName ?? 'Un alumno',
        type: 'attempt',
        sourceId: row.id,
      })
    }
    return result
  }

  async function closeIfExpired(attempts) {
    const open = attempts.find((attempt) => attempt.status === 'in_progress')
    if (!open || !isExpired(open)) return false
    await close(await loadFull(open.id))
    return true
  }

  async function resultPayload(attemptId) {
    const row = await loadFull(attemptId)
    const progress = await progressOf(row.enrollmentId, row.lessonId)
    return { ...(await learnerAttempt(row)), lessonStatus: progress?.status ?? 'in_progress', enrollment: ser.serializeEnrollment(row.enrollment) }
  }

  async function getQuizSummary(companyId, profileId, lessonId, { canManage = false } = {}) {
    const { lesson, enrollment, settings } = await learnerQuiz(companyId, profileId, lessonId, { canManage })
    const total = await prisma.lmsQuizQuestion.count({ where: { lessonId: lesson.id, enabled: true } })
    const questionCount = settings.drawCount ? Math.min(settings.drawCount, total) : total
    const finite = (n) => (Number.isFinite(n) ? n : null)
    if (!enrollment) {
      return { settings, questionCount, attemptsUsed: 0, attemptsAllowed: finite(attemptsAllowed(settings, 0)), bestScorePct: null, passed: false, currentAttemptId: null, lastAttempt: null, lessonStatus: 'available' }
    }
    let attempts = await attemptsOf(enrollment.id, lesson.id)
    if (await closeIfExpired(attempts)) attempts = await attemptsOf(enrollment.id, lesson.id)
    const progress = await progressOf(enrollment.id, lesson.id)
    const scores = attempts.map((a) => a.scorePct).filter((n) => typeof n === 'number')
    const last = attempts[0] ?? null
    return {
      settings,
      questionCount,
      attemptsUsed: attempts.length,
      attemptsAllowed: finite(attemptsAllowed(settings, progress?.extraAttempts)),
      bestScorePct: scores.length ? Math.max(...scores) : null,
      passed: attempts.some((a) => a.passed === true),
      currentAttemptId: attempts.find((a) => a.status === 'in_progress')?.id ?? null,
      lastAttempt: last ? { id: last.id, status: last.status, scorePct: last.scorePct, passed: last.passed } : null,
      lessonStatus: progress?.status ?? 'available',
    }
  }

  // Returns { attempt, resumed }; the route answers 200 when resumed, 201 when new.
  async function startAttempt(companyId, profileId, lessonId) {
    const { lesson, enrollment, settings } = await learnerQuiz(companyId, profileId, lessonId, { write: true })
    let attempts = await attemptsOf(enrollment.id, lesson.id)
    const open = attempts.find((a) => a.status === 'in_progress')
    if (open && !isExpired(open)) return { attempt: await learnerAttempt({ ...open, lesson }), resumed: true }
    if (await closeIfExpired(attempts)) attempts = await attemptsOf(enrollment.id, lesson.id)
    if (attempts.some((a) => a.status === 'submitted')) throw new LmsError('Tu intento anterior está pendiente de revisión.', 409, 'PENDING_REVIEW')
    const progress = await progressOf(enrollment.id, lesson.id)
    if (attempts.length >= attemptsAllowed(settings, progress?.extraAttempts)) throw new LmsError('Ya no tienes intentos disponibles para este examen.', 409, 'NO_ATTEMPTS')
    const questions = await questionRows(lesson.id)
    if (!questions.length) throw new LmsError('Este examen todavía no tiene preguntas.', 409, 'NO_QUESTIONS')
    const { questionIds, optionOrder } = drawQuestions(questions, settings)
    const now = new Date()
    try {
      const row = await prisma.lmsQuizAttempt.create({
        data: {
          companyId,
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
          number: (attempts[0]?.number ?? 0) + 1,
          questionIds,
          optionOrder,
          startedAt: now,
          deadlineAt: settings.timeLimitMinutes ? new Date(now.getTime() + settings.timeLimitMinutes * 60_000) : null,
        },
      })
      if (!progress) {
        await prisma.lmsLessonProgress.upsert({
          where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
          create: { companyId, enrollmentId: enrollment.id, lessonId: lesson.id, status: 'in_progress' },
          update: {},
        })
      }
      return { attempt: await learnerAttempt({ ...row, lesson }), resumed: false }
    } catch (error) {
      if (error?.code !== 'P2002') throw error
      // A parallel start created the same number: hand back that attempt.
      const again = await prisma.lmsQuizAttempt.findFirst({ where: { enrollmentId: enrollment.id, lessonId: lesson.id, status: 'in_progress' } })
      if (!again) throw new LmsError('No se pudo iniciar el intento. Intenta de nuevo.', 409, 'CONFLICT')
      return { attempt: await learnerAttempt({ ...again, lesson }), resumed: true }
    }
  }

  async function getAttempt(companyId, profileId, attemptId) {
    const row = await ownAttempt(companyId, profileId, attemptId)
    if (row.status === 'in_progress' && isExpired(row)) {
      await close(row)
      return learnerAttempt(await loadFull(row.id))
    }
    return learnerAttempt(row)
  }

  async function saveAnswers(companyId, profileId, attemptId, body = {}) {
    const row = await ownAttempt(companyId, profileId, attemptId)
    if (row.status !== 'in_progress') throw new LmsError('Este intento ya fue enviado.', 409, 'NOT_IN_PROGRESS')
    assertWritable(row)
    if (isExpired(row)) {
      await close(row)
      throw new LmsError('Se terminó el tiempo del examen. Tu intento se envió con las respuestas guardadas.', 409, 'EXPIRED')
    }
    const answers = { ...(row.answers ?? {}), ...sanitizeAnswers(body?.answers, row.questionIds, row.optionOrder) }
    const savedAt = new Date()
    const { count } = await prisma.lmsQuizAttempt.updateMany({ where: { id: row.id, status: 'in_progress' }, data: { answers } })
    if (!count) throw new LmsError('Este intento ya fue enviado.', 409, 'NOT_IN_PROGRESS')
    return { savedAt: savedAt.toISOString() }
  }

  // Submitting twice returns the same result. Past the deadline + grace, the answers
  // in the body are ignored and the attempt closes with what was saved (expired: true).
  async function submitAttempt(companyId, profileId, attemptId, body = {}) {
    const row = await ownAttempt(companyId, profileId, attemptId)
    if (row.status !== 'in_progress') return resultPayload(row.id)
    assertWritable(row)
    const expired = isExpired(row)
    let answers = row.answers ?? {}
    if (!expired && body?.answers !== undefined && body?.answers !== null) {
      answers = { ...answers, ...sanitizeAnswers(body.answers, row.questionIds, row.optionOrder) }
    }
    await close({ ...row, answers })
    return { ...(await resultPayload(row.id)), ...(expired ? { expired: true } : {}) }
  }

  return {
    listQuestions, createQuestion, updateQuestion, deleteQuestion, reorderQuestions,
    getQuizSummary, startAttempt, getAttempt, saveAnswers, submitAttempt,
  }
}
