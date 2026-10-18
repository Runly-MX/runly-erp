// runly.lms grading: review queue, grading quiz attempts with open answers,
// approving or returning assignment submissions, and extra quiz attempts.
import { LmsError } from './lms-core.js'
import { normalizeLessonSettings, normalizeQuizSettings, scoreAttempt, validateGradeDecision } from './lms-eval-core.js'
import { isUuid, learnerShape, loadAttemptQuestions, quizOutcome, serializeAttempt, serializeSubmissions } from './lms-eval-shared.js'
import { createLmsSerializers } from './lms-serialize.js'
import { learnerKind } from './lms-share-core.js'
import { setLessonOutcome, TX_OPTS } from './lms-progress.js'

const CONTEXT = { enrollment: { include: { learner: true, course: true } }, lesson: true }
const iso = (value) => (value ? new Date(value).toISOString() : null)

function feedbackText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (text.length > 10_000) throw new LmsError('La retroalimentación es demasiado larga.', 400)
  return text || null
}

const contextShape = (row) => ({
  learner: learnerShape(row.enrollment.learner),
  course: { id: row.enrollment.course.id, title: row.enrollment.course.title },
  lesson: { id: row.lesson.id, title: row.lesson.title, kind: row.lesson.kind, body: row.lesson.body, settings: normalizeLessonSettings(row.lesson.kind, row.lesson.settings) },
})

