// runly.lms external guests on a public course share link. Every call resolves
// the link again (enabled, current token, published course), so a disabled or
// rotated link stops working at once. Guests authenticate with
// `Authorization: Guest <token>`; only sha256(token) is stored.
import { LmsError, lessonStates, liveProgressPct, orderLessons } from './lms-core.js'
import { normalizeLessonSettings } from './lms-eval-core.js'
import { isUuid } from './lms-eval-shared.js'
import { createLmsLearnService } from './lms-learn-service.js'
import { createLmsNotifier } from './lms-notify.js'
import { LESSON_THUMB_VARIANT } from './lms-overview-service.js'
import { TX_OPTS } from './lms-progress.js'
import { createLmsQuizService } from './lms-quiz-service.js'
import { GUEST_OWNER, createLmsAssignmentService } from './lms-assignment-service.js'
import { createLmsSerializers } from './lms-serialize.js'
import { loadPromo } from './lms-promo.js'
import { createLmsGuestAccess } from './lms-guest-access.js'
import { inviteRevoked } from './lms-invite-core.js'
import {
  SHARE_TOKEN_RE, filterSharedSections, guestEnrollment, hashGuestToken, newGuestToken, normalizeJoinInput,
  isSharedLesson, normalizeShareSettings, parseGuestAuthorization,
} from './lms-share-core.js'

