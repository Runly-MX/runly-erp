// Session incidents, the hiring decision and the reviewer list of an
// evaluation (spec 2026-11-21 sections 6.1 and 9, phase 5). Every action needs
// a reason, is guarded against concurrent requests and writes lms_grade_event.
//
// What is allowed when:
//  - Extend: only a running session, before its deadline + 30 s grace. A
//    session that ran out or closed is never revived (use an extra attempt).
//  - Void: any state except graded; answers and files are kept; idempotent.
//    A voided session still counts as used: grant an extra attempt to retake.
//  - Extra attempt: on the enrollment, any time; the participant then starts a
//    new session with the current configuration.
//  - Decision: on a closed (not voided) session, separate from the score;
//    never set automatically.
import { LmsError } from './lms-error.js'
import { isUuid } from './lms-eval-shared.js'
import { TX_OPTS } from './lms-progress.js'
import { SESSION_GRACE_MS } from './lms-session-core.js'
import { DECISIONS, extendBlocker, normalizeComment, normalizeReason, voidBlocker } from './lms-grading-core.js'
import { versionWindow, writeGradeEvent } from './lms-assessment-grading-service.js'

const conflict = () => new LmsError('La sesión cambió mientras la editabas. Recarga para ver la versión actual.', 409, 'CONFLICT')