// guestMailer: createLmsGuestGradeMailer (invited guests have no user to notify).
// It runs in the background and can never fail a grade.
export function createLmsReviewService({ prisma, notifier, signFile = null, guestMailer = null }) {
  const ser = createLmsSerializers({ prisma, signFile })

  function mailGuest(row, type, detail) {
    if (!guestMailer || row.enrollment.learner?.userProfileId) return
    try {
      Promise.resolve(guestMailer.graded({ enrollment: row.enrollment, course: row.enrollment.course, lesson: row.lesson, type, detail })).catch(() => null)
    } catch { /* best effort */ }
  }

  async function queue(companyId, query = {}) {
    const courseId = query.courseId ? String(query.courseId) : null
    if (courseId && !isUuid(courseId)) throw new LmsError('Curso inválido.', 400)
    const where = {
      companyId,
      status: 'submitted',
      lesson: { enabled: true, ...(courseId ? { courseId } : {}) },
      enrollment: { status: { not: 'dropped' }, course: { enabled: true } },
    }
    const include = { lesson: { select: { id: true, title: true } }, enrollment: { include: { learner: true, course: { select: { id: true, title: true } } } } }
    const [submissions, attempts] = await Promise.all([
      prisma.lmsSubmission.findMany({ where, include, orderBy: { submittedAt: 'asc' } }),
      prisma.lmsQuizAttempt.findMany({ where, include, orderBy: { submittedAt: 'asc' } }),
    ])
    const item = (type, row) => ({
      type,
      id: row.id,
      courseId: row.enrollment.course.id,
      courseTitle: row.enrollment.course.title,
      lessonId: row.lesson.id,
      lessonTitle: row.lesson.title,
      learner: { id: row.enrollment.learner.id, displayName: row.enrollment.learner.displayName, kind: learnerKind(row.enrollment.learner) },
      submittedAt: iso(row.submittedAt),
      ...(type === 'submission' ? { late: row.late, fileCount: row.fileIds?.length ?? 0 } : {}),
    })
    return [...submissions.map((row) => item('submission', row)), ...attempts.map((row) => item('attempt', row))]
      .sort((a, b) => Date.parse(a.submittedAt ?? 0) - Date.parse(b.submittedAt ?? 0))
  }

  // ---- quiz attempts ------------------------------------------------------
  async function findAttempt(companyId, attemptId) {
    const row = await prisma.lmsQuizAttempt.findFirst({ where: { id: attemptId, companyId }, include: CONTEXT })
    if (!row) throw new LmsError('El intento no existe.', 404)
    return row
  }

  async function reviewAttemptPayload(row) {
    const byId = await loadAttemptQuestions(prisma, [row])
    return { ...serializeAttempt(row, byId, row.lesson.settings, { revealAll: true }), ...contextShape(row) }
  }

  async function getAttempt(companyId, attemptId) {
    return reviewAttemptPayload(await findAttempt(companyId, attemptId))
  }

  async function gradeAttempt(companyId, graderId, attemptId, body = {}) {
    const row = await findAttempt(companyId, attemptId)
    if (row.status === 'in_progress') throw new LmsError('El alumno todavía no envía este intento.', 409, 'NOT_SUBMITTED')
    if (row.status !== 'submitted') throw new LmsError('Este intento ya fue calificado.', 409, 'ALREADY_GRADED')
    const byId = await loadAttemptQuestions(prisma, [row])
    const questions = row.questionIds.map((id) => byId.get(id)).filter(Boolean)
    const raw = body?.points && typeof body.points === 'object' ? body.points : {}
    const manualPoints = {}
    for (const q of questions.filter((item) => item.kind === 'open')) {
      const value = raw[q.id]
      const n = value === null || value === undefined || value === '' ? NaN : Number(value)
      if (!Number.isFinite(n)) throw new LmsError('Califica todas las respuestas abiertas.', 400)
      manualPoints[q.id] = n
    }
    const score = scoreAttempt(questions, row.answers ?? {}, manualPoints, row.optionOrder ?? {})
    const settings = normalizeQuizSettings(row.lesson.settings)
    const passed = score.scorePct >= settings.passingScore
    const feedback = feedbackText(body?.feedback)
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lmsQuizAttempt.updateMany({
        where: { id: row.id, status: 'submitted' },
        data: {
          status: 'graded',
          manualPoints: Object.fromEntries(Object.entries(manualPoints).map(([id]) => [id, score.perQuestion[id].awarded])),
          autoPoints: score.autoPoints,
          maxPoints: score.maxPoints,
          scorePoints: score.scorePoints,
          scorePct: score.scorePct,
          passed,
          gradedById: graderId,
          gradedAt: now,
          feedback,
        },
      })
      if (!count) throw new LmsError('Este intento ya fue calificado.', 409, 'ALREADY_GRADED')
      const status = await quizOutcome(tx, { enrollmentId: row.enrollmentId, lessonId: row.lessonId, settings, needsReview: false, passed })
      await setLessonOutcome(tx, { enrollment: row.enrollment, lessonId: row.lessonId, status, now })
    }, TX_OPTS)
    const detail = `${passed ? 'aprobaste' : 'no aprobaste'} con ${score.scorePct}%.`
    await notifier.graded({
      companyId,
      actorId: graderId,
      recipientId: row.enrollment.learner?.userProfileId,
      course: row.enrollment.course,
      lesson: row.lesson,
      type: 'attempt',
      sourceId: row.id,
      detail,
    })
    mailGuest(row, 'attempt', detail)
    return reviewAttemptPayload(await findAttempt(companyId, row.id))
  }

  // ---- submissions --------------------------------------------------------
  async function findSubmission(companyId, submissionId) {
    const row = await prisma.lmsSubmission.findFirst({ where: { id: submissionId, companyId }, include: CONTEXT })
    if (!row) throw new LmsError('La entrega no existe.', 404)
    return row
  }

  async function getSubmission(companyId, submissionId) {
    const row = await findSubmission(companyId, submissionId)
    const others = await prisma.lmsSubmission.findMany({
      where: { enrollmentId: row.enrollmentId, lessonId: row.lessonId, id: { not: row.id } },
      orderBy: { number: 'desc' },
    })
    const [current, ...history] = await serializeSubmissions([row, ...others], ser)
    return { ...current, history, ...contextShape(row) }
  }

  async function gradeSubmission(companyId, graderId, submissionId, body = {}) {
    const row = await findSubmission(companyId, submissionId)
    if (row.status !== 'submitted') throw new LmsError('Esta entrega ya fue revisada.', 409, 'ALREADY_GRADED')
    const { decision, grade } = validateGradeDecision(body ?? {}, row.lesson.settings)
    const feedback = feedbackText(body?.feedback)
    const now = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.lmsSubmission.updateMany({
        where: { id: row.id, status: 'submitted' },
        data: { status: decision === 'approve' ? 'approved' : 'returned', grade, feedback, gradedById: graderId, gradedAt: now },
      })
      if (!count) throw new LmsError('Esta entrega ya fue revisada.', 409, 'ALREADY_GRADED')
      await setLessonOutcome(tx, { enrollment: row.enrollment, lessonId: row.lessonId, status: decision === 'approve' ? 'completed' : 'in_progress', now })
      return tx.lmsSubmission.findUnique({ where: { id: row.id } })
    }, TX_OPTS)
    const detail = decision === 'approve'
      ? `tu entrega fue aprobada${grade !== null ? ` con ${grade}` : ''}.`
      : 'tu entrega fue devuelta para que la corrijas.'
    await notifier.graded({
      companyId,
      actorId: graderId,
      recipientId: row.enrollment.learner?.userProfileId,
      course: row.enrollment.course,
      lesson: row.lesson,
      type: 'submission',
      sourceId: row.id,
      detail,
    })
    mailGuest(row, 'submission', detail)
    return (await serializeSubmissions([updated], ser))[0]
  }

  // ---- extra attempts -----------------------------------------------------
  async function grantExtraAttempt(companyId, enrollmentId, lessonId) {
    const enrollment = await prisma.lmsEnrollment.findFirst({ where: { id: enrollmentId, companyId } })
    if (!enrollment) throw new LmsError('La inscripción no existe.', 404)
    const lesson = await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, courseId: enrollment.courseId, enabled: true } })
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    if (lesson.kind !== 'quiz') throw new LmsError('La lección no es un examen.', 409, 'NOT_QUIZ')
    const key = { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } }
    const row = await prisma.$transaction(async (tx) => {
      const current = await tx.lmsLessonProgress.findUnique({ where: key })
      if (!current) return tx.lmsLessonProgress.create({ data: { companyId, enrollmentId: enrollment.id, lessonId: lesson.id, status: 'in_progress', extraAttempts: 1 } })
      return tx.lmsLessonProgress.update({
        where: { id: current.id },
        data: { extraAttempts: { increment: 1 }, ...(current.status === 'failed' ? { status: 'in_progress' } : {}) },
      })
    }, TX_OPTS)
    return { extraAttempts: row.extraAttempts, lessonStatus: row.status }
  }

  return { queue, getAttempt, gradeAttempt, getSubmission, gradeSubmission, grantExtraAttempt }
}
