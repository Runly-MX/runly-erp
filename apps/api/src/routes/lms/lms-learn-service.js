// runly.lms learner side: catalog, my courses, self-enrollment, course outline,
// lesson open and progress. The learner is always the current user profile.
import { EVALUATED_KINDS, LmsError, lessonStates, orderLessons, shouldAutoComplete } from './lms-core.js'
import { normalizeLessonSettings } from './lms-eval-core.js'
import { COURSE_COUNTS, createLmsSerializers } from './lms-serialize.js'
import { createLmsService } from './lms-service.js'
import { setLessonOutcome } from './lms-progress.js'

const OPEN_STATUSES = ['active', 'completed']
const MANUAL_COMPLETE_KINDS = new Set(['text', 'file', 'embed'])
const SECTIONS_ORDERED = {
  orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  include: { lessons: { where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
}

export function createLmsLearnService({ prisma, signFile = null, authoring = null }) {
  const ser = createLmsSerializers({ prisma, signFile })
  const learners = authoring ?? createLmsService({ prisma, signFile })

  const findLearner = (companyId, userProfileId) => prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId } } })

  async function openEnrollment(companyId, userProfileId, courseId) {
    const learner = await findLearner(companyId, userProfileId)
    if (!learner) return null
    const row = await prisma.lmsEnrollment.findFirst({ where: { companyId, courseId, learnerId: learner.id, status: { in: OPEN_STATUSES } }, include: { learner: true } })
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
      ? await prisma.lmsEnrollment.findMany({ where: { companyId, learnerId: learner.id, courseId: { in: rows.map((r) => r.id) } }, include: { learner: true } })
      : []
    const byCourse = new Map(enrollments.map((e) => [e.courseId, ser.serializeEnrollment(e)]))
    return courses.map((course) => ({ ...course, enrollment: byCourse.get(course.id) ?? null }))
  }

  async function myCourses(companyId, userProfileId) {
    const learner = await findLearner(companyId, userProfileId)
    if (!learner) return { active: [], completed: [] }
    const rows = await prisma.lmsEnrollment.findMany({
      where: { companyId, learnerId: learner.id, status: { in: OPEN_STATUSES }, course: { enabled: true, status: { in: ['published', 'archived'] } } },
      include: { learner: true, course: { include: COURSE_COUNTS } },
      orderBy: { updatedAt: 'desc' },
    })
    const courses = await ser.serializeCourses(rows.map((row) => row.course))
    const now = new Date()
    const items = rows.map((row, index) => ({ course: courses[index], enrollment: ser.serializeEnrollment(row, now) }))
    // Active: due soonest first, then most recently touched.
    const active = items.filter((item) => item.enrollment.status === 'active')
      .sort((a, b) => (a.enrollment.dueAt ? Date.parse(a.enrollment.dueAt) : Infinity) - (b.enrollment.dueAt ? Date.parse(b.enrollment.dueAt) : Infinity))
    return { active, completed: items.filter((item) => item.enrollment.status === 'completed') }
  }

  async function enroll(companyId, userProfileId, courseId) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true } })
    if (!course) throw new LmsError('El curso no existe.', 404)
    if (course.status !== 'published' || !course.selfEnroll) throw new LmsError('Este curso no admite inscripción libre.', 409, 'NOT_SELF_ENROLL')
    const learner = await learners.ensureLearnerForProfile(companyId, userProfileId)
    const existing = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } }, include: { learner: true } })
    if (existing && existing.status !== 'dropped') return ser.serializeEnrollment(existing)
    const row = existing
      ? await prisma.lmsEnrollment.update({ where: { id: existing.id }, data: { status: existing.completedAt ? 'completed' : 'active', source: 'self' }, include: { learner: true } })
      : await prisma.lmsEnrollment.create({ data: { companyId, courseId: course.id, learnerId: learner.id, source: 'self' }, include: { learner: true } })
    return ser.serializeEnrollment(row)
  }

  // Loads the course with ordered lessons, the caller's enrollment and progress,
  // and the per-lesson state. Throws when the caller may not view the course.
  async function loadContext(companyId, userProfileId, courseId, { canManage }) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true }, include: COURSE_COUNTS })
    if (!course) throw new LmsError('El curso no existe.', 404)
    const enrollment = await openEnrollment(companyId, userProfileId, course.id)
    if (!enrollment && !canManage) throw new LmsError('No estás inscrito en este curso.', 403, 'NOT_ENROLLED')
    if (course.status === 'draft' && !canManage) throw new LmsError('El curso no existe.', 404)
    const sections = await prisma.lmsSection.findMany({ where: { courseId: course.id }, ...SECTIONS_ORDERED })
    const lessons = orderLessons(sections)
    const progressRows = enrollment ? await prisma.lmsLessonProgress.findMany({ where: { enrollmentId: enrollment.id } }) : []
    const progressById = new Map(progressRows.map((row) => [row.lessonId, row]))
    const states = lessonStates(lessons, progressById, { sequential: course.sequential, locked: Boolean(enrollment) })
    return { course, enrollment, sections, lessons, progressById, states }
  }

  async function outline(companyId, userProfileId, courseId, { canManage = false } = {}) {
    const ctx = await loadContext(companyId, userProfileId, courseId, { canManage })
    return {
      course: await ser.serializeCourse(ctx.course),
      enrollment: ctx.enrollment ? ser.serializeEnrollment(ctx.enrollment) : null,
      sections: ctx.sections.map((section) => ({
        id: section.id,
        title: section.title,
        lessons: section.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind,
          durationSeconds: lesson.durationSeconds,
          required: lesson.required,
          status: ctx.states.get(lesson.id) ?? 'available',
          positionSeconds: ctx.progressById.get(lesson.id)?.positionSeconds ?? 0,
        })),
      })),
    }
  }

  async function lessonContext(companyId, userProfileId, lessonId, { canManage }) {
    const lesson = await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, enabled: true } })
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    const ctx = await loadContext(companyId, userProfileId, lesson.courseId, { canManage })
    if (ctx.states.get(lesson.id) === 'locked') throw new LmsError('Completa las lecciones anteriores para abrir esta.', 409, 'LOCKED')
    return { ...ctx, lesson }
  }

  async function openLesson(companyId, userProfileId, lessonId, { canManage = false } = {}) {
    const ctx = await lessonContext(companyId, userProfileId, lessonId, { canManage })
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
    const withMedia = lesson.kind === 'video' || lesson.kind === 'file'
    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        body: lesson.body,
        embedUrl: lesson.embedUrl,
        durationSeconds: lesson.durationSeconds,
        settings: normalizeLessonSettings(lesson.kind, lesson.settings),
        mediaUrl: withMedia ? await ser.sign(lesson.fileId, 'full') : null,
        fileName: lesson.fileId ? names.get(lesson.fileId) ?? null : null,
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
    const ctx = await lessonContext(companyId, userProfileId, lessonId, { canManage: false })
    const { lesson, enrollment, course } = ctx
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
    const result = await setLessonOutcome(prisma, {
      enrollment,
      lessonId: lesson.id,
      status: complete ? 'completed' : idle,
      fields: { positionSeconds: position ?? previous?.positionSeconds ?? 0, maxPositionSeconds },
      touch: { lastLessonId: lesson.id, ...(enrollment.startedAt ? {} : { startedAt: now }) },
      now,
    })
    return { lessonStatus: result.lessonStatus, enrollment: ser.serializeEnrollment(result.enrollment) }
  }

  return { catalog, myCourses, enroll, outline, openLesson, saveProgress, lessonContext }
}
