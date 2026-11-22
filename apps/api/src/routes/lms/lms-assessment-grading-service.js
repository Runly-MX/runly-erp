// Candidate record and consolidated grading of an evaluation session (spec
// 2026-11-21 section 9, phase 5). Reads the existing quiz attempts and
// deliveries (nothing is copied), grades on the basis frozen at start, writes
// every change to lms_grade_event and recomputes the session total in the same
// transaction. Concurrent graders: each save sends the updatedAt it edited; a
// stale one gets 409 CONFLICT.
import { LmsError } from './lms-error.js'
import { readRubric } from './lms-eval-core.js'
import { isUuid, serializeAttempt } from './lms-eval-shared.js'
import { TX_OPTS } from './lms-progress.js'
import { normalizeAssessmentShareSettings } from './lms-assessment-share-core.js'
import { readGuestProfile } from './lms-intake-core.js'
import { learnerKind } from './lms-share-core.js'
import { sessionFolio } from './lms-session-service.js'
import { applySessionTotals, loadSessionScores } from './lms-session-scores.js'
import {
  DECISION_LABELS, deliveryScore, frozenQuestions, normalizeComment, normalizeManualPoints, normalizeReason, quizScore, snapshotItem,
} from './lms-grading-core.js'

const iso = (value) => (value ? new Date(value).toISOString() : null)
const GRADABLE = ['submitted', 'expired', 'graded']
const sessionGone = () => new LmsError('La sesión no existe.', 404)
const conflict = () => new LmsError('Otra persona guardó cambios en esta calificación. Recarga para ver la versión actual.', 409, 'CONFLICT')
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// A timestamptz(6) can hold microseconds a JS Date drops: match the millisecond.
export function versionWindow(expected) {
  const t = Date.parse(String(expected ?? ''))
  if (!Number.isFinite(t)) throw new LmsError('Falta la versión que estás editando. Recarga el expediente.', 400, 'VERSION_REQUIRED')
  return { gte: new Date(t), lt: new Date(t + 1) }
}

export async function writeGradeEvent(db, data) {
  await db.lmsGradeEvent.create({ data })
}

export function sessionShape(session, now = new Date()) {
  const used = session.startedAt && session.submittedAt ? Math.max(0, Math.round((Date.parse(session.submittedAt) - Date.parse(session.startedAt)) / 60_000)) : null
  return {
    id: session.id, number: session.number, status: session.status, closedReason: session.closedReason,
    startedAt: iso(session.startedAt), expiresAt: iso(session.expiresAt), submittedAt: iso(session.submittedAt), gradedAt: iso(session.gradedAt),
    timeLimitMinutes: session.timeLimitMinutes, extendedMinutes: session.extendedMinutes, usedMinutes: used,
    folio: session.submittedAt ? sessionFolio(session) : null,
    scorePoints: session.scorePoints, maxPoints: session.maxPoints,
    decision: session.decision ?? 'pending', decisionLabel: DECISION_LABELS[session.decision ?? 'pending'], decisionNote: session.decisionNote, decidedAt: iso(session.decidedAt),
    updatedAt: iso(session.updatedAt), running: session.status === 'in_progress' && (!session.expiresAt || new Date(session.expiresAt) > now),
  }
}

