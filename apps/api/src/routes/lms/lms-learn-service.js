// runly.lms learner side: catalog, my courses, self-enrollment, course outline,
// lesson open and progress. The learner is always the current user profile.
import { EVALUATED_KINDS, LmsError, lessonStates, liveProgressPct, orderLessons, shouldAutoComplete } from './lms-core.js'
import { normalizeLessonSettings } from './lms-eval-core.js'
import { COURSE_COUNTS, ENROLLMENT_CERT, ENROLLMENT_INCLUDE, createLmsSerializers, enrollmentCertificate } from './lms-serialize.js'
import { createLmsService } from './lms-service.js'
import { recordLessonOutcome } from './lms-progress.js'
import { updateEnrollmentWithCertificate } from './lms-cert-issue.js'
import { createLmsResourcesService } from './lms-resources-service.js'
import { LESSON_THUMB_VARIANT } from './lms-overview-service.js'
import { isOpenPreview, markSectionFree } from './lms-share-core.js'

const OPEN_STATUSES = ['active', 'completed']
const MANUAL_COMPLETE_KINDS = new Set(['text', 'file', 'embed'])
const SECTIONS_ORDERED = {
  orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  include: { lessons: { where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
}

export function createLmsLearnService({ prisma, signFile = null, authoring = null, hlsManifest = null }) {
  const ser = createLmsSerializers({ prisma, signFile })
  const resources = createLmsResourcesService({ prisma, signFile })
  const learners = authoring ?? createLmsService({ prisma, signFile })

  const findLearner = (companyId, userProfileId) => prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId } } })

  async function openEnrollment(companyId, userProfileId, courseId) {
    const learner = await findLearner(companyId, userProfileId)
    if (!learner) return null
    const row = await prisma.lmsEnrollment.findFirst({ where: { companyId, courseId, learnerId: learner.id, status: { in: OPEN_STATUSES } }, include: ENROLLMENT_INCLUDE })
    return row
  }

  async function catalog(companyId, userProfileId) {
    const rows = await prisma.lmsCourse.findMany({
      where: { companyId, enabled: true, status: 'published', selfEnroll: true },
      include: COURSE_COUNTS,
      orderBy: { updatedAt: 'desc' },
    })
    const courses = await ser.serializeCourses(rows)
    const learner = await findLearner(companyId, userProfileId)
    const enrollments = learner
      ? await prisma.lmsEnrollment.findMany({ where: { companyId, learnerId: learner.id, courseId: { in: rows.map((r) => r.id) } }, include: ENROLLMENT_INCLUDE })
      : []
    const byCourse = new Map(enrollments.map((e) => [e.courseId, ser.serializeEnrollment(e)]))
    return courses.map((course) => ({ ...course, enrollment: byCourse.get(course.id) ?? null }))
  }

  async function myCourses(companyId, userProfileId) {
    const learner = await findLearner(companyId, userProfileId)
    if (!learner) return { active: [], completed: [] }
    const rows = await prisma.lmsEnrollment.findMany({
      where: { companyId, learnerId: learner.id, status: { in: OPEN_STATUSES }, course: { enabled: true, status: { in: ['published', 'archived'] } } },
      include: { ...ENROLLMENT_INCLUDE, course: { include: COURSE_COUNTS } },
      orderBy: { updatedAt: 'desc' },
    })
    const courses = await ser.serializeCourses(rows.map((row) => row.course))
    const now = new Date()
    const items = rows.map((row, index) => {
      const enrollment = ser.serializeEnrollment(row, now)
      const certificateId = enrollment.certificate && !enrollment.certificate.revokedAt ? enrollment.certificate.id : null
      return { course: courses[index], enrollment, certificateId }
    })
    // Active: due soonest first, then most recently touched.
    // Archived courses only stay visible once completed (certificate, history).
    const active = items.filter((item) => item.enrollment.status === 'active' && item.course.status !== 'archived')
      .sort((a, b) => (a.enrollment.dueAt ? Date.parse(a.enrollment.dueAt) : Infinity) - (b.enrollment.dueAt ? Date.parse(b.enrollment.dueAt) : Infinity))
    return { active, completed: items.filter((item) => item.enrollment.status === 'completed') }
  }

  async function enroll(companyId, userProfileId, courseId) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true } })
    if (!course) throw new LmsError('El curso no existe.', 404)
    if (course.status !== 'published' || !course.selfEnroll) throw new LmsError('Este curso no admite inscripción libre.', 409, 'NOT_SELF_ENROLL')
    const learner = await learners.ensureLearnerForProfile(companyId, userProfileId)
    const existing = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } }, include: ENROLLMENT_INCLUDE })
    if (existing && existing.status !== 'dropped') return ser.serializeEnrollment(existing)
    const row = existing
      ? await updateEnrollmentWithCertificate(prisma, { id: existing.id, data: { status: existing.completedAt ? 'completed' : 'active', source: 'self' }, include: ENROLLMENT_INCLUDE })
      : await prisma.lmsEnrollment.create({ data: { companyId, courseId: course.id, learnerId: learner.id, source: 'self' }, include: { learner: true } })
    return ser.serializeEnrollment(row)
  }

  // Loads the course with ordered lessons, the caller's enrollment and progress,
  // and the per-lesson state. Throws when the caller may not view the course.
  // access: 'enrolled', 'manage' (preview without enrollment) or 'free' (not
  // enrolled: only free-section and preview lessons of a published course open).
  // preview (course managers only): the author's "Vista previa" ignores their own
  // enrollment, so every lesson opens and nothing is recorded as progress.
  async function loadContext(companyId, userProfileId, courseId, { canManage, preview = false }) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true }, include: COURSE_COUNTS })
    if (!course) throw new LmsError('El curso no existe.', 404)
    const enrollment = preview && canManage ? null : await openEnrollment(companyId, userProfileId, course.id)
    const notEnrolled = () => new LmsError('No estás inscrito en este curso.', 403, 'NOT_ENROLLED')
    const access = enrollment ? 'enrolled' : canManage ? 'manage' : 'free'
    if (access === 'free' && course.status !== 'published') throw notEnrolled()
    if (course.status === 'draft' && !canManage) throw new LmsError('El curso no existe.', 404)
    const sections = markSectionFree(await prisma.lmsSection.findMany({ where: { courseId: course.id }, ...SECTIONS_ORDERED }))
    const lessons = orderLessons(sections)
    if (access === 'free' && !lessons.some((lesson) => isOpenPreview(lesson))) throw notEnrolled()
    const progressRows = enrollment ? await prisma.lmsLessonProgress.findMany({ where: { enrollmentId: enrollment.id } }) : []
    const progressById = new Map(progressRows.map((row) => [row.lessonId, row]))
    const states = access === 'free'
      ? new Map(lessons.map((lesson) => [lesson.id, isOpenPreview(lesson) ? 'available' : 'locked']))
      : lessonStates(lessons, progressById, { sequential: course.sequential, locked: Boolean(enrollment) })
    return { course, enrollment, access, sections, lessons, progressById, states }
  }

  async function outline(companyId, userProfileId, courseId, { canManage = false, preview = false } = {}) {
    const ctx = await loadContext(companyId, userProfileId, courseId, { canManage, preview })
    const announcementCount = await prisma.lmsAnnouncement.count({ where: { courseId: ctx.course.id, deletedAt: null } })
    return {
      course: await ser.serializeCourse(ctx.course),
      announcementCount,
      // progressPct over the lessons enabled now; status (completed) stays as stored.
      enrollment: ctx.enrollment ? { ...ser.serializeEnrollment(ctx.enrollment), progressPct: liveProgressPct(ctx.lessons, ctx.progressById) } : null,
      access: ctx.access,
      sections: await Promise.all(ctx.sections.map(async (section) => ({
        id: section.id,
        title: section.title,
        free: section.free === true,
        lessons: await Promise.all(section.lessons.map(async (lesson) => ({
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind,
          durationSeconds: lesson.durationSeconds,
          required: lesson.required,
          free: isOpenPreview(lesson),
          coverUrl: await ser.sign(lesson.coverFileId, LESSON_THUMB_VARIANT),
          status: ctx.states.get(lesson.id) ?? 'available',
          positionSeconds: ctx.progressById.get(lesson.id)?.positionSeconds ?? 0,
        }))),
      }))),
    }
  }

  async function lessonContext(companyId, userProfileId, lessonId, { canManage, preview = false }) {
    const lesson = await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, enabled: true } })
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    const ctx = await loadContext(companyId, userProfileId, lesson.courseId, { canManage, preview })
    if (ctx.access === 'free' && ctx.states.get(lesson.id) === 'locked') {
      throw new LmsError('Inscríbete al curso para abrir esta lección.', 403, 'NOT_ENROLLED')
    }
    if (ctx.states.get(lesson.id) === 'locked') throw new LmsError('Completa las lecciones anteriores para abrir esta.', 409, 'LOCKED')
    return { ...ctx, lesson }
  }

  // Playable media of a lesson: { mediaUrl, media, poster }. Large videos are
  // HLS packages: the manifest comes back with each segment signed.
  async function resolveMedia(lesson) {
    const withMedia = lesson.kind === 'video' || lesson.kind === 'file'
    const mediaUrl = withMedia ? await ser.sign(lesson.fileId, 'full') : null
    let media = mediaUrl ? { kind: 'file', url: mediaUrl } : null
    if (lesson.kind === 'video' && hlsManifest) {
      try {
        const manifest = await hlsManifest(lesson.fileId)
        if (manifest) media = { kind: 'hls', manifest }
      } catch (error) {
        console.warn('[runly.lms] HLS manifest failed', lesson.fileId, error?.message)
        media = { kind: 'hls', manifest: null, error: 'No se pudo preparar la reproducción del video.' }
      }
    }
    return { mediaUrl, media, poster: lesson.coverFileId ? await ser.sign(lesson.coverFileId, 'preview') : null }
  }

  // Editor preview (lms.course.manage): same media/poster shape as openLesson,
  // with no enrollment, lock or progress side effects.
  async function lessonMedia(companyId, lessonId) {
    const lesson = await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, enabled: true } })
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    return { lessonId: lesson.id, fileId: lesson.fileId, coverFileId: lesson.coverFileId ?? null, ...(await resolveMedia(lesson)) }
  }

  async function openLesson(companyId, userProfileId, lessonId, { canManage = false, preview = false } = {}) {
    const ctx = await lessonContext(companyId, userProfileId, lessonId, { canManage, preview })
    const { lesson, enrollment, lessons } = ctx
    let progress = ctx.progressById.get(lesson.id) ?? null
    if (enrollment && ctx.course.status === 'published') {
      const now = new Date()
      await prisma.lmsEnrollment.update({ where: { id: enrollment.id }, data: { lastLessonId: lesson.id, ...(enrollment.startedAt ? {} : { startedAt: now }) } })
      if (!progress) {
        progress = await prisma.lmsLessonProgress.upsert({
          where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
          create: { companyId, enrollmentId: enrollment.id, lessonId: lesson.id, status: 'in_progress' },
          update: {},
        })
      }
    }
    const index = lessons.findIndex((item) => item.id === lesson.id)
    const names = await ser.fileNames([lesson.fileId])
    const { mediaUrl, media, poster } = await resolveMedia(lesson)
    // Free preview (not enrolled): only the lesson itself, no resources.
    const lessonResources = ctx.access === 'free' ? [] : await resources.lessonResources(lesson.id)
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
        resources: lessonResources,
      },
      progress: { status: progress?.status ?? 'available', positionSeconds: progress?.positionSeconds ?? 0 },
      prevLessonId: index > 0 ? lessons[index - 1].id : null,
      nextLessonId: index >= 0 && index < lessons.length - 1 ? lessons[index + 1].id : null,
    }
  }

  const seconds = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 24 * 3600 * 10) : null
  }

  async function saveProgress(companyId, userProfileId, lessonId, body = {}) {
    return applyProgress(await lessonContext(companyId, userProfileId, lessonId, { canManage: false }), body)
  }

  // ctx: { lesson, enrollment, course, progressById } of an enrolled learner (also guests).
  async function applyProgress(ctx, body = {}) {
    const { lesson, enrollment, course } = ctx
    if (!enrollment) throw new LmsError('Inscríbete al curso para guardar tu avance.', 403, 'NOT_ENROLLED')
    if (course.status !== 'published') throw new LmsError('El curso no está disponible para guardar avance.', 409, 'NOT_PUBLISHED')
    const now = new Date()
    const position = seconds(body.positionSeconds)
    const clientDuration = seconds(body.durationSeconds)
    let durationSeconds = lesson.durationSeconds
    if (!durationSeconds && clientDuration > 0) {
      durationSeconds = clientDuration
      await prisma.lmsLesson.update({ where: { id: lesson.id }, data: { durationSeconds } })
    }
    const previous = ctx.progressById.get(lesson.id)
    const maxPositionSeconds = Math.max(previous?.maxPositionSeconds ?? 0, position ?? 0)
    // Uploaded videos complete only by watching; evaluated kinds never by request.
    const manual = body.completed === true && MANUAL_COMPLETE_KINDS.has(lesson.kind)
    const complete = manual || shouldAutoComplete({ kind: lesson.kind, positionSeconds: maxPositionSeconds, durationSeconds })
    // Quiz/assignment status belongs to their evaluators; a progress ping keeps it.
    const idle = EVALUATED_KINDS.has(lesson.kind) ? previous?.status ?? 'in_progress' : 'in_progress'
    const result = await recordLessonOutcome(prisma, {
      enrollment,
      lessonId: lesson.id,
      status: complete ? 'completed' : idle,
      fields: { positionSeconds: position ?? previous?.positionSeconds ?? 0, maxPositionSeconds },
      touch: { lastLessonId: lesson.id, ...(enrollment.startedAt ? {} : { startedAt: now }) },
      now,
    })
    // The player shows "Descargar certificado" once the enrollment is completed.
    const certs = result.enrollment.status === 'completed'
      ? await prisma.lmsEnrollment.findUnique({ where: { id: enrollment.id }, select: ENROLLMENT_CERT })
      : null
    return { lessonStatus: result.lessonStatus, enrollment: { ...ser.serializeEnrollment(result.enrollment), certificate: enrollmentCertificate(certs) } }
  }

  return { catalog, myCourses, enroll, outline, openLesson, lessonMedia, saveProgress, applyProgress, resolveMedia, lessonContext }
}
