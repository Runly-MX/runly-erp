// Shared loaders and serializers for runly.lms (authoring and learner views).
import { isOverdue } from './lms-core.js'
import { normalizeLessonSettings } from './lms-eval-core.js'

export const COURSE_COUNTS = {
  _count: { select: { sections: true, enrollments: { where: { status: { not: 'dropped' } } } } },
}

const iso = (value) => (value ? new Date(value).toISOString() : null)

// Latest certificate of an enrollment (a re-issue is newer than the revoked one).
export const ENROLLMENT_CERT = { certificates: { orderBy: { issuedAt: 'desc' }, take: 1, select: { id: true, folio: true, revokedAt: true } } }
export const ENROLLMENT_INCLUDE = { learner: true, ...ENROLLMENT_CERT }

export function enrollmentCertificate(row) {
  const cert = Array.isArray(row?.certificates) ? row.certificates[0] : null
  return cert ? { id: cert.id, folio: cert.folio, revokedAt: iso(cert.revokedAt) } : null
}

export function createLmsSerializers({ prisma, signFile = null }) {
  const sign = async (fileId, variant) => (signFile && fileId ? signFile(fileId, variant) : null)

  async function lessonCounts(courseIds) {
    if (!courseIds.length) return new Map()
    const rows = await prisma.lmsLesson.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds }, enabled: true }, _count: { _all: true } })
    return new Map(rows.map((row) => [row.courseId, row._count._all]))
  }

  async function fileNames(fileIds) {
    const ids = [...new Set(fileIds.filter(Boolean))]
    if (!ids.length) return new Map()
    const rows = await prisma.fileAsset.findMany({ where: { id: { in: ids } }, select: { id: true, originalName: true } })
    return new Map(rows.map((row) => [row.id, row.originalName]))
  }

  function courseShape(row, lessonCount, coverUrl) {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      description: row.description,
      coverFileId: row.coverFileId,
      coverUrl,
      category: row.category,
      level: row.level,
      status: row.status,
      visibility: row.visibility,
      sequential: row.sequential,
      selfEnroll: row.selfEnroll,
      estimatedMinutes: row.estimatedMinutes,
      sectionCount: row._count?.sections ?? 0,
      lessonCount,
      enrollmentCount: row._count?.enrollments ?? 0,
      ratingAvg: row.ratingAvg === null || row.ratingAvg === undefined ? null : Number(row.ratingAvg),
      ratingCount: row.ratingCount ?? 0,
      certificateTemplateId: row.certificateTemplateId ?? null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }
  }

  // rows must include COURSE_COUNTS.
  async function serializeCourses(rows) {
    const counts = await lessonCounts(rows.map((row) => row.id))
    return Promise.all(rows.map(async (row) => courseShape(row, counts.get(row.id) ?? 0, await sign(row.coverFileId, 'preview'))))
  }

  async function serializeCourse(row) {
    return (await serializeCourses([row]))[0]
  }

  // Lesson thumbnail (card variant); a signing failure only hides the image.
  const lessonCoverUrl = (row) => (row.coverFileId ? sign(row.coverFileId, 'tilefit').catch(() => null) : null)

  function lessonShape(row, names, coverUrl = null) {
    return {
      id: row.id,
      courseId: row.courseId,
      sectionId: row.sectionId,
      title: row.title,
      kind: row.kind,
      body: row.body,
      fileId: row.fileId,
      fileName: row.fileId ? names.get(row.fileId) ?? null : null,
      coverFileId: row.coverFileId ?? null,
      coverUrl,
      embedUrl: row.embedUrl,
      durationSeconds: row.durationSeconds,
      position: row.position,
      required: row.required,
      settings: normalizeLessonSettings(row.kind, row.settings),
      enabled: row.enabled,
    }
  }

  async function serializeLesson(row) {
    return lessonShape(row, await fileNames([row.fileId]), await lessonCoverUrl(row))
  }

  // sections include lessons (enabled only, ordered).
  async function serializeSections(sections) {
    const names = await fileNames(sections.flatMap((section) => section.lessons.map((lesson) => lesson.fileId)))
    return Promise.all(sections.map(async (section) => ({
      id: section.id,
      courseId: section.courseId,
      title: section.title,
      position: section.position,
      lessons: await Promise.all(section.lessons.map(async (lesson) => lessonShape(lesson, names, await lessonCoverUrl(lesson)))),
    })))
  }

  // row must include learner.
  function serializeEnrollment(row, now = new Date()) {
    return {
      id: row.id,
      courseId: row.courseId,
      learnerId: row.learnerId,
      learner: row.learner
        ? { id: row.learner.id, displayName: row.learner.displayName, email: row.learner.email, userProfileId: row.learner.userProfileId }
        : null,
      status: row.status,
      source: row.source,
      dueAt: iso(row.dueAt),
      overdue: isOverdue(row, now),
      startedAt: iso(row.startedAt),
      completedAt: iso(row.completedAt),
      progressPct: row.progressPct,
      lastLessonId: row.lastLessonId,
      certificate: enrollmentCertificate(row),
      createdAt: iso(row.createdAt),
    }
  }

  return { sign, lessonCoverUrl, fileNames, serializeCourses, serializeCourse, serializeLesson, serializeSections, serializeEnrollment }
}
