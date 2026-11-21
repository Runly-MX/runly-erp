// runly.lms evaluation sessions (spec 2026-11-21 section 6): one attempt at an
// evaluation with a single server clock shared by every activity. Quiz answers
// go through the quiz service (its sanitizing, expiry and scoring); deliveries
// are lms_submission drafts owned by the session. The server decides expiry.
import { ASSESSMENT_ONLY, LmsError } from './lms-core.js'
import { drawQuestions, normalizeAssignmentSettings, normalizeQuizSettings } from './lms-eval-core.js'
import { activityMaxPoints, readAssessmentSettings } from './lms-assessment-core.js'
import {
  SESSION_GRACE_MS, assertSessionWritable, canConfirmUpload, canPresignUpload, closedStatus, draftOutcome, expiresAtFor,
  gradingState, isSessionExpired, normalizeDraftInput, remainingMs, sessionsAllowed, startBlocker,
} from './lms-session-core.js'
import { isUuid, serializeSubmissions } from './lms-eval-shared.js'
import { createLmsQuizService } from './lms-quiz-service.js'
import { PROFILE_OWNER, assertSubmissionFiles } from './lms-assignment-service.js'
import { SUBMISSION_UPLOAD } from './lms-media.js'
import { createLmsSerializers } from './lms-serialize.js'
import { TX_OPTS } from './lms-progress.js'
import { createLmsNotifier } from './lms-notify.js'

const QUESTIONS_ORDERED = [{ position: 'asc' }, { createdAt: 'asc' }]
const ACTIVITY_ORDER = [{ position: 'asc' }, { createdAt: 'asc' }]
const OPEN_ENROLLMENT = ['active', 'completed']
const iso = (value) => (value ? new Date(value).toISOString() : null)
const gone = () => new LmsError('La evaluación no existe.', 404)
const sessionGone = () => new LmsError('La sesión no existe.', 404)

// Who takes the evaluation. Internal users: their learner and enrollment by
// profile id. Share-link guests (phase 4) plug in their own resolver and owner.
export const PROFILE_PARTICIPANTS = {
  owner: PROFILE_OWNER,
  async resolve(prisma, companyId, profileId, assessmentId) {
    if (!profileId) return null
    const learner = await prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId: profileId } } })
    if (!learner?.enabled) return null
    const enrollment = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: assessmentId, learnerId: learner.id } }, include: { learner: true } })
    return enrollment ? { learner, enrollment, actor: profileId } : null
  },
}

function sessionSummary(row, now) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    startedAt: iso(row.startedAt),
    expiresAt: iso(row.expiresAt),
    submittedAt: iso(row.submittedAt),
    closedReason: row.closedReason,
    timeLimitMinutes: row.timeLimitMinutes,
    remainingMs: row.status === 'in_progress' ? remainingMs(row, now) : null,
  }
}

// What a participant sees of an activity's settings.
function publicSettings(lesson) {
  if (lesson.kind === 'quiz') return { layout: normalizeQuizSettings(lesson.settings).layout }
  const s = normalizeAssignmentSettings(lesson.settings)
  return { allowText: s.allowText, allowFiles: s.allowFiles, maxFiles: s.maxFiles }
}

const answered = (value) => value !== null && value !== undefined && !['""', '{}', '[]', 'null'].includes(JSON.stringify(value))

