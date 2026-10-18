// runly.lms assignments, learner side: submission history, submit, and the
// learner upload flow for submission files. Share-link guests reuse it with
// their guest context in place of the profile id (see GUEST_OWNER).
import { LmsError } from './lms-core.js'
import { assignmentDueAt, normalizeAssignmentSettings, validateSubmission } from './lms-eval-core.js'
import { serializeSubmissions } from './lms-eval-shared.js'
import { SUBMISSION_UPLOAD } from './lms-media.js'
import { createLmsSerializers } from './lms-serialize.js'
import { setLessonOutcome, TX_OPTS } from './lms-progress.js'

const notAssignment = () => new LmsError('La lección no es una tarea.', 409, 'NOT_ASSIGNMENT')

// Who owns uploads and who acts, from the learner argument. Internal learners
// pass their profile id; guests have no profile, so their files carry
// metadata.guestLearnerId and notifications go out without an actor.
export const PROFILE_OWNER = {
  actorId: (profileId) => profileId,
  uploadedById: (profileId) => profileId,
  metadata: () => null,
  ownsFile: () => true,
}
export const GUEST_OWNER = {
  actorId: () => null,
  uploadedById: () => null,
  metadata: (guest) => ({ guestLearnerId: guest.learner.id }),
  ownsFile: (row, guest) => row.metadata?.guestLearnerId === guest.learner.id,
}

export function createLmsAssignmentService({ prisma, learn, media, notifier, signFile = null, owner = PROFILE_OWNER }) {
  const ser = createLmsSerializers({ prisma, signFile })

  async function assignmentContext(companyId, profileId, lessonId, { canManage = false, write = false } = {}) {
    const ctx = await learn.lessonContext(companyId, profileId, lessonId, { canManage: write ? false : canManage })
    if (ctx.lesson.kind !== 'assignment') throw notAssignment()
    if (write && ctx.course.status !== 'published') throw new LmsError('El curso no está disponible para entregar tareas.', 409, 'NOT_PUBLISHED')
    return { ...ctx, settings: normalizeAssignmentSettings(ctx.lesson.settings) }
  }

  const history = (enrollmentId, lessonId) => prisma.lmsSubmission.findMany({ where: { enrollmentId, lessonId }, orderBy: { number: 'desc' } })

  async function listSubmissions(companyId, profileId, lessonId, { canManage = false } = {}) {
    const { lesson, enrollment, settings, progressById } = await assignmentContext(companyId, profileId, lessonId, { canManage })
    const dueAt = assignmentDueAt(enrollment, settings)
    const rows = enrollment ? await history(enrollment.id, lesson.id) : []
    return {
      settings,
      dueAt: dueAt ? dueAt.toISOString() : null,
      lessonStatus: progressById.get(lesson.id)?.status ?? 'available',
      submissions: await serializeSubmissions(rows, ser),
    }
  }

  // Files must be confirmed LmsSubmission uploads of this learner in this company.
  async function assertOwnFiles(companyId, profileId, fileIds) {
    if (!fileIds.length) return
    const rows = await prisma.fileAsset.findMany({
      where: { id: { in: fileIds }, enabled: true, moduleKey: 'runly.lms', entityType: 'LmsSubmission', uploadedById: owner.uploadedById(profileId) },
      select: { id: true, metadata: true },
    })
    const ok = rows.filter((row) => row.metadata?.companyId === companyId && row.metadata?.pending !== true && owner.ownsFile(row, profileId))
    if (ok.length !== fileIds.length) throw new LmsError('Un archivo no existe o no terminó de subirse.', 400, 'INVALID_FILE')
  }

  async function submit(companyId, profileId, lessonId, body = {}) {
    const { lesson, enrollment, course, settings } = await assignmentContext(companyId, profileId, lessonId, { write: true })
    const [latest] = await history(enrollment.id, lesson.id)
    const { text, fileIds } = validateSubmission(body ?? {}, settings, latest ?? null)
    await assertOwnFiles(companyId, profileId, fileIds)
    const now = new Date()
    const dueAt = assignmentDueAt(enrollment, settings)
    let row
    let lessonStatus = 'pending_review'
    try {
      row = await prisma.$transaction(async (tx) => {
        const created = await tx.lmsSubmission.create({
          data: {
            companyId,
            enrollmentId: enrollment.id,
            lessonId: lesson.id,
            number: (latest?.number ?? 0) + 1,
            text,
            fileIds,
            submittedAt: now,
            late: Boolean(dueAt && now.getTime() > dueAt.getTime()),
          },
        })
        const outcome = await setLessonOutcome(tx, { enrollment, lessonId: lesson.id, status: 'pending_review', touch: { lastLessonId: lesson.id }, now })
        lessonStatus = outcome.lessonStatus
        return created
      }, TX_OPTS)
    } catch (error) {
      if (error?.code === 'P2002') throw new LmsError('Tu entrega anterior está pendiente de revisión.', 409, 'PENDING')
      throw error
    }
    await notifier.received({
      companyId,
      actorId: owner.actorId(profileId),
      course,
      lesson,
      learnerName: enrollment.learner?.displayName ?? 'Un alumno',
      type: 'submission',
      sourceId: row.id,
    })
    return { ...(await serializeSubmissions([row], ser))[0], lessonStatus }
  }

  const presignUpload = (companyId, profileId, body) => media.presign(companyId, owner.uploadedById(profileId), body, SUBMISSION_UPLOAD, owner.metadata(profileId))
  const confirmUpload = (companyId, profileId, fileId) => media.confirm(companyId, fileId, {
    entityType: SUBMISSION_UPLOAD.entityType,
    uploadedById: owner.uploadedById(profileId),
    ...(owner.metadata(profileId) ?? {}),
  })

  return { listSubmissions, submit, presignUpload, confirmUpload }
}
