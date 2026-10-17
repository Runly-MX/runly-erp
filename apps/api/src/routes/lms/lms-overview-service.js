// runly.lms course page (/course/:courseId): everything the landing-style page
// needs in one read — course, curriculum, counts, instructor, rating and the
// caller's enrollment and certificate.
import { LmsError } from './lms-error.js'
import { isUuid } from './lms-eval-shared.js'
import { COURSE_COUNTS, ENROLLMENT_INCLUDE, createLmsSerializers } from './lms-serialize.js'
import { isOpenPreview } from './lms-share-core.js'
import { loadPromo } from './lms-promo.js'

const SECTIONS_ORDERED = {
  orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  include: { lessons: { where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
}

// Lesson thumbnails: aspect-preserving 256 px (sharp at 2x in the 16:9 rows).
export const LESSON_THUMB_VARIANT = 'tilefit'

// { lessonCount, totalSeconds } over serialized sections.
export function summarizeCurriculum(sections = []) {
  let lessonCount = 0
  let totalSeconds = 0
  for (const section of sections) {
    for (const lesson of section.lessons ?? []) {
      lessonCount += 1
      const seconds = Number(lesson.durationSeconds)
      if (Number.isFinite(seconds) && seconds > 0) totalSeconds += Math.round(seconds)
    }
  }
  return { lessonCount, totalSeconds }
}

// Who may see the page: managers always; others only published courses, or an
// archived one they are (or were) enrolled in.
export function canViewCourse(course, { canManage = false, enrolled = false } = {}) {
  if (canManage) return true
  if (course.status === 'published') return true
  return course.status === 'archived' && enrolled
}

export function profileDisplayName(profile) {
  if (!profile) return null
  return profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null
}

export function createLmsOverviewService({ prisma, signFile = null, resolveMedia = null }) {
  const ser = createLmsSerializers({ prisma, signFile })
  const sign = (fileId, variant) => (signFile && fileId ? signFile(fileId, variant) : null)

  async function callerEnrollment(companyId, userProfileId, courseId) {
    if (!userProfileId) return null
    const learner = await prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId } } })
    if (!learner) return null
    return prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId, learnerId: learner.id } }, include: ENROLLMENT_INCLUDE })
  }

  async function instructorOf(createdById) {
    if (!createdById) return null
    const profile = await prisma.userProfile.findUnique({
      where: { id: createdById },
      select: { id: true, displayName: true, firstName: true, lastName: true, avatarFileId: true, isBot: true },
    })
    if (!profile || profile.isBot) return null
    return { id: profile.id, displayName: profileDisplayName(profile), avatarUrl: await sign(profile.avatarFileId, 'thumb') }
  }

  async function overview(companyId, userProfileId, courseId, { canManage = false } = {}) {
    const course = isUuid(courseId) ? await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true }, include: COURSE_COUNTS }) : null
    if (!course) throw new LmsError('El curso no existe.', 404)
    const enrollmentRow = await callerEnrollment(companyId, userProfileId, course.id)
    const enrolled = Boolean(enrollmentRow && enrollmentRow.status !== 'dropped')
    if (!canViewCourse(course, { canManage, enrolled })) throw new LmsError('El curso no existe.', 404)

    const [sectionRows, instructor, serialized, heroUrl, promo] = await Promise.all([
      prisma.lmsSection.findMany({ where: { courseId: course.id }, ...SECTIONS_ORDERED }),
      instructorOf(course.createdById),
      ser.serializeCourse(course),
      sign(course.coverFileId, 'preview'),
      loadPromo(prisma, course, resolveMedia),
    ])
    const sections = await Promise.all(sectionRows.map(async (section) => ({
      id: section.id,
      title: section.title,
      free: section.free === true,
      lessons: await Promise.all(section.lessons.map(async (lesson) => ({
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        durationSeconds: lesson.durationSeconds,
        required: lesson.required,
        preview: lesson.preview === true,
        // Opens without enrolling (free section or preview lesson; never quizzes/assignments).
        free: isOpenPreview({ ...lesson, sectionFree: section.free === true }),
        coverUrl: await sign(lesson.coverFileId, LESSON_THUMB_VARIANT),
      }))),
    })))
    const { lessonCount, totalSeconds } = summarizeCurriculum(sections)
    const enrollment = enrollmentRow ? ser.serializeEnrollment(enrollmentRow) : null
    const certificate = enrollment?.certificate && !enrollment.certificate.revokedAt ? enrollment.certificate : null
    return {
      course: { ...serialized, heroUrl: heroUrl ?? serialized.coverUrl },
      sections,
      counts: { sections: sections.length, lessons: lessonCount, totalSeconds, learners: course._count?.enrollments ?? 0 },
      instructor,
      promo,
      rating: { avg: serialized.ratingAvg, count: serialized.ratingCount },
      enrollment,
      certificate,
      canManage,
      canEnroll: course.status === 'published' && course.selfEnroll && !enrolled,
    }
  }

  return { overview }
}