const OPEN_STATUSES = ['active', 'completed']
const SECTIONS_ORDERED = {
  orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  include: { lessons: { where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
}

export const linkGone = () => new LmsError('El enlace no existe o fue desactivado.', 404, 'SHARE_NOT_FOUND')
const guestRequired = () => new LmsError('Escribe tu nombre para entrar al curso.', 401, 'GUEST_REQUIRED')
const guestRemoved = () => new LmsError('Tu acceso a este curso fue retirado.', 403, 'GUEST_REMOVED')
const lessonGone = () => new LmsError('La lección no existe.', 404)

const inviteOnly = () => new LmsError('Este curso es solo por invitación. Entra con el enlace y el código que recibiste por correo.', 403, 'INVITE_ONLY')
const TOUCH_MS = 10 * 60_000

// learn / quiz / assignment: optional overrides (tests). media: createLmsMedia
// (guest submission uploads). attemptGuard: failed access-code counter
// (lms-invite-core createAttemptGuard).
export function createLmsGuestService({
  prisma, signFile = null, hlsManifest = null, notificationService = null, media = null, learn = null, quiz = null, assignment = null, attemptGuard = undefined,
}) {
  const ser = createLmsSerializers({ prisma, signFile })
  const sign = (fileId, variant) => ser.sign(fileId, variant).catch(() => null)
  const learnSvc = learn ?? createLmsLearnService({ prisma, signFile, hlsManifest })
  const notifier = createLmsNotifier({ notificationService })
  // The quiz and assignment services ask for a lesson context with the guest in place of the profile id.
  const guestLearn = { lessonContext: (_companyId, guest, lessonId) => lessonContext(guest, lessonId) }
  const assignmentSvc = assignment ?? createLmsAssignmentService({ prisma, learn: guestLearn, media, notifier, signFile, owner: GUEST_OWNER })
  const quizSvc = quiz ?? createLmsQuizService({
    prisma,
    signFile,
    notifier,
    learn: guestLearn,
    ownsAttempt: (row, guest) => Boolean(guest?.enrollment) && row.enrollmentId === guest.enrollment.id && guest.sharedIds.has(row.lessonId),
  })

  async function sharedCourse(token) {
    if (!SHARE_TOKEN_RE.test(String(token ?? ''))) throw linkGone()
    const course = await prisma.lmsCourse.findFirst({ where: { shareToken: token, shareEnabled: true, enabled: true, status: 'published' } })
    if (!course) throw linkGone()
    return { course, settings: normalizeShareSettings(course.shareSettings) }
  }

  async function loadOutline(shared) {
    const sections = filterSharedSections(await prisma.lmsSection.findMany({ where: { courseId: shared.course.id }, ...SECTIONS_ORDERED }), shared.settings)
    return { sections, lessons: orderLessons(sections) }
  }

  async function brand(companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, brandingConfig: { select: { logoFileId: true } } } })
    return { name: company?.name ?? null, logoUrl: await sign(company?.brandingConfig?.logoFileId, 'card') }
  }

  async function courseSummary(course, lessons) {
    return {
      title: course.title,
      summary: course.summary,
      description: course.description,
      coverUrl: await sign(course.coverFileId, 'preview'),
      level: course.level,
      estimatedMinutes: course.estimatedMinutes,
      sequential: course.sequential,
      lessonCount: lessons.length,
    }
  }

  // Section ids are positional; lesson ids and states only once the guest joined.
  function outlineSections(sections, guest = null) {
    return Promise.all(sections.map(async (section, index) => ({
      id: `s${index + 1}`,
      title: section.title,
      lessons: await Promise.all(section.lessons.map(async (lesson) => ({
        ...(guest ? { id: lesson.id } : {}),
        title: lesson.title,
        kind: lesson.kind,
        durationSeconds: lesson.durationSeconds,
        required: lesson.required,
        preview: lesson.preview === true,
        coverUrl: await sign(lesson.coverFileId, LESSON_THUMB_VARIANT),
        ...(guest ? { status: guest.states.get(lesson.id) ?? 'available', positionSeconds: guest.progressById.get(lesson.id)?.positionSeconds ?? 0 } : {}),
      }))),
    })))
  }

  // { learner, enrollment } for a raw guest token on this course, or null. On an
  // invite-only link the guest also needs a live invitation: a revoked one is
  // 403 at once; a guest who joined while the link was open has none (401).
  async function findGuest(course, raw, settings = normalizeShareSettings(course.shareSettings)) {
    if (!raw) return null
    const learner = await prisma.lmsLearner.findUnique({ where: { guestTokenHash: hashGuestToken(raw) } })
    if (!learner || !learner.enabled || learner.companyId !== course.companyId) return null
    const enrollment = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } }, include: { learner: true } })
    if (!enrollment) return null
    if (settings.accessMode === 'invite') {
      const invite = await prisma.lmsGuestInvite.findFirst({ where: { courseId: course.id, learnerId: learner.id } })
      if (!invite) return null
      if (invite.revokedAt) throw inviteRevoked()
      if (!invite.lastUsedAt || Date.now() - new Date(invite.lastUsedAt).getTime() > TOUCH_MS) {
        await prisma.lmsGuestInvite.update({ where: { id: invite.id }, data: { lastUsedAt: new Date() } }).catch(() => null)
      }
    }
    return { learner, enrollment }
  }

  // Link + guest + shared outline with progress and lock states.
  async function loadGuest(token, authorization) {
    const shared = await sharedCourse(token)
    const found = await findGuest(shared.course, parseGuestAuthorization(authorization), shared.settings)
    if (!found) throw guestRequired()
    if (!OPEN_STATUSES.includes(found.enrollment.status)) throw guestRemoved()
    const { sections, lessons } = await loadOutline(shared)
    const rows = await prisma.lmsLessonProgress.findMany({ where: { enrollmentId: found.enrollment.id } })
    const progressById = new Map(rows.map((row) => [row.lessonId, row]))
    const states = lessonStates(lessons, progressById, { sequential: shared.course.sequential })
    return { ...shared, ...found, sections, lessons, progressById, states, sharedIds: new Set(lessons.map((lesson) => lesson.id)) }
  }

  // Lessons outside the shared set are 404, locked ones 409.
  function lessonContext(guest, lessonId) {
    const lesson = guest.lessons.find((item) => item.id === lessonId)
    if (!lesson) throw lessonGone()
    if (guest.states.get(lesson.id) === 'locked') throw new LmsError('Completa las lecciones anteriores para abrir esta.', 409, 'LOCKED')
    return { ...guest, lesson }
  }

  // ---- endpoints ------------------------------------------------------------
  async function summary(token) {
    const shared = await sharedCourse(token)
    const { sections, lessons } = await loadOutline(shared)
    return {
      course: await courseSummary(shared.course, lessons),
      company: await brand(shared.course.companyId),
      settings: shared.settings,
      // Only when the promo lesson is inside the shared scope.
      promo: await loadPromo(prisma, shared.course, learnSvc.resolveMedia, { allow: (lesson) => isSharedLesson(lesson, shared.settings) }),
      sections: await outlineSections(sections),
    }
  }

  // Re-joining with a valid token for this course returns the same guest.
  // Open links only. Re-joining with a valid token for this course returns the same guest.
  async function join(token, body, authorization) {
    const { course, settings } = await sharedCourse(token)
    if (settings.accessMode === 'invite') throw inviteOnly()
    const raw = parseGuestAuthorization(authorization)
    const existing = await findGuest(course, raw, settings)
    if (existing) {
      if (!OPEN_STATUSES.includes(existing.enrollment.status)) throw guestRemoved()
      return { guestToken: raw, guest: { name: existing.learner.displayName, email: existing.learner.email }, resumed: true }
    }
    const input = normalizeJoinInput(body, settings.intakeFields)
    const { guestToken } = await createGuestLearner({ course, name: input.name, email: input.email, profile: input.profile })
    return { guestToken, guest: { name: input.name, email: input.email }, resumed: false }
  }

  // The one place a guest learner is created: learner (token hash only, intake
  // answers in guest_profile) plus its share enrollment. `afterCreate(tx, learner)`
  // runs in the same transaction (the invite links its learner there).
  async function createGuestLearner({ course, name, email = null, profile = null, afterCreate = null }) {
    const guestToken = newGuestToken()
    const enrollment = await prisma.$transaction(async (tx) => {
      const learner = await tx.lmsLearner.create({
        data: { companyId: course.companyId, displayName: name, email, guestProfile: profile ?? {}, guestTokenHash: hashGuestToken(guestToken) },
      })
      if (afterCreate) await afterCreate(tx, learner)
      return tx.lmsEnrollment.create({ data: { companyId: course.companyId, courseId: course.id, learnerId: learner.id, source: 'share' } })
    }, TX_OPTS)
    return { guestToken, enrollment }
  }

  const access = createLmsGuestAccess({ prisma, sharedCourse, createGuestLearner, guard: attemptGuard, openStatuses: OPEN_STATUSES })

  async function me(token, authorization) {
    const guest = await loadGuest(token, authorization)
    const lastLessonId = guest.sharedIds.has(guest.enrollment.lastLessonId) ? guest.enrollment.lastLessonId : null
    // Public certificate token (PDF at /public/lms/certificates/:token/pdf) when one was issued.
    const certificate = guest.enrollment.status === 'completed'
      ? await prisma.lmsCertificate.findFirst({ where: { enrollmentId: guest.enrollment.id, revokedAt: null }, orderBy: { issuedAt: 'desc' }, select: { token: true, folio: true } })
      : null
    return {
      guest: { name: guest.learner.displayName, email: guest.learner.email },
      course: await courseSummary(guest.course, guest.lessons),
      company: await brand(guest.course.companyId),
      settings: guest.settings,
      // progressPct over the lessons shared now (the stored value goes stale when the scope changes).
      enrollment: { ...guestEnrollment(guest.enrollment), progressPct: liveProgressPct(guest.lessons, guest.progressById), lastLessonId },
      certificate: certificate ? { token: certificate.token, folio: certificate.folio } : null,
      sections: await outlineSections(guest.sections, guest),
    }
  }

  // Lesson resources are not shared with guests (internal material).
  async function openLesson(token, authorization, lessonId) {
    const ctx = lessonContext(await loadGuest(token, authorization), lessonId)
    const { lesson, enrollment, lessons } = ctx
    await prisma.lmsEnrollment.update({ where: { id: enrollment.id }, data: { lastLessonId: lesson.id, ...(enrollment.startedAt ? {} : { startedAt: new Date() }) } })
    let progress = ctx.progressById.get(lesson.id) ?? null
    if (!progress) {
      progress = await prisma.lmsLessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
        create: { companyId: enrollment.companyId, enrollmentId: enrollment.id, lessonId: lesson.id, status: 'in_progress' },
        update: {},
      })
    }
    const index = lessons.findIndex((item) => item.id === lesson.id)
    const names = await ser.fileNames([lesson.fileId])
    const { mediaUrl, media, poster } = await learnSvc.resolveMedia(lesson)
    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        body: lesson.body,
        embedUrl: lesson.embedUrl,
        durationSeconds: lesson.durationSeconds,
        settings: normalizeLessonSettings(lesson.kind, lesson.settings),
        mediaUrl,
        media,
        poster,
        fileName: lesson.fileId ? names.get(lesson.fileId) ?? null : null,
        resources: [],
      },
      progress: { status: progress?.status ?? 'available', positionSeconds: progress?.positionSeconds ?? 0 },
      prevLessonId: index > 0 ? lessons[index - 1].id : null,
      nextLessonId: index >= 0 && index < lessons.length - 1 ? lessons[index + 1].id : null,
    }
  }

  async function saveProgress(token, authorization, lessonId, body = {}) {
    const ctx = lessonContext(await loadGuest(token, authorization), lessonId)
    const result = await learnSvc.applyProgress(ctx, body)
    return { lessonStatus: result.lessonStatus, enrollment: guestEnrollment(result.enrollment) }
  }

  // ---- quizzes (only when the link allows them) -------------------------------
  async function quizGuest(token, authorization) {
    const guest = await loadGuest(token, authorization)
    if (!guest.settings.allowQuizzes) throw new LmsError('Los exámenes no están disponibles en este enlace.', 404, 'QUIZZES_DISABLED')
    return guest
  }

  const withGuestEnrollment = (result) => (result?.enrollment ? { ...result, enrollment: guestEnrollment(result.enrollment) } : result)
  const attemptId = (id) => {
    if (!isUuid(id)) throw new LmsError('El intento no existe.', 404)
    return id
  }

  async function getQuiz(token, authorization, lessonId) {
    const guest = await quizGuest(token, authorization)
    return quizSvc.getQuizSummary(guest.course.companyId, guest, lessonId)
  }

  async function startAttempt(token, authorization, lessonId) {
    const guest = await quizGuest(token, authorization)
    return quizSvc.startAttempt(guest.course.companyId, guest, lessonId)
  }

  async function getAttempt(token, authorization, id) {
    const guest = await quizGuest(token, authorization)
    return quizSvc.getAttempt(guest.course.companyId, guest, attemptId(id))
  }

  async function saveAnswers(token, authorization, id, body) {
    const guest = await quizGuest(token, authorization)
    return quizSvc.saveAnswers(guest.course.companyId, guest, attemptId(id), body)
  }

  async function submitAttempt(token, authorization, id, body) {
    const guest = await quizGuest(token, authorization)
    return withGuestEnrollment(await quizSvc.submitAttempt(guest.course.companyId, guest, attemptId(id), body))
  }

  // ---- assignments (only when the link allows them) ---------------------------
  // Same rules as internal learners (due date, late flag, pending review, lesson
  // outcome); uploads are owned by the guest learner (FileAsset metadata).
  async function assignmentGuest(token, authorization) {
    const guest = await loadGuest(token, authorization)
    if (!guest.settings.allowAssignments) throw new LmsError('Las tareas no están disponibles en este enlace.', 404, 'ASSIGNMENTS_DISABLED')
    return guest
  }

  const uploadsReady = () => {
    if (!media && !assignment) throw new LmsError('La subida de archivos no está disponible.', 503)
  }

  async function listSubmissions(token, authorization, lessonId) {
    const guest = await assignmentGuest(token, authorization)
    return assignmentSvc.listSubmissions(guest.course.companyId, guest, lessonId)
  }

  async function submitAssignment(token, authorization, lessonId, body) {
    const guest = await assignmentGuest(token, authorization)
    return assignmentSvc.submit(guest.course.companyId, guest, lessonId, body)
  }

  async function presignUpload(token, authorization, body) {
    const guest = await assignmentGuest(token, authorization)
    uploadsReady()
    const { fileId, uploadUrl } = await assignmentSvc.presignUpload(guest.course.companyId, guest, body)
    return { fileId, uploadUrl }
  }

  async function confirmUpload(token, authorization, fileId) {
    const guest = await assignmentGuest(token, authorization)
    uploadsReady()
    if (!isUuid(fileId)) throw new LmsError('El archivo no existe.', 404)
    return assignmentSvc.confirmUpload(guest.course.companyId, guest, fileId)
  }

  return {
    summary, join, access: access.access, me, openLesson, saveProgress, getQuiz, startAttempt, getAttempt, saveAnswers, submitAttempt,
    listSubmissions, submitAssignment, presignUpload, confirmUpload, lessonContext, createGuestLearner,
  }
}
