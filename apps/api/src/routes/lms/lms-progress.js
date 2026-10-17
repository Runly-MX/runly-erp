// One place where a lesson outcome lands: lesson progress, course progress and
// enrollment completion. Used by the progress endpoint and every evaluator.
import { progressPct } from './lms-core.js'

// Interactive transactions on a remote database need more than the 5 s default.
export const TX_OPTS = { maxWait: 10_000, timeout: 30_000 }

// db: prisma or a transaction client. enrollment: the stored row.
// fields: extra progress columns (video position); touch: extra enrollment columns.
export async function setLessonOutcome(db, { enrollment, lessonId, status, fields = {}, touch = {}, now = new Date() }) {
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
    db.lmsLesson.findMany({ where: { courseId: enrollment.courseId, enabled: true }, select: { id: true, required: true, enabled: true } }),
    db.lmsLessonProgress.findMany({ where: { enrollmentId: enrollment.id, status: 'completed' }, select: { lessonId: true } }),
  ])
  const pct = progressPct(lessons, new Set(done.map((row) => row.lessonId)))
  const update = { progressPct: pct, ...touch }
  if (pct >= 100 && enrollment.status === 'active') Object.assign(update, { status: 'completed', completedAt: enrollment.completedAt ?? now })
  const updated = await db.lmsEnrollment.update({ where: { id: enrollment.id }, data: update, include: { learner: true } })
  return { lessonStatus, enrollment: updated }
}
