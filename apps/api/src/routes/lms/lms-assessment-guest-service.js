// Public link of a standalone evaluation (spec 2026-11-21 section 8, phase 4):
// /app/p/lms/evaluacion/<token>. Information before registering, registration
// (intake fields, consent, one registration per email), entry with an access
// code (invited people, and registered people continuing on another device),
// and the participant overview/start. The session itself (answers, files,
// submit) runs on the session service with GUEST_PARTICIPANTS.
//
// Every call resolves the link again (enabled, current token, published), so a
// disabled or rotated link stops working at once. Registering never starts the
// clock; the session starts only on an explicit start.
import { LmsError } from './lms-error.js'
import { assessmentMaxPoints, readAssessmentSettings } from './lms-assessment-core.js'
import { consentRecord, normalizeAssessmentShareSettings, availability, registrationBlocker } from './lms-assessment-share-core.js'
import { createLmsGuestAccess } from './lms-guest-access.js'
import { hashAccessCode, newAccessCode, newInviteLinkToken } from './lms-invite-core.js'
import { SHARE_TOKEN_RE, hashGuestToken, normalizeJoinInput, parseGuestAuthorization } from './lms-share-core.js'
import { linkGone } from './lms-guest-service.js'

const OPEN_STATUSES = ['active', 'completed']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const guestRequired = () => new LmsError('Regístrate o entra con tu código para continuar.', 401, 'GUEST_REQUIRED')
const alreadyRegistered = () => new LmsError('Ese correo ya está registrado en esta evaluación. Pide un código para continuar donde te quedaste.', 409, 'ALREADY_REGISTERED')
const inviteOnly = () => new LmsError('Esta evaluación es solo por invitación. Entra con el código que recibiste por correo.', 403, 'INVITE_ONLY')