// access: createLmsAssessmentAccess. sessions: the internal session service
// (closes stale sessions lazily and lists delivered file versions).
export function createLmsAssessmentGradingService({ prisma, access, sessions, clock = () => new Date() }) {
  async function findSession(companyId, sessionId) {
    const row = isUuid(sessionId) ? await prisma.lmsAssessmentSession.findFirst({ where: { id: sessionId, companyId } }) : null
    if (!row) throw sessionGone()
    return row
  }

  // A running session past its deadline is closed first (same rule as the participant side).
  async function settled(companyId, sessionId) {
    const row = await findSession(companyId, sessionId)
    if (row.status === 'in_progress' && row.expiresAt && Date.parse(row.expiresAt) + 30_000 < clock().getTime()) {
      await sessions.closeSession(row.id, 'timeout')
      return findSession(companyId, sessionId)
    }
    return row
  }

  async function names(ids) {
    const list = [...new Set(ids.filter(Boolean))]
    if (!list.length) return new Map()
    const rows = await prisma.userProfile.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } })
    return new Map(rows.map((row) => [row.id, row.displayName]))
  }

  function participantShape(enrollment, assessment) {
    const learner = enrollment.learner
    const fields = normalizeAssessmentShareSettings(assessment.shareSettings).intakeFields
    const profile = readGuestProfile(learner.guestProfile)
    const labels = new Map(fields.map((field) => [field.key, field.label]))
    return {
      name: learner.displayName, email: learner.email, kind: learnerKind(learner),
      answers: Object.entries(profile).map(([key, value]) => ({ key, label: labels.get(key) ?? key, value })),
      consent: enrollment.consent ? { version: enrollment.consent.version, acceptedAt: enrollment.consent.acceptedAt } : null,
      registeredAt: iso(enrollment.createdAt),
    }
  }

  async function history(sessionId) {
    const rows = await prisma.lmsGradeEvent.findMany({ where: { sessionId }, orderBy: { createdAt: 'desc' }, take: 300 })
    const who = await names(rows.map((row) => row.actorId))
    return rows.map((row) => ({
      id: row.id, action: row.action, sourceType: row.sourceType, sourceId: row.sourceId, before: row.before, after: row.after, reason: row.reason,
      actorName: row.actorId ? who.get(row.actorId) ?? 'Usuario' : 'Sistema', createdAt: iso(row.createdAt),
    }))
  }

  // ---- the record -------------------------------------------------------------------
  async function record(companyId, user, sessionId) {
    const session = await settled(companyId, sessionId)
    const { assessment, role } = await access.require(companyId, user, session.courseId, 'read')
    const enrollment = await prisma.lmsEnrollment.findUnique({ where: { id: session.enrollmentId }, include: { learner: true } })
    const scores = await loadSessionScores(prisma, session)
    const items = Array.isArray(session.snapshot?.activities) ? session.snapshot.activities : []
    const lessons = new Map((await prisma.lmsLesson.findMany({ where: { id: { in: items.map((item) => item.lessonId) } } })).map((row) => [row.id, row]))
    const files = await sessions.reviewFiles(companyId, session.id)
    const graders = await names([...scores.attempts.map((row) => row.gradedById), ...scores.submissions.map((row) => row.gradedById)])
    const activities = items.map((item) => {
      const lesson = lessons.get(item.lessonId)
      const total = scores.totals.activities.find((row) => row.lessonId === item.lessonId)
      const base = { lessonId: item.lessonId, kind: item.kind, title: item.title, body: lesson?.body ?? null, maxPoints: Number(item.maxPoints) || 0, score: total?.score ?? null, pending: total?.pending ?? false }
      if (item.kind === 'quiz') {
        const attempt = scores.attempts.find((row) => row.lessonId === item.lessonId)
        if (!attempt) return { ...base, attempt: null }
        const questions = (attempt.questionIds ?? []).map((id) => scores.questionsById.get(id)).filter(Boolean)
        const frozen = new Map(frozenQuestions(item, questions).map((q) => [q.id, q]))
        return {
          ...base,
          attempt: {
            ...serializeAttempt(attempt, frozen, lesson?.settings, { revealAll: true }),
            questionFeedback: attempt.questionFeedback ?? {}, updatedAt: iso(attempt.updatedAt), gradedByName: graders.get(attempt.gradedById) ?? null,
          },
        }
      }
      const sub = scores.submissions.find((row) => row.lessonId === item.lessonId)
      const delivery = files.deliveries.find((row) => row.activityId === item.lessonId)
      return {
        ...base,
        rubric: readRubric(item.rubric),
        submission: sub ? {
          id: sub.id, status: sub.status, text: sub.text, points: sub.points, rubricScores: sub.rubricScores ?? {}, feedback: sub.feedback,
          gradedAt: iso(sub.gradedAt), gradedByName: graders.get(sub.gradedById) ?? null, updatedAt: iso(sub.updatedAt),
          versions: delivery?.versions ?? [],
        } : null,
      }
    })
    const has = (key) => user.isAdmin || user.permissions.has(key)
    return {
      assessment: { id: assessment.id, title: assessment.title },
      session: sessionShape(session, clock()),
      participant: participantShape(enrollment, assessment),
      enrollment: { id: enrollment.id, extraSessions: enrollment.extraSessions },
      activities,
      totals: { scorePoints: scores.totals.scorePoints, maxPoints: scores.totals.maxPoints, complete: scores.totals.complete, pendingCount: scores.totals.pendingCount },
      history: await history(session.id),
      permissions: {
        role,
        canGrade: role !== 'reader' && GRADABLE.includes(session.status),
        canDecide: has('lms.assessment.decide') && session.status !== 'voided',
        canManageSession: has('lms.enrollment.manage') || role === 'manager',
      },
    }
  }

  // Common guard for grading: who, which session state.
  async function gradable(companyId, user, sessionId) {
    const session = await settled(companyId, sessionId)
    const { assessment } = await access.require(companyId, user, session.courseId, 'grade')
    if (session.status === 'in_progress') throw new LmsError('La sesión sigue en curso: se califica cuando termina.', 409, 'SESSION_RUNNING')
    if (session.status === 'voided') throw new LmsError('La sesión fue anulada: no se califica.', 409, 'SESSION_VOIDED')
    return { session, assessment }
  }

  // ---- quiz: points per open question (partial saves allowed), comments ----------------
  async function gradeQuiz(companyId, user, sessionId, attemptId, body = {}) {
    const { session } = await gradable(companyId, user, sessionId)
    const attempt = isUuid(attemptId) ? await prisma.lmsQuizAttempt.findFirst({ where: { id: attemptId, sessionId: session.id } }) : null
    if (!attempt) throw new LmsError('El cuestionario no existe en esta sesión.', 404)
    const window = versionWindow(body.expectedUpdatedAt)
    const item = snapshotItem(session, attempt.lessonId)
    const all = await prisma.lmsQuizQuestion.findMany({ where: { id: { in: attempt.questionIds ?? [] } } })
    const frozen = frozenQuestions(item, all)
    const manualPoints = normalizeManualPoints(body.points, frozen, attempt.manualPoints)
    const comments = body.comments && typeof body.comments === 'object' ? body.comments : {}
    const questionFeedback = { ...(attempt.questionFeedback ?? {}) }
    for (const [id, text] of Object.entries(comments)) {
      if (!frozen.some((q) => q.id === id)) throw new LmsError('La pregunta no está en este cuestionario.', 400)
      const clean = normalizeComment(text)
      if (clean) questionFeedback[id] = clean
      else delete questionFeedback[id]
    }
    const feedback = body.feedback === undefined ? attempt.feedback : normalizeComment(body.feedback)
    const score = quizScore(item, all, attempt, manualPoints)
    const wasFinal = attempt.status === 'graded'
    const pointsChanged = !same(attempt.manualPoints ?? {}, manualPoints)
    if ((wasFinal || session.status === 'graded') && score.needsReview) throw new LmsError('Esta calificación ya era final: todas las respuestas abiertas deben conservar sus puntos.', 409, 'INCOMPLETE_REGRADE')
    const regrade = wasFinal && pointsChanged
    const reason = normalizeReason(body.reason, { required: regrade })
    if (!pointsChanged && same(attempt.questionFeedback ?? {}, questionFeedback) && same(attempt.feedback, feedback)) return record(companyId, user, session.id)
    const now = clock()
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lmsQuizAttempt.updateMany({
        where: { id: attempt.id, updatedAt: window },
        data: {
          manualPoints, questionFeedback, feedback, autoPoints: score.autoPoints, maxPoints: score.maxPoints, scorePoints: score.scorePoints, scorePct: score.scorePct,
          status: score.needsReview ? 'submitted' : 'graded', ...(score.needsReview ? {} : { gradedById: user.profileId, gradedAt: now }),
        },
      })
      if (!count) throw conflict()
      await writeGradeEvent(tx, {
        companyId, courseId: session.courseId, sessionId: session.id, enrollmentId: session.enrollmentId, sourceType: 'attempt', sourceId: attempt.id, actorId: user.profileId,
        action: regrade ? 'regrade' : pointsChanged ? (score.needsReview ? 'grade_partial' : 'grade') : 'comment',
        before: { manualPoints: attempt.manualPoints ?? {}, scorePoints: attempt.scorePoints, questionFeedback: attempt.questionFeedback ?? {}, feedback: attempt.feedback },
        after: { manualPoints, scorePoints: score.scorePoints, questionFeedback, feedback },
        reason,
      })
      await applySessionTotals(tx, await tx.lmsAssessmentSession.findUnique({ where: { id: session.id } }), now)
    }, TX_OPTS)
    return record(companyId, user, session.id)
  }

  // ---- delivery: direct points or rubric, feedback -------------------------------------
  async function gradeDelivery(companyId, user, sessionId, submissionId, body = {}) {
    const { session } = await gradable(companyId, user, sessionId)
    const sub = isUuid(submissionId) ? await prisma.lmsSubmission.findFirst({ where: { id: submissionId, sessionId: session.id } }) : null
    if (!sub) throw new LmsError('La entrega no existe en esta sesión.', 404)
    if (sub.status === 'missing') throw new LmsError('No hubo entrega: cuenta 0 puntos.', 409, 'MISSING')
    const window = versionWindow(body.expectedUpdatedAt)
    const item = snapshotItem(session, sub.lessonId)
    // The frozen snapshot decides: sessions started before rubrics existed grade with direct points.
    const { points, rubricScores } = deliveryScore(body, item)
    const feedback = body.feedback === undefined ? sub.feedback : normalizeComment(body.feedback)
    const wasFinal = sub.points !== null && sub.points !== undefined
    const pointsChanged = !same(sub.points, points) || !same(sub.rubricScores ?? {}, rubricScores)
    if ((wasFinal || session.status === 'graded') && points === null) throw new LmsError('Esta calificación ya era final: no puede quedar sin puntos.', 409, 'INCOMPLETE_REGRADE')
    const regrade = wasFinal && pointsChanged
    const reason = normalizeReason(body.reason, { required: regrade })
    if (!pointsChanged && same(sub.feedback, feedback)) return record(companyId, user, session.id)
    const now = clock()
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lmsSubmission.updateMany({
        where: { id: sub.id, updatedAt: window },
        data: { points, rubricScores, feedback, ...(points === null ? {} : { gradedById: user.profileId, gradedAt: now }) },
      })
      if (!count) throw conflict()
      await writeGradeEvent(tx, {
        companyId, courseId: session.courseId, sessionId: session.id, enrollmentId: session.enrollmentId, sourceType: 'submission', sourceId: sub.id, actorId: user.profileId,
        action: regrade ? 'regrade' : pointsChanged ? (points === null ? 'grade_partial' : 'grade') : 'comment',
        before: { points: sub.points, rubricScores: sub.rubricScores ?? {}, feedback: sub.feedback },
        after: { points, rubricScores, feedback },
        reason,
      })
      await applySessionTotals(tx, await tx.lmsAssessmentSession.findUnique({ where: { id: session.id } }), now)
    }, TX_OPTS)
    return record(companyId, user, session.id)
  }

  return { record, gradeQuiz, gradeDelivery, findSession, settled, history }
}
