// One place where a lesson outcome lands: lesson progress, course progress and
// enrollment completion. Used by the progress endpoint and every evaluator.
import { progressPct } from './lms-core.js'
import { issueCertificate } from './lms-cert-issue.js'
import { isSharedLesson, normalizeShareSettings } from './lms-share-core.js'

// Interactive transactions on a remote database need more than the 5 s default.
export const TX_OPTS = { maxWait: 10_000, timeout: 30_000 }

// Root-client entry point: opens the transaction so completion and the
// certificate commit together. Never call it with a transaction client.
export function recordLessonOutcome(prisma, args) {
  return prisma.$transaction((tx) => setLessonOutcome(tx, args), TX_OPTS)
}

// db: a transaction client (Prisma 7 transaction clients also expose $transaction,
// so the caller decides; see recordLessonOutcome). enrollment: the stored row.
// fields: extra progress columns (video position); touch: extra enrollment columns.
async function sharedOnly(db, courseId, lessons) {
  const course = await db.lmsCourse.findUnique({ where: { id: courseId }, select: { shareSettings: true } })
  const settings = normalizeShareSettings(course?.shareSettings)
  return lessons.filter((lesson) => isSharedLesson({ ...lesson, sectionFree: lesson.section?.free === true }, settings))
}

export async function setLessonOutcome(db, args) {
  const { enrollment, lessonId, status, fields = {}, touch = {}, now = new Date(), issue = issueCertificate } = args
  const key = { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } }
  const previous = await db.lmsLessonProgress.findUnique({ where: key })
  // A completed lesson is never downgraded.
  const lessonStatus = previous?.status === 'completed' ? 'completed' : status
  const data = { ...fields, status: lessonStatus, completedAt: lessonStatus === 'completed' ? previous?.completedAt ?? now : null }
  await db.lmsLessonProgress.upsert({
    where: key,
    create: { companyId: enrollment.companyId, enrollmentId: enrollment.id, lessonId, ...data },
    update: data,
  })

  const [lessons, done] = await Promise.all([
    db.lmsLesson.findMany({ where: { courseId: enrollment.courseId, enabled: true }, select: { id: true, required: true, enabled: true, kind: true, preview: true, section: { select: { free: true } } } }),
    db.lmsLessonProgress.findMany({ where: { enrollmentId: enrollment.id, status: 'completed' }, select: { lessonId: true } }),
  ])
  // Guests (share link) progress over the lessons the link shares.
  const counted = enrollment.source === 'share' ? await sharedOnly(db, enrollment.courseId, lessons) : lessons
  const pct = progressPct(counted, new Set(done.map((row) => row.lessonId)))
  const update = { progressPct: pct, ...touch }
  const completes = pct >= 100 && enrollment.status === 'active'
  if (completes) Object.assign(update, { status: 'completed', completedAt: enrollment.completedAt ?? now })
  const updated = await db.lmsEnrollment.update({ where: { id: enrollment.id }, data: update, include: { learner: true } })
  // Automatic certificate the moment the enrollment turns completed (no-op without a template).
  // issueCertificate decides for share-link guests (share_settings.issueCertificates).
  const issued = completes ? await issue(db, { enrollment: { ...enrollment, ...updated }, now }) : null
  return { lessonStatus, enrollment: updated, certificate: issued?.certificate ?? null }
}