// participants: PROFILE_PARTICIPANTS or a guest resolver. clock: injectable for tests.
export function createLmsSessionService({ prisma, signFile = null, media = null, notifier: givenNotifier = null, participants = PROFILE_PARTICIPANTS, quiz = null, clock = () => new Date() }) {
  const ser = createLmsSerializers({ prisma, signFile })
  const owner = participants.owner
  // Without a notification service the notifier is a no-op (tests, scripts).
  const notifier = givenNotifier ?? createLmsNotifier()
  // Attempts inside a session belong to that session; lessonContext is never
  // used here (attempts are created by start, not by the quiz service).
  const quizSvc = quiz ?? createLmsQuizService({
    prisma,
    signFile,
    notifier,
    learn: { lessonContext: () => { throw new LmsError('La actividad se abre desde su evaluación.', 404) } },
    ownsAttempt: (row, ctx) => Boolean(ctx?.sessionId) && row.sessionId === ctx.sessionId && row.enrollmentId === ctx.enrollmentId,
  })

  // Drafts are invisible to participants and graders until published.
  async function findAssessment(companyId, id, { includeDraft = false } = {}) {
    if (!isUuid(id)) throw gone()
    const row = await prisma.lmsCourse.findFirst({ where: { id, companyId, enabled: true, ...ASSESSMENT_ONLY } })
    if (!row || (!includeDraft && row.status === 'draft')) throw gone()
    return { ...row, settings: readAssessmentSettings(row.settings) }
  }

  async function participantFor(companyId, actor, assessmentId) {
    const p = await participants.resolve(prisma, companyId, actor, assessmentId)
    if (!p || !OPEN_ENROLLMENT.includes(p.enrollment.status)) throw new LmsError('No estás registrado en esta evaluación.', 403, 'NOT_ENROLLED')
    return p
  }

  const activityRows = (courseId) => prisma.lmsLesson.findMany({ where: { courseId, enabled: true, sectionId: null }, orderBy: ACTIVITY_ORDER })
  const sessionsOf = (enrollmentId) => prisma.lmsAssessmentSession.findMany({ where: { enrollmentId }, orderBy: { number: 'desc' } })
  const reload = (id) => prisma.lmsAssessmentSession.findUnique({ where: { id } })

  // Lazy close: an open session past its deadline closes on any request.
  async function settle(session) {
    if (session?.status === 'in_progress' && isSessionExpired(session, clock())) {
      await closeSession(session.id, 'timeout')
      return reload(session.id)
    }
    return session
  }

  // The caller's session (404 for anybody else's, company and enrollment checked).
  async function ownSession(companyId, actor, sessionId) {
    const session = isUuid(sessionId) ? await prisma.lmsAssessmentSession.findFirst({ where: { id: sessionId, companyId } }) : null
    if (!session) throw sessionGone()
    const assessment = await findAssessment(companyId, session.courseId, { includeDraft: true })
    const p = await participants.resolve(prisma, companyId, actor, assessment.id)
    if (!p || p.enrollment.id !== session.enrollmentId) throw sessionGone()
    return { session: await settle(session), assessment, p, ctx: { sessionId: session.id, enrollmentId: session.enrollmentId } }
  }

  // Writes need an open session; a session that ran out answers EXPIRED.
  function writable(session) {
    if (session.status !== 'in_progress' && session.closedReason === 'timeout') {
      throw new LmsError('Se terminó el tiempo de la evaluación. Se entregó con lo que tenías guardado.', 409, 'EXPIRED')
    }
    assertSessionWritable(session, clock())
  }

  async function sessionPayload(session, assessment) {
    const now = clock()
    const snapshot = Array.isArray(session.snapshot?.activities) ? session.snapshot.activities : []
    const ids = snapshot.map((item) => item.lessonId)
    const [lessons, attempts, submissions] = await Promise.all([
      prisma.lmsLesson.findMany({ where: { id: { in: ids } } }),
      prisma.lmsQuizAttempt.findMany({ where: { sessionId: session.id } }),
      prisma.lmsSubmission.findMany({ where: { sessionId: session.id } }),
    ])
    const lessonById = new Map(lessons.map((row) => [row.id, row]))
    const subById = new Map((await serializeSubmissions(submissions, ser)).map((row) => [row.lessonId, row]))
    const showResult = assessment.settings.showResultsToCandidate && session.status === 'graded'
    return {
      serverNow: now.toISOString(),
      assessment: { id: assessment.id, title: assessment.title, description: assessment.description },
      session: { ...sessionSummary(session, now), maxPoints: session.maxPoints, ...(showResult ? { scorePoints: session.scorePoints } : {}) },
      activities: snapshot.map((item) => {
        const lesson = lessonById.get(item.lessonId)
        const attempt = attempts.find((row) => row.lessonId === item.lessonId) ?? null
        return {
          id: item.lessonId,
          kind: item.kind,
          title: lesson?.title ?? item.title,
          body: lesson?.body ?? null,
          settings: lesson ? publicSettings(lesson) : {},
          maxPoints: item.maxPoints,
          attempt: attempt ? {
            id: attempt.id,
            status: attempt.status,
            questionCount: attempt.questionIds?.length ?? 0,
            answeredCount: Object.values(attempt.answers ?? {}).filter(answered).length,
          } : null,
          submission: subById.get(item.lessonId) ?? null,
        }
      }),
    }
  }

  // ---- participant ----------------------------------------------------------
  async function overview(companyId, actor, assessmentId) {
    const assessment = await findAssessment(companyId, assessmentId)
    const p = await participantFor(companyId, actor, assessment.id)
    let sessions = await sessionsOf(p.enrollment.id)
    const open = sessions.find((row) => row.status === 'in_progress')
    if (open && (await settle(open)).status !== 'in_progress') sessions = await sessionsOf(p.enrollment.id)
    const lessons = await activityRows(assessment.id)
    const quizIds = lessons.filter((row) => row.kind === 'quiz').map((row) => row.id)
    const stats = quizIds.length
      ? new Map((await prisma.lmsQuizQuestion.groupBy({ by: ['lessonId'], where: { lessonId: { in: quizIds }, enabled: true }, _count: { _all: true }, _sum: { points: true } }))
        .map((row) => [row.lessonId, { questionCount: row._count._all, questionPoints: row._sum.points ?? 0 }]))
      : new Map()
    const now = clock()
    const current = sessions.find((row) => row.status === 'in_progress') ?? null
    const blocker = current ? null : startBlocker({ assessment, enrollment: p.enrollment, sessions, now })
    return {
      serverNow: now.toISOString(),
      assessment: {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        status: assessment.status,
        timeLimitMinutes: assessment.settings.timeLimitMinutes,
        opensAt: assessment.settings.opensAt,
        closesAt: assessment.settings.closesAt,
      },
      activities: lessons.map((row) => ({ id: row.id, kind: row.kind, title: row.title, maxPoints: activityMaxPoints(row, stats.get(row.id)) })),
      sessions: sessions.map((row) => sessionSummary(row, now)),
      sessionsAllowed: sessionsAllowed(assessment.settings, p.enrollment),
      openSessionId: current?.id ?? null,
      canStart: !current && !blocker,
      blocker: blocker ? { code: blocker.code, message: blocker.message } : null,
    }
  }

  // Starting twice (double click, two tabs) returns the same open session:
  // the partial unique index lets only one in_progress row exist per enrollment.
  async function start(companyId, actor, assessmentId) {
    const assessment = await findAssessment(companyId, assessmentId)
    const p = await participantFor(companyId, actor, assessment.id)
    const resume = async () => {
      const open = await prisma.lmsAssessmentSession.findFirst({ where: { enrollmentId: p.enrollment.id, status: 'in_progress' } })
      const settled = open ? await settle(open) : null
      return settled?.status === 'in_progress' ? { session: await sessionPayload(settled, assessment), resumed: true } : null
    }
    const resumed = await resume()
    if (resumed) return resumed
    const sessions = await sessionsOf(p.enrollment.id)
    const now = clock()
    const blocker = startBlocker({ assessment, enrollment: p.enrollment, sessions, now })
    if (blocker) throw new LmsError(blocker.message, blocker.status, blocker.code)
    const lessons = await activityRows(assessment.id)
    if (!lessons.length) throw new LmsError('La evaluación no tiene actividades.', 409, 'EMPTY')
    const quizIds = lessons.filter((row) => row.kind === 'quiz').map((row) => row.id)
    const questions = quizIds.length ? await prisma.lmsQuizQuestion.findMany({ where: { lessonId: { in: quizIds }, enabled: true }, orderBy: QUESTIONS_ORDERED }) : []
    const expiresAt = expiresAtFor(now, assessment.settings.timeLimitMinutes)
    // Draws happen once, at start; their points freeze the activity maximum.
    const plan = lessons.map((lesson) => {
      if (lesson.kind !== 'quiz') return { lesson, maxPoints: normalizeAssignmentSettings(lesson.settings).maxPoints }
      const pool = questions.filter((row) => row.lessonId === lesson.id)
      if (!pool.length) throw new LmsError(`«${lesson.title}» todavía no tiene preguntas.`, 409, 'NO_QUESTIONS')
      const drawn = drawQuestions(pool, lesson.settings)
      const points = new Map(pool.map((row) => [row.id, row.points]))
      return { lesson, drawn, maxPoints: drawn.questionIds.reduce((sum, id) => sum + (points.get(id) ?? 0), 0) }
    })
    const snapshot = {
      timeLimitMinutes: assessment.settings.timeLimitMinutes,
      activities: plan.map(({ lesson, maxPoints }) => ({ lessonId: lesson.id, kind: lesson.kind, title: lesson.title, maxPoints })),
    }
    try {
      const session = await prisma.$transaction(async (tx) => {
        const created = await tx.lmsAssessmentSession.create({
          data: {
            companyId, courseId: assessment.id, enrollmentId: p.enrollment.id, number: (sessions[0]?.number ?? 0) + 1,
            startedAt: now, expiresAt, timeLimitMinutes: assessment.settings.timeLimitMinutes, snapshot,
            maxPoints: snapshot.activities.reduce((sum, item) => sum + item.maxPoints, 0),
          },
        })
        for (const item of plan) {
          const where = { enrollmentId: p.enrollment.id, lessonId: item.lesson.id }
          if (item.drawn) {
            const last = await tx.lmsQuizAttempt.aggregate({ where, _max: { number: true } })
            await tx.lmsQuizAttempt.create({
              data: {
                companyId, ...where, number: (last._max.number ?? 0) + 1, questionIds: item.drawn.questionIds, optionOrder: item.drawn.optionOrder,
                startedAt: now, deadlineAt: expiresAt, sessionId: created.id,
              },
            })
          } else {
            const last = await tx.lmsSubmission.aggregate({ where, _max: { number: true } })
            await tx.lmsSubmission.create({ data: { companyId, ...where, number: (last._max.number ?? 0) + 1, status: 'draft', fileIds: [], submittedAt: now, sessionId: created.id } })
          }
        }
        if (!p.enrollment.startedAt) await tx.lmsEnrollment.update({ where: { id: p.enrollment.id }, data: { startedAt: now } })
        return created
      }, TX_OPTS)
      return { session: await sessionPayload(session, assessment), resumed: false }
    } catch (error) {
      if (error?.code !== 'P2002') throw error
      // A parallel start won: hand back its session.
      const again = await resume()
      if (!again) throw new LmsError('No se pudo iniciar la evaluación. Intenta de nuevo.', 409, 'CONFLICT')
      return again
    }
  }

  async function getSession(companyId, actor, sessionId) {
    const { session, assessment } = await ownSession(companyId, actor, sessionId)
    return sessionPayload(session, assessment)
  }

  async function getAttempt(companyId, actor, sessionId, attemptId) {
    const { ctx } = await ownSession(companyId, actor, sessionId)
    return { ...(await quizSvc.getAttempt(companyId, ctx, attemptId)), serverNow: clock().toISOString() }
  }

  async function saveAnswers(companyId, actor, sessionId, attemptId, body = {}) {
    const { session, ctx } = await ownSession(companyId, actor, sessionId)
    writable(session)
    const result = await quizSvc.saveAnswers(companyId, ctx, attemptId, body)
    return { ...result, serverNow: clock().toISOString() }
  }

  async function saveDraft(companyId, actor, sessionId, activityId, body = {}) {
    const { session, p } = await ownSession(companyId, actor, sessionId)
    writable(session)
    const draft = isUuid(activityId) ? await prisma.lmsSubmission.findFirst({ where: { sessionId: session.id, lessonId: activityId } }) : null
    if (!draft) throw new LmsError('La actividad no existe.', 404)
    if (draft.status !== 'draft') throw new LmsError('La evaluación ya fue entregada.', 409, 'SESSION_CLOSED')
    const lesson = await prisma.lmsLesson.findUnique({ where: { id: activityId } })
    const input = normalizeDraftInput(body ?? {}, normalizeAssignmentSettings(lesson?.settings), draft)
    await assertSubmissionFiles(prisma, owner, companyId, p.actor, input.fileIds)
    const { count } = await prisma.lmsSubmission.updateMany({ where: { id: draft.id, status: 'draft' }, data: input })
    if (!count) throw new LmsError('La evaluación ya fue entregada.', 409, 'SESSION_CLOSED')
    const [row] = await serializeSubmissions([await prisma.lmsSubmission.findUnique({ where: { id: draft.id } })], ser)
    return { submission: row, savedAt: clock().toISOString(), serverNow: clock().toISOString() }
  }

  async function presignUpload(companyId, actor, sessionId, body = {}) {
    const { session, p } = await ownSession(companyId, actor, sessionId)
    if (!canPresignUpload(session, clock())) writable(session)
    if (!canPresignUpload(session, clock())) throw new LmsError('Se terminó el tiempo para subir archivos.', 409, 'EXPIRED')
    if (!media) throw new LmsError('La subida de archivos no está disponible.', 503)
    const { fileId, uploadUrl } = await media.presign(companyId, owner.uploadedById(p.actor), body, SUBMISSION_UPLOAD, { ...(owner.metadata(p.actor) ?? {}), sessionId: session.id })
    return { fileId, uploadUrl }
  }

  // A file presigned in time is accepted for UPLOAD_GRACE_MS after the deadline.
  // When the session already closed, it joins the activity's delivery directly.
  async function confirmUpload(companyId, actor, sessionId, fileId, body = {}) {
    const { session, p } = await ownSession(companyId, actor, sessionId)
    const asset = isUuid(fileId) ? await prisma.fileAsset.findFirst({ where: { id: fileId, moduleKey: 'runly.lms', enabled: true } }) : null
    if (!asset || asset.metadata?.sessionId !== session.id) throw new LmsError('El archivo no existe.', 404)
    if (!canConfirmUpload(session, asset, clock())) throw new LmsError('Se terminó el tiempo para subir archivos.', 409, 'EXPIRED')
    if (!media) throw new LmsError('La subida de archivos no está disponible.', 503)
    const confirmed = await media.confirm(companyId, asset.id, { entityType: SUBMISSION_UPLOAD.entityType, uploadedById: owner.uploadedById(p.actor), ...(owner.metadata(p.actor) ?? {}) })
    let attached = false
    if (session.status !== 'in_progress' && isUuid(body?.activityId)) {
      const sub = await prisma.lmsSubmission.findFirst({ where: { sessionId: session.id, lessonId: body.activityId, status: { in: ['submitted', 'missing'] } } })
      const lesson = sub ? await prisma.lmsLesson.findUnique({ where: { id: sub.lessonId } }) : null
      const max = normalizeAssignmentSettings(lesson?.settings).maxFiles
      if (sub && !sub.fileIds.includes(asset.id) && sub.fileIds.length < max) {
        const { count } = await prisma.lmsSubmission.updateMany({
          where: { id: sub.id, status: sub.status, gradedAt: null },
          data: { fileIds: [...sub.fileIds, asset.id], status: 'submitted' },
        })
        attached = count > 0
      }
    }
    return { ...confirmed, attached }
  }

  async function submit(companyId, actor, sessionId) {
    const { session, assessment } = await ownSession(companyId, actor, sessionId)
    if (session.status === 'in_progress') await closeSession(session.id, 'learner')
    return sessionPayload(await reload(session.id), assessment)
  }

  // ---- closing --------------------------------------------------------------
  // Close policy (spec 6.2). Children first, each guarded by its own status, so
  // a crash or a concurrent closer leaves nothing half done; the session row is
  // claimed last with updateMany, and only that winner notifies and grades.
  async function closeSession(sessionId, reason = 'learner') {
    const session = await reload(sessionId)
    if (!session || session.status !== 'in_progress') return false
    const now = clock()
    const open = await prisma.lmsQuizAttempt.findMany({ where: { sessionId, status: 'in_progress' }, select: { id: true } })
    for (const row of open) await quizSvc.closeById(row.id)
    const drafts = await prisma.lmsSubmission.findMany({ where: { sessionId, status: 'draft' } })
    const delivered = []
    for (const draft of drafts) {
      const status = draftOutcome(draft)
      const { count } = await prisma.lmsSubmission.updateMany({ where: { id: draft.id, status: 'draft' }, data: { status, submittedAt: now } })
      if (count && status === 'submitted') delivered.push(draft)
    }
    const { count } = await prisma.lmsAssessmentSession.updateMany({
      where: { id: sessionId, status: 'in_progress' },
      data: { status: closedStatus(reason), submittedAt: now, closedReason: reason },
    })
    if (!count) return false
    await refreshGrading(sessionId)
    if (delivered.length) {
      const enrollment = await prisma.lmsEnrollment.findUnique({ where: { id: session.enrollmentId }, include: { learner: true, course: true } })
      const lessons = await prisma.lmsLesson.findMany({ where: { id: { in: delivered.map((row) => row.lessonId) } } })
      for (const draft of delivered) {
        await notifier.received({
          companyId: session.companyId,
          actorId: enrollment?.learner?.userProfileId ?? null,
          course: enrollment?.course,
          lesson: lessons.find((row) => row.id === draft.lessonId),
          learnerName: enrollment?.learner?.displayName ?? 'Un participante',
          type: 'submission',
          sourceId: draft.id,
        })
      }
    }
    return true
  }

  // Marks a closed session graded (with its total) once nothing waits for a person.
  async function refreshGrading(sessionId) {
    const [attempts, submissions] = await Promise.all([
      prisma.lmsQuizAttempt.findMany({ where: { sessionId }, select: { status: true, scorePoints: true } }),
      prisma.lmsSubmission.findMany({ where: { sessionId }, select: { status: true, points: true } }),
    ])
    const state = gradingState(attempts, submissions)
    if (!state.graded) return false
    const { count } = await prisma.lmsAssessmentSession.updateMany({
      where: { id: sessionId, status: { in: ['submitted', 'expired'] } },
      data: { status: 'graded', gradedAt: clock(), scorePoints: state.scorePoints },
    })
    return count > 0
  }

  // Worker and manager views: closes sessions past deadline + grace even when
  // the participant never comes back. courseId narrows it to one evaluation.
  async function sweepExpired({ limit = 100, courseId = null } = {}) {
    const cutoff = new Date(clock().getTime() - SESSION_GRACE_MS)
    const rows = await prisma.lmsAssessmentSession.findMany({
      where: { status: 'in_progress', expiresAt: { lt: cutoff }, ...(courseId ? { courseId } : {}) },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    })
    let closed = 0
    for (const row of rows) if (await closeSession(row.id, 'timeout')) closed += 1
    return { closed }
  }

  // ---- "Mis evaluaciones" (internal users) ----------------------------------
  async function myAssessments(companyId, profileId) {
    if (!profileId) return []
    const learner = await prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId: profileId } } })
    if (!learner) return []
    const rows = await prisma.lmsEnrollment.findMany({
      where: { companyId, learnerId: learner.id, status: { in: OPEN_ENROLLMENT }, course: { enabled: true, status: { in: ['published', 'archived'] }, ...ASSESSMENT_ONLY } },
      include: { course: true, sessions: { orderBy: { number: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    })
    const now = clock()
    return rows.map((row) => {
      const settings = readAssessmentSettings(row.course.settings)
      return {
        assessment: { id: row.course.id, title: row.course.title, status: row.course.status, timeLimitMinutes: settings.timeLimitMinutes, closesAt: settings.closesAt },
        lastSession: row.sessions[0] ? sessionSummary(row.sessions[0], now) : null,
        sessionsUsed: row.sessions.length,
        sessionsAllowed: sessionsAllowed(settings, row),
      }
    })
  }

  return {
    overview, start, getSession, getAttempt, saveAnswers, saveDraft, presignUpload, confirmUpload, submit,
    closeSession, refreshGrading, sweepExpired, myAssessments,
  }
}