// guest: createLmsGuestService (the one place guest learners are created).
// sessions: createLmsSessionService({ participants: GUEST_PARTICIPANTS }).
// invites: createLmsInviteService({ kind: 'assessment' }) for the resume code mail.
export function createLmsAssessmentGuestService({ prisma, guest, sessions, invites = null, signFile = null, attemptGuard = undefined, clock = () => new Date() }) {
  async function sharedAssessment(token) {
    if (!SHARE_TOKEN_RE.test(String(token ?? ''))) throw linkGone()
    const course = await prisma.lmsCourse.findFirst({ where: { shareToken: token, shareEnabled: true, enabled: true, status: 'published', kind: 'assessment' } })
    if (!course) throw linkGone()
    return { course, settings: normalizeAssessmentShareSettings(course.shareSettings), assessmentSettings: readAssessmentSettings(course.settings) }
  }

  // Same rules as course guests: a valid token of this company enrolled here.
  async function findGuest(course, raw) {
    if (!raw) return null
    const learner = await prisma.lmsLearner.findUnique({ where: { guestTokenHash: hashGuestToken(raw) } })
    if (!learner?.enabled || learner.companyId !== course.companyId) return null
    const enrollment = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } } })
    return enrollment ? { learner, enrollment } : null
  }

  async function loadGuest(token, authorization) {
    const shared = await sharedAssessment(token)
    const found = await findGuest(shared.course, parseGuestAuthorization(authorization))
    if (!found) throw guestRequired()
    return { ...shared, ...found }
  }

  async function brand(companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, brandingConfig: { select: { logoFileId: true } } } })
    const logoUrl = signFile && company?.brandingConfig?.logoFileId ? await signFile(company.brandingConfig.logoFileId, 'card').catch(() => null) : null
    return { name: company?.name ?? null, logoUrl }
  }

  // ---- before registering: everything the person needs to decide ------------------
  async function summary(token) {
    const { course, settings, assessmentSettings: s } = await sharedAssessment(token)
    const activities = (await sessions.activityCatalog(course.id)).map(({ id: _id, ...rest }) => rest)
    return {
      serverNow: clock().toISOString(),
      assessment: {
        title: course.title,
        description: course.description,
        timeLimitMinutes: s.timeLimitMinutes,
        maxSessions: s.maxSessions,
        opensAt: s.opensAt,
        closesAt: s.closesAt,
        timeZone: s.timeZone,
        availability: availability(s, clock()),
        maxPoints: assessmentMaxPoints(activities.map((item) => item.maxPoints)),
        activities,
      },
      company: await brand(course.companyId),
      settings: { accessMode: settings.accessMode, intakeFields: settings.intakeFields, consent: settings.consent, dedupeByEmail: settings.dedupeByEmail },
    }
  }

  // ---- registration (open links) ----------------------------------------------------
  // One registration per email and evaluation: the (course_id, email) unique index
  // of lms_guest_invite decides, so two registrations racing cannot both win.
  // The row also lets the person ask for a code later (resume on another device).
  async function register(token, body = {}, authorization) {
    const { course, settings, assessmentSettings } = await sharedAssessment(token)
    if (settings.accessMode === 'invite') throw inviteOnly()
    const raw = parseGuestAuthorization(authorization)
    const existing = await findGuest(course, raw)
    if (existing) {
      if (!OPEN_STATUSES.includes(existing.enrollment.status)) throw new LmsError('Tu acceso a esta evaluación fue retirado.', 403, 'GUEST_REMOVED')
      return { guestToken: raw, guest: { name: existing.learner.displayName }, resumed: true }
    }
    const blocked = registrationBlocker(assessmentSettings, clock())
    if (blocked) throw blocked
    const input = normalizeJoinInput(body, settings.intakeFields)
    const consent = consentRecord(settings, body, clock())
    if (settings.dedupeByEmail) {
      if (!input.email) throw new LmsError('El correo es obligatorio.', 400)
      const taken = await prisma.lmsGuestInvite.findUnique({ where: { courseId_email: { courseId: course.id, email: input.email } }, select: { id: true } })
      if (taken) throw alreadyRegistered()
    }
    try {
      const { guestToken } = await guest.createGuestLearner({
        course, name: input.name, email: input.email, profile: input.profile,
        enrollment: consent ? { consent } : null,
        afterCreate: settings.dedupeByEmail
          ? async (tx, learner) => {
            // A random code nobody holds: the person gets a real one only by asking (resume).
            const linkToken = newInviteLinkToken()
            await tx.lmsGuestInvite.create({
              data: { companyId: course.companyId, courseId: course.id, email: input.email, name: input.name, codeHash: hashAccessCode(newAccessCode(), linkToken), linkToken, learnerId: learner.id, lastUsedAt: clock() },
            })
          }
          : null,
      })
      return { guestToken, guest: { name: input.name }, resumed: false }
    } catch (error) {
      if (error?.code === 'P2002') throw alreadyRegistered()
      throw error
    }
  }

  // ---- entry with a code: invited people, and registered people on another device ----
  // An invited person's first entry is their registration: same window and consent.
  async function createInvitedLearner({ input, ...args }) {
    const { settings, assessmentSettings } = await sharedAssessment(args.course.shareToken)
    const blocked = registrationBlocker(assessmentSettings, clock())
    if (blocked) throw blocked
    const consent = consentRecord(settings, input, clock())
    return guest.createGuestLearner({ ...args, enrollment: consent ? { consent } : null })
  }
  const access = createLmsGuestAccess({ prisma, sharedCourse: sharedAssessment, createGuestLearner: createInvitedLearner, guard: attemptGuard, openStatuses: OPEN_STATUSES })

  // Always the same answer (never reveals whether the email is registered).
  async function resume(token, body = {}) {
    const { course } = await sharedAssessment(token)
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email) || email.length > 200) throw new LmsError('Escribe un correo válido.', 400)
    const invite = await prisma.lmsGuestInvite.findUnique({ where: { courseId_email: { courseId: course.id, email } } })
    if (invite && invites) await invites.sendResumeCode(course, invite).catch(() => false)
    return { message: 'Si ese correo está registrado, te enviamos un código para continuar. Revisa tu bandeja de entrada.' }
  }

  // ---- registered participant ---------------------------------------------------------
  async function me(token, authorization) {
    const g = await loadGuest(token, authorization)
    const overview = await sessions.overview(g.course.companyId, { learner: g.learner }, g.course.id)
    return { ...overview, guest: { name: g.learner.displayName, email: g.learner.email } }
  }

  async function start(token, authorization) {
    const g = await loadGuest(token, authorization)
    return sessions.start(g.course.companyId, { learner: g.learner }, g.course.id)
  }

  return { summary, register, access: access.access, resume, me, start }
}
