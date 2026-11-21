// runly.lms standalone evaluations, authoring side (spec 2026-11-21): the
// evaluation (an lms_course row with kind 'assessment') and its activities
// (lms_lesson rows without a section). Questions and resources keep using the
// lesson-id routes of the quiz and resources services.
import { ASSESSMENT_ONLY, COURSE_STATUSES, LmsError, normalizeCourseInput, normalizeLessonInput } from './lms-core.js'
import { activityDraft, activityMaxPoints, assessmentMaxPoints, mergeAssessmentSettings, publishProblems, readAssessmentSettings } from './lms-assessment-core.js'
import { createLmsSerializers } from './lms-serialize.js'

const COUNTS = { _count: { select: { enrollments: { where: { status: { not: 'dropped' } } } } } }
const ACTIVITY_ORDER = [{ position: 'asc' }, { createdAt: 'asc' }]
const ASSESSMENT_FIELDS = ['title', 'summary', 'description', 'status']
const iso = (value) => (value ? new Date(value).toISOString() : null)
const pick = (body, keys) => Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(body ?? {}, key)).map((key) => [key, body[key]]))

export function createLmsAssessmentService({ prisma, signFile = null, learners = null, sessions = null }) {
  const ser = createLmsSerializers({ prisma, signFile })

  async function findAssessment(companyId, id) {
    const row = await prisma.lmsCourse.findFirst({ where: { id, companyId, enabled: true, ...ASSESSMENT_ONLY }, include: COUNTS })
    if (!row) throw new LmsError('La evaluación no existe.', 404)
    return row
  }

  async function findActivity(companyId, id) {
    const lesson = await prisma.lmsLesson.findFirst({ where: { id, companyId, enabled: true, sectionId: null } })
    if (!lesson) throw new LmsError('La actividad no existe.', 404)
    await findAssessment(companyId, lesson.courseId)
    return lesson
  }

  const activityRows = (courseIds) => prisma.lmsLesson.findMany({ where: { courseId: { in: courseIds }, enabled: true, sectionId: null }, orderBy: ACTIVITY_ORDER })

  // Per activity: question count and points (quizzes), resource count.
  async function activityStats(lessonIds) {
    if (!lessonIds.length) return { questions: new Map(), resources: new Map() }
    const [questions, resources] = await Promise.all([
      prisma.lmsQuizQuestion.groupBy({ by: ['lessonId'], where: { lessonId: { in: lessonIds }, enabled: true }, _count: { _all: true }, _sum: { points: true } }),
      prisma.lmsLessonResource.groupBy({ by: ['lessonId'], where: { lessonId: { in: lessonIds } }, _count: { _all: true } }),
    ])
    return {
      questions: new Map(questions.map((row) => [row.lessonId, { questionCount: row._count._all, questionPoints: row._sum.points ?? 0 }])),
      resources: new Map(resources.map((row) => [row.lessonId, row._count._all])),
    }
  }

  async function serializeActivities(rows) {
    const stats = await activityStats(rows.map((row) => row.id))
    return Promise.all(rows.map(async (row) => {
      const q = stats.questions.get(row.id) ?? { questionCount: 0, questionPoints: 0 }
      return {
        ...(await ser.serializeLesson(row)),
        questionCount: q.questionCount,
        maxPoints: activityMaxPoints(row, q),
        resourceCount: stats.resources.get(row.id) ?? 0,
      }
    }))
  }

  function assessmentShape(row, activities) {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      description: row.description,
      coverFileId: row.coverFileId,
      status: row.status,
      settings: readAssessmentSettings(row.settings),
      activityCount: activities.length,
      maxPoints: assessmentMaxPoints(activities.map((activity) => activity.maxPoints)),
      participantCount: row._count?.enrollments ?? 0,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }
  }

  async function serializeMany(rows) {
    const all = await serializeActivities(await activityRows(rows.map((row) => row.id)))
    return rows.map((row) => assessmentShape(row, all.filter((activity) => activity.courseId === row.id)))
  }

  async function detail(row) {
    const activities = await serializeActivities(await activityRows([row.id]))
    return { assessment: assessmentShape(row, activities), activities }
  }

  const touch = (id) => prisma.lmsCourse.update({ where: { id }, data: { updatedAt: new Date() } })

  // ---- evaluations ----------------------------------------------------------
  async function list(companyId, query = {}) {
    const where = { companyId, enabled: true, ...ASSESSMENT_ONLY }
    if (COURSE_STATUSES.includes(query.status)) where.status = query.status
    return serializeMany(await prisma.lmsCourse.findMany({ where, include: COUNTS, orderBy: { updatedAt: 'desc' } }))
  }

  async function create(companyId, actorId, body = {}) {
    const data = normalizeCourseInput(pick(body, ['title', 'summary', 'description']), { partial: false })
    const settings = mergeAssessmentSettings(body.settings, {})
    const row = await prisma.lmsCourse.create({
      data: { ...data, settings, kind: 'assessment', status: 'draft', companyId, createdById: actorId },
      include: COUNTS,
    })
    return (await detail(row)).assessment
  }

  const get = async (companyId, id) => detail(await findAssessment(companyId, id))

  async function update(companyId, id, body = {}) {
    const current = await findAssessment(companyId, id)
    const data = normalizeCourseInput(pick(body, ASSESSMENT_FIELDS), { partial: true })
    if (body.settings !== undefined) data.settings = mergeAssessmentSettings(body.settings, current.settings)
    if (data.status === 'published' && current.status !== 'published') {
      const { activities } = await detail(current)
      const problems = publishProblems(activities)
      if (problems.length) throw new LmsError(`No se puede publicar: ${problems.join(' ')}`, 409, 'NOT_READY')
    }
    const row = await prisma.lmsCourse.update({ where: { id: current.id }, data, include: COUNTS })
    return detail(row)
  }

  async function archive(companyId, id) {
    const current = await findAssessment(companyId, id)
    const row = await prisma.lmsCourse.update({ where: { id: current.id }, data: { status: 'archived' }, include: COUNTS })
    return (await detail(row)).assessment
  }

  // ---- activities -----------------------------------------------------------
  async function createActivity(companyId, assessmentId, body = {}) {
    const assessment = await findAssessment(companyId, assessmentId)
    const { kind, settings } = activityDraft(body)
    const { sectionId: _ignored, preview: _preview, ...data } = normalizeLessonInput({ ...pick(body, ['title', 'body']), kind, settings }, { partial: false })
    const max = await prisma.lmsLesson.aggregate({ where: { courseId: assessment.id, enabled: true, sectionId: null }, _max: { position: true } })
    const row = await prisma.lmsLesson.create({
      data: { ...data, companyId, courseId: assessment.id, sectionId: null, required: true, position: (max._max.position ?? 0) + 1 },
    })
    await touch(assessment.id)
    return (await serializeActivities([row]))[0]
  }

  // Title, instructions and settings; the kind is fixed once created.
  async function updateActivity(companyId, activityId, body = {}) {
    const activity = await findActivity(companyId, activityId)
    if (body.kind !== undefined && body.kind !== activity.kind) throw new LmsError('El tipo de una actividad no se puede cambiar.', 409, 'KIND_LOCKED')
    const input = pick(body, ['title', 'body'])
    if (body.settings !== undefined) input.settings = { ...(activity.settings ?? {}), ...(body.settings ?? {}) }
    const data = normalizeLessonInput(input, { partial: true, currentKind: activity.kind })
    const row = await prisma.lmsLesson.update({ where: { id: activity.id }, data })
    await touch(activity.courseId)
    return (await serializeActivities([row]))[0]
  }

  // Soft delete: attempts and submissions keep pointing at it.
  async function deleteActivity(companyId, activityId) {
    const activity = await findActivity(companyId, activityId)
    await prisma.lmsLesson.update({ where: { id: activity.id }, data: { enabled: false } })
    await touch(activity.courseId)
    return { id: activity.id }
  }

  async function reorderActivities(companyId, assessmentId, body = {}) {
    const assessment = await findAssessment(companyId, assessmentId)
    const ids = Array.isArray(body?.activityIds) ? body.activityIds.map(String) : null
    const rows = await activityRows([assessment.id])
    const known = new Set(rows.map((row) => row.id))
    if (!ids || ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
      throw new LmsError('Envía el orden completo de las actividades.', 400)
    }
    await prisma.$transaction([
      ...ids.map((id, index) => prisma.lmsLesson.update({ where: { id }, data: { position: index + 1 } })),
      prisma.lmsCourse.update({ where: { id: assessment.id }, data: { updatedAt: new Date() } }),
    ])
    return (await detail(await findAssessment(companyId, assessment.id))).activities
  }

  // ---- participants (internal users; share-link guests arrive in phase 4) ----
  // learners: the authoring service (ensureLearnerForProfile). sessions: the
  // session service, so this view closes expired sessions before listing them.
  async function listParticipants(companyId, assessmentId) {
    const assessment = await findAssessment(companyId, assessmentId)
    if (sessions) await sessions.sweepExpired({ courseId: assessment.id })
    const rows = await prisma.lmsEnrollment.findMany({
      where: { courseId: assessment.id, companyId },
      include: { learner: true, sessions: { orderBy: { number: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => ({
      enrollmentId: row.id,
      status: row.status,
      learner: { id: row.learner.id, displayName: row.learner.displayName, email: row.learner.email, kind: row.learner.userProfileId ? 'user' : row.learner.contactId ? 'contact' : 'guest' },
      sessions: row.sessions.map((s) => ({
        id: s.id, number: s.number, status: s.status, startedAt: iso(s.startedAt), expiresAt: iso(s.expiresAt), submittedAt: iso(s.submittedAt),
        closedReason: s.closedReason, scorePoints: s.scorePoints, maxPoints: s.maxPoints,
      })),
    }))
  }

  async function assignParticipants(companyId, actorId, assessmentId, body = {}) {
    const assessment = await findAssessment(companyId, assessmentId)
    if (assessment.status === 'archived') throw new LmsError('La evaluación está archivada.', 409)
    if (!learners) throw new LmsError('No disponible.', 503)
    const ids = Array.isArray(body?.userProfileIds) ? [...new Set(body.userProfileIds.map(String))] : []
    if (!ids.length) throw new LmsError('Selecciona al menos una persona.', 400)
    if (ids.length > 500) throw new LmsError('Agrega como máximo 500 personas a la vez.', 400)
    const result = { created: 0, reactivated: 0, skipped: 0 }
    for (const userProfileId of ids) {
      const learner = await learners.ensureLearnerForProfile(companyId, userProfileId)
      const existing = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: assessment.id, learnerId: learner.id } } })
      if (!existing) {
        await prisma.lmsEnrollment.create({ data: { companyId, courseId: assessment.id, learnerId: learner.id, source: 'assigned', assignedById: actorId } })
        result.created += 1
      } else if (existing.status === 'dropped') {
        await prisma.lmsEnrollment.update({ where: { id: existing.id }, data: { status: 'active', source: 'assigned', assignedById: actorId } })
        result.reactivated += 1
      } else result.skipped += 1
    }
    return result
  }

  return {
    list, create, get, update, archive, createActivity, updateActivity, deleteActivity, reorderActivities, findAssessment, findActivity,
    listParticipants, assignParticipants,
  }
}