// grading: createLmsAssessmentGradingService (record, settled). sessions: session service (closeSession).
export function createLmsSessionAdminService({ prisma, access, grading, sessions, clock = () => new Date() }) {
  const canManageSessions = (user) => user.isAdmin || user.permissions.has('lms.course.manage') || user.permissions.has('lms.enrollment.manage')

  async function managedSession(companyId, user, sessionId) {
    if (!canManageSessions(user)) throw new LmsError('No tienes permiso para administrar sesiones.', 403)
    const session = await grading.settled(companyId, sessionId)
    await access.assessmentOf(companyId, session.courseId)
    return session
  }

  async function extend(companyId, user, sessionId, body = {}) {
    const session = await managedSession(companyId, user, sessionId)
    const minutes = Number(body.minutes)
    const reason = normalizeReason(body.reason, { required: true })
    const blocked = extendBlocker(session, minutes, clock(), SESSION_GRACE_MS)
    if (blocked) throw blocked
    const window = versionWindow(body.expectedUpdatedAt)
    const expiresAt = new Date(new Date(session.expiresAt).getTime() + minutes * 60_000)
    await prisma.$transaction(async (tx) => {
      // The deadline the manager saw must still be the deadline (no double extension).
      const { count } = await tx.lmsAssessmentSession.updateMany({
        where: { id: session.id, status: 'in_progress', expiresAt: session.expiresAt, updatedAt: window },
        data: { expiresAt, extendedMinutes: { increment: minutes } },
      })
      if (!count) throw conflict()
      await tx.lmsQuizAttempt.updateMany({ where: { sessionId: session.id, status: 'in_progress' }, data: { deadlineAt: expiresAt } })
      await writeGradeEvent(tx, {
        companyId, courseId: session.courseId, sessionId: session.id, enrollmentId: session.enrollmentId, sourceType: 'session', sourceId: session.id, actorId: user.profileId,
        action: 'extend', before: { expiresAt: session.expiresAt.toISOString(), extendedMinutes: session.extendedMinutes }, after: { expiresAt: expiresAt.toISOString(), extendedMinutes: session.extendedMinutes + minutes }, reason,
      })
    }, TX_OPTS)
    return grading.record(companyId, user, session.id)
  }

  async function voidSession(companyId, user, sessionId, body = {}) {
    let session = await managedSession(companyId, user, sessionId)
    const reason = normalizeReason(body.reason, { required: true })
    const blocked = voidBlocker(session)
    if (blocked) throw blocked
    if (session.status === 'voided') return grading.record(companyId, user, session.id)
    // A running session is closed first (answers and files kept, as on timeout).
    if (session.status === 'in_progress') {
      await sessions.closeSession(session.id, 'manager')
      session = await grading.findSession(companyId, session.id)
      if (session.status === 'graded') throw new LmsError('La sesión quedó calificada al cerrarse: no se puede anular.', 409, 'ALREADY_GRADED')
    }
    const before = session.status
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lmsAssessmentSession.updateMany({ where: { id: session.id, status: before }, data: { status: 'voided', closedReason: 'manager' } })
      if (!count) {
        const now = await tx.lmsAssessmentSession.findUnique({ where: { id: session.id } })
        if (now?.status === 'voided') return // a concurrent void won: same result
        throw conflict()
      }
      await writeGradeEvent(tx, {
        companyId, courseId: session.courseId, sessionId: session.id, enrollmentId: session.enrollmentId, sourceType: 'session', sourceId: session.id, actorId: user.profileId,
        action: 'void', before: { status: before }, after: { status: 'voided' }, reason,
      })
    }, TX_OPTS)
    return grading.record(companyId, user, session.id)
  }

  // expectedExtraSessions: the value the manager saw (two clicks grant one).
  async function grantExtraSession(companyId, user, enrollmentId, body = {}) {
    if (!canManageSessions(user)) throw new LmsError('No tienes permiso para administrar sesiones.', 403)
    const enrollment = isUuid(enrollmentId) ? await prisma.lmsEnrollment.findFirst({ where: { id: enrollmentId, companyId } }) : null
    if (!enrollment) throw new LmsError('El participante no existe.', 404)
    await access.assessmentOf(companyId, enrollment.courseId)
    const reason = normalizeReason(body.reason, { required: true })
    const expected = Number(body.expectedExtraSessions)
    if (!Number.isInteger(expected) || expected < 0) throw new LmsError('Falta la versión que estás editando. Recarga el expediente.', 400, 'VERSION_REQUIRED')
    if (expected >= 20) throw new LmsError('Máximo 20 intentos adicionales.', 409)
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lmsEnrollment.updateMany({ where: { id: enrollment.id, extraSessions: expected }, data: { extraSessions: expected + 1 } })
      if (!count) throw new LmsError('Ya se autorizó un intento adicional mientras lo hacías. Recarga para ver el estado actual.', 409, 'CONFLICT')
      await writeGradeEvent(tx, {
        companyId, courseId: enrollment.courseId, sessionId: body.sessionId && isUuid(body.sessionId) ? body.sessionId : null, enrollmentId: enrollment.id,
        sourceType: 'enrollment', sourceId: enrollment.id, actorId: user.profileId, action: 'extra_session', before: { extraSessions: expected }, after: { extraSessions: expected + 1 }, reason,
      })
    }, TX_OPTS)
    return { extraSessions: expected + 1 }
  }

  // Hiring decision: a person's call, recorded apart from the academic score.
  async function decide(companyId, user, sessionId, body = {}) {
    if (!(user.isAdmin || user.permissions.has('lms.assessment.decide'))) throw new LmsError('No tienes permiso para registrar decisiones.', 403)
    const session = await grading.settled(companyId, sessionId)
    await access.require(companyId, user, session.courseId, 'read')
    if (['in_progress', 'voided'].includes(session.status)) throw new LmsError('La decisión se registra sobre una sesión terminada y no anulada.', 409, 'SESSION_NOT_CLOSED')
    if (!DECISIONS.includes(body.decision)) throw new LmsError('Decisión inválida.', 400)
    const note = normalizeComment(body.note)
    const window = versionWindow(body.expectedUpdatedAt)
    const before = { decision: session.decision ?? 'pending', note: session.decisionNote }
    if (before.decision === body.decision && before.note === note) return grading.record(companyId, user, session.id)
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lmsAssessmentSession.updateMany({
        where: { id: session.id, updatedAt: window },
        data: { decision: body.decision === 'pending' ? null : body.decision, decisionNote: note, decisionById: user.profileId, decidedAt: clock() },
      })
      if (!count) throw conflict()
      await writeGradeEvent(tx, {
        companyId, courseId: session.courseId, sessionId: session.id, enrollmentId: session.enrollmentId, sourceType: 'session', sourceId: session.id, actorId: user.profileId,
        action: 'decision', before, after: { decision: body.decision, note }, reason: null,
      })
    }, TX_OPTS)
    return grading.record(companyId, user, session.id)
  }

  // ---- reviewer list (managers) ----------------------------------------------------------
  async function listGraders(companyId, user, assessmentId) {
    const { assessment } = await access.require(companyId, user, assessmentId, 'manage')
    const rows = await prisma.lmsCourseGrader.findMany({ where: { courseId: assessment.id }, orderBy: { createdAt: 'asc' } })
    const profiles = rows.length ? await prisma.userProfile.findMany({ where: { id: { in: rows.map((row) => row.userProfileId) } }, select: { id: true, displayName: true, email: true } }) : []
    const byId = new Map(profiles.map((row) => [row.id, row]))
    return rows.map((row) => ({ userProfileId: row.userProfileId, role: row.role, name: byId.get(row.userProfileId)?.displayName ?? 'Usuario', email: byId.get(row.userProfileId)?.email ?? null, addedAt: row.createdAt.toISOString() }))
  }

  // members: [{ userProfileId, role }] replaces the list; only active members of the company.
  async function setGraders(companyId, user, assessmentId, body = {}) {
    const { assessment } = await access.require(companyId, user, assessmentId, 'manage')
    const list = Array.isArray(body.members) ? body.members : null
    if (!list || list.length > 50) throw new LmsError('Envía de 0 a 50 personas.', 400)
    const members = new Map()
    for (const item of list) {
      if (!isUuid(item?.userProfileId) || !['grader', 'reader'].includes(item?.role)) throw new LmsError('Persona o rol inválido.', 400)
      members.set(item.userProfileId, item.role)
    }
    const ids = [...members.keys()]
    const valid = ids.length ? await prisma.membership.findMany({ where: { companyId, userId: { in: ids }, enabled: true, user: { isBot: false } }, select: { userId: true } }) : []
    if (valid.length !== ids.length) throw new LmsError('Solo puedes asignar personas activas de tu empresa.', 400)
    const before = await prisma.lmsCourseGrader.findMany({ where: { courseId: assessment.id } })
    await prisma.$transaction(async (tx) => {
      await tx.lmsCourseGrader.deleteMany({ where: { courseId: assessment.id } })
      if (ids.length) await tx.lmsCourseGrader.createMany({ data: ids.map((id) => ({ companyId, courseId: assessment.id, userProfileId: id, role: members.get(id), addedById: user.profileId })) })
      await writeGradeEvent(tx, {
        companyId, courseId: assessment.id, sessionId: null, sourceType: 'session', sourceId: null, actorId: user.profileId, action: 'reviewers',
        before: before.map((row) => ({ userProfileId: row.userProfileId, role: row.role })), after: ids.map((id) => ({ userProfileId: id, role: members.get(id) })), reason: null,
      })
    }, TX_OPTS)
    return listGraders(companyId, user, assessment.id)
  }

  return { extend, voidSession, grantExtraSession, decide, listGraders, setGraders }
}
