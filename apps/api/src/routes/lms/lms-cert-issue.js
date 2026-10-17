// Certificate issue, shared by setLessonOutcome (automatic), reactivation and
// the manual endpoint. Must run inside a transaction: the folio sequence is
// guarded by a per-company advisory lock that lasts until commit.
import { certificateHours, formatFolio, newToken, nextSequence } from './lms-cert-core.js'
import { normalizeShareSettings } from './lms-share-core.js'

// tx: transaction client. enrollment: stored row (id, companyId, courseId, learnerId, status).
// Returns { certificate, created } or null when the course has no usable template.
export async function issueCertificate(tx, { enrollment, issuedById = null, now = new Date() }) {
  if (!enrollment || enrollment.status !== 'completed') return null
  const course = await tx.lmsCourse.findUnique({
    where: { id: enrollment.courseId },
    select: { title: true, estimatedMinutes: true, certificateTemplateId: true, shareSettings: true, certificateTemplate: { select: { id: true, enabled: true } } },
  })
  if (!course?.certificateTemplate?.enabled) return null
  // Share-link guests only when the link settings issue certificates (name = guest displayName).
  if (enrollment.source === 'share' && !normalizeShareSettings(course.shareSettings).issueCertificates) return null

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`lms_cert:${enrollment.companyId}`}))::text AS locked`
  const existing = await tx.lmsCertificate.findFirst({ where: { enrollmentId: enrollment.id, revokedAt: null } })
  if (existing) return { certificate: existing, created: false }

  const year = now.getFullYear()
  const [last, learner, lessons] = await Promise.all([
    tx.lmsCertificate.findFirst({ where: { companyId: enrollment.companyId, folio: { startsWith: `${year}-` } }, orderBy: { folio: 'desc' }, select: { folio: true } }),
    tx.lmsLearner.findUnique({ where: { id: enrollment.learnerId }, select: { displayName: true } }),
    course.estimatedMinutes === null
      ? tx.lmsLesson.findMany({ where: { courseId: enrollment.courseId, enabled: true }, select: { durationSeconds: true } })
      : [],
  ])
  const certificate = await tx.lmsCertificate.create({
    data: {
      companyId: enrollment.companyId,
      enrollmentId: enrollment.id,
      learnerId: enrollment.learnerId,
      courseId: enrollment.courseId,
      templateId: course.certificateTemplate.id,
      folio: formatFolio(year, nextSequence(last?.folio, year)),
      token: newToken(),
      learnerName: learner?.displayName ?? 'Alumno',
      courseTitle: course.title,
      hours: certificateHours({ estimatedMinutes: course.estimatedMinutes, lessonDurationsSeconds: lessons.map((row) => row.durationSeconds) }),
      issuedAt: now,
      issuedById,
    },
  })
  return { certificate, created: true }
}

const TX = { maxWait: 10_000, timeout: 30_000 }

// Enrollment update that may turn it completed (reactivating a dropped learner who
// had finished): the certificate is issued in the same transaction when due.
export async function updateEnrollmentWithCertificate(prisma, { id, data, include = undefined, issue = issueCertificate }) {
  if (data.status !== 'completed') return prisma.lmsEnrollment.update({ where: { id }, data, include })
  return prisma.$transaction(async (tx) => {
    const row = await tx.lmsEnrollment.update({ where: { id }, data, include })
    const issued = await issue(tx, { enrollment: row })
    // Re-read so an included certificate list shows the new one.
    return issued?.created && include ? tx.lmsEnrollment.findUnique({ where: { id }, include }) : row
  }, TX)
}
