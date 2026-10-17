// runly.lms authoring: courses, sections, lessons, ordering, learners and
// enrollments. Every query is scoped by companyId.
import { COURSE_STATUSES, LmsError, normalizeCourseInput, normalizeLessonInput } from './lms-core.js'
import { COURSE_COUNTS, createLmsSerializers } from './lms-serialize.js'

const LESSONS_ORDERED = { where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }
const SECTIONS_ORDERED = { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { lessons: LESSONS_ORDERED } }

function parseDueAt(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new LmsError('Fecha límite inválida.', 400)
  return date
}

export function createLmsService({ prisma, signFile = null }) {
  const ser = createLmsSerializers({ prisma, signFile })

  async function findCourse(companyId, courseId) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true }, include: COURSE_COUNTS })
    if (!course) throw new LmsError('El curso no existe.', 404)
    return course
  }

  async function findSection(companyId, sectionId) {
    const section = await prisma.lmsSection.findFirst({ where: { id: sectionId, companyId } })
    if (!section) throw new LmsError('La sección no existe.', 404)
    return section
  }

  async function findLesson(companyId, lessonId) {
    const lesson = await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, enabled: true } })
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    return lesson
  }

  async function assertFile(companyId, fileId) {
    if (!fileId) return
    const file = await prisma.fileAsset.findFirst({ where: { id: fileId, enabled: true }, select: { metadata: true } })
    if (!file || file.metadata?.companyId !== companyId) throw new LmsError('El archivo no existe.', 404)
    if (file.metadata?.pending === true) throw new LmsError('El archivo no terminó de subirse.', 409)
  }

  async function loadSections(courseId) {
    return ser.serializeSections(await prisma.lmsSection.findMany({ where: { courseId }, ...SECTIONS_ORDERED }))
  }

  // ---- courses ------------------------------------------------------------
  async function listCourses(companyId, query = {}) {
    const where = { companyId, enabled: true }
    if (COURSE_STATUSES.includes(query.status)) where.status = query.status
    const rows = await prisma.lmsCourse.findMany({ where, include: COURSE_COUNTS, orderBy: { updatedAt: 'desc' } })
    return ser.serializeCourses(rows)
  }

  async function createCourse(companyId, actorId, body) {
    const data = normalizeCourseInput(body, { partial: false })
    await assertFile(companyId, data.coverFileId)
    const row = await prisma.lmsCourse.create({ data: { ...data, status: 'draft', companyId, createdById: actorId }, include: COURSE_COUNTS })
    return ser.serializeCourse(row)
  }

  async function getCourse(companyId, courseId) {
    const course = await findCourse(companyId, courseId)
    return { course: await ser.serializeCourse(course), sections: await loadSections(course.id) }
  }

  async function updateCourse(companyId, courseId, body) {
    const current = await findCourse(companyId, courseId)
    const data = normalizeCourseInput(body, { partial: true })
    if (data.coverFileId) await assertFile(companyId, data.coverFileId)
    if (data.status === 'published' && current.status !== 'published') {
      const lessons = await prisma.lmsLesson.count({ where: { courseId, companyId, enabled: true } })
      if (!lessons) throw new LmsError('Agrega al menos una lección antes de publicar.', 409, 'EMPTY_COURSE')
    }
    const row = await prisma.lmsCourse.update({ where: { id: current.id }, data, include: COURSE_COUNTS })
    return ser.serializeCourse(row)
  }

  async function archiveCourse(companyId, courseId) {
    const current = await findCourse(companyId, courseId)
    const row = await prisma.lmsCourse.update({ where: { id: current.id }, data: { status: 'archived' }, include: COURSE_COUNTS })
    return ser.serializeCourse(row)
  }

  const touchCourse = (courseId) => prisma.lmsCourse.update({ where: { id: courseId }, data: { updatedAt: new Date() } })

  // ---- sections -----------------------------------------------------------
  function sectionTitle(body) {
    const title = String(body?.title ?? '').trim()
    if (!title) throw new LmsError('El título de la sección es obligatorio.', 400)
    if (title.length > 200) throw new LmsError('El título no puede pasar de 200 caracteres.', 400)
    return title
  }

  async function serializeSection(sectionId) {
    const row = await prisma.lmsSection.findUnique({ where: { id: sectionId }, include: { lessons: LESSONS_ORDERED } })
    return (await ser.serializeSections([row]))[0]
  }

  async function createSection(companyId, courseId, body) {
    const course = await findCourse(companyId, courseId)
    const title = sectionTitle(body)
    const max = await prisma.lmsSection.aggregate({ where: { courseId: course.id }, _max: { position: true } })
    const row = await prisma.lmsSection.create({ data: { companyId, courseId: course.id, title, position: (max._max.position ?? 0) + 1 } })
    await touchCourse(course.id)
    return serializeSection(row.id)
  }

  async function updateSection(companyId, sectionId, body) {
    const section = await findSection(companyId, sectionId)
    await prisma.lmsSection.update({ where: { id: section.id }, data: { title: sectionTitle(body) } })
    await touchCourse(section.courseId)
    return serializeSection(section.id)
  }

  async function deleteSection(companyId, sectionId) {
    const section = await findSection(companyId, sectionId)
    await prisma.lmsSection.delete({ where: { id: section.id } })
    await touchCourse(section.courseId)
    return { id: section.id }
  }

  // ---- lessons ------------------------------------------------------------
  async function nextLessonPosition(sectionId) {
    const max = await prisma.lmsLesson.aggregate({ where: { sectionId, enabled: true }, _max: { position: true } })
    return (max._max.position ?? 0) + 1
  }

  async function createLesson(companyId, sectionId, body) {
    const section = await findSection(companyId, sectionId)
    const { sectionId: _ignored, ...data } = normalizeLessonInput(body, { partial: false })
    await assertFile(companyId, data.fileId)
    const row = await prisma.lmsLesson.create({
      data: { ...data, companyId, courseId: section.courseId, sectionId: section.id, position: await nextLessonPosition(section.id) },
    })
    await touchCourse(section.courseId)
    return ser.serializeLesson(row)
  }

  async function updateLesson(companyId, lessonId, body) {
    const lesson = await findLesson(companyId, lessonId)
    const data = normalizeLessonInput(body, { partial: true, currentKind: lesson.kind })
    if (data.fileId) await assertFile(companyId, data.fileId)
    const kind = data.kind ?? lesson.kind
    const embedUrl = data.embedUrl !== undefined ? data.embedUrl : lesson.embedUrl
    if (kind === 'embed' && !embedUrl) throw new LmsError('Escribe el enlace del video.', 400)
    if (data.sectionId && data.sectionId !== lesson.sectionId) {
      const target = await findSection(companyId, data.sectionId)
      if (target.courseId !== lesson.courseId) throw new LmsError('La sección pertenece a otro curso.', 400)
      data.position = await nextLessonPosition(target.id)
    } else delete data.sectionId
    const row = await prisma.lmsLesson.update({ where: { id: lesson.id }, data })
    await touchCourse(lesson.courseId)
    return ser.serializeLesson(row)
  }

  async function deleteLesson(companyId, lessonId) {
    const lesson = await findLesson(companyId, lessonId)
    await prisma.lmsLesson.update({ where: { id: lesson.id }, data: { enabled: false } })
    await touchCourse(lesson.courseId)
    return { id: lesson.id }
  }

  async function reorder(companyId, courseId, body) {
    const course = await findCourse(companyId, courseId)
    const input = Array.isArray(body?.sections) ? body.sections : null
    if (!input) throw new LmsError('Envía el orden de las secciones.', 400)
    const [sections, lessons] = await Promise.all([
      prisma.lmsSection.findMany({ where: { courseId: course.id, companyId }, select: { id: true } }),
      prisma.lmsLesson.findMany({ where: { courseId: course.id, companyId, enabled: true }, select: { id: true } }),
    ])
    const sectionIds = new Set(sections.map((s) => s.id))
    const lessonIds = new Set(lessons.map((l) => l.id))
    const seenSections = new Set()
    const seenLessons = new Set()
    const updates = []
    input.forEach((entry, index) => {
      if (!sectionIds.has(entry?.id) || seenSections.has(entry.id)) throw new LmsError('Una sección no pertenece a este curso.', 400)
      seenSections.add(entry.id)
      updates.push(prisma.lmsSection.update({ where: { id: entry.id }, data: { position: index + 1 } }))
      const ids = Array.isArray(entry.lessonIds) ? entry.lessonIds : []
      ids.forEach((lessonId, lessonIndex) => {
        if (!lessonIds.has(lessonId) || seenLessons.has(lessonId)) throw new LmsError('Una lección no pertenece a este curso.', 400)
        seenLessons.add(lessonId)
        updates.push(prisma.lmsLesson.update({ where: { id: lessonId }, data: { sectionId: entry.id, position: lessonIndex + 1 } }))
      })
    })
    updates.push(prisma.lmsCourse.update({ where: { id: course.id }, data: { updatedAt: new Date() } }))
    await prisma.$transaction(updates)
    return { sections: await loadSections(course.id) }
  }

  // ---- learners and enrollments ------------------------------------------
  async function ensureLearnerForProfile(companyId, userProfileId) {
    const existing = await prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId } } })
    if (existing) return existing
    const profile = await prisma.userProfile.findFirst({
      where: { id: userProfileId, enabled: true, memberships: { some: { companyId, enabled: true } } },
      select: { id: true, displayName: true, firstName: true, lastName: true, email: true, isBot: true },
    })
    if (!profile || profile.isBot) throw new LmsError('El usuario no existe en esta empresa.', 404)
    const displayName = profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email
    return prisma.lmsLearner.upsert({
      where: { companyId_userProfileId: { companyId, userProfileId } },
      create: { companyId, userProfileId, displayName, email: profile.email },
      update: { displayName, email: profile.email },
    })
  }

  async function listEnrollments(companyId, courseId) {
    const course = await findCourse(companyId, courseId)
    const rows = await prisma.lmsEnrollment.findMany({ where: { courseId: course.id, companyId }, include: { learner: true }, orderBy: { createdAt: 'asc' } })
    // Quiz lessons with no attempts left, for "Otorgar intento extra".
    const failed = rows.length
      ? await prisma.lmsLessonProgress.findMany({
        where: { enrollmentId: { in: rows.map((row) => row.id) }, status: 'failed', lesson: { enabled: true } },
        select: { enrollmentId: true, lesson: { select: { id: true, title: true } } },
      })
      : []
    const failedBy = new Map()
    for (const row of failed) failedBy.set(row.enrollmentId, [...(failedBy.get(row.enrollmentId) ?? []), { id: row.lesson.id, title: row.lesson.title }])
    const now = new Date()
    return rows.map((row) => ({ ...ser.serializeEnrollment(row, now), failedLessons: failedBy.get(row.id) ?? [] }))
  }

  async function assign(companyId, actorId, courseId, body) {
    const course = await findCourse(companyId, courseId)
    if (course.status === 'archived') throw new LmsError('El curso está archivado.', 409)
    const ids = Array.isArray(body?.userProfileIds) ? [...new Set(body.userProfileIds.map(String))] : []
    if (!ids.length) throw new LmsError('Selecciona al menos un usuario.', 400)
    if (ids.length > 500) throw new LmsError('Asigna como máximo 500 usuarios a la vez.', 400)
    const dueAt = parseDueAt(body?.dueAt) ?? null
    const result = { created: 0, reactivated: 0, skipped: 0 }
    for (const userProfileId of ids) {
      const learner = await ensureLearnerForProfile(companyId, userProfileId)
      const existing = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } } })
      if (!existing) {
        await prisma.lmsEnrollment.create({ data: { companyId, courseId: course.id, learnerId: learner.id, source: 'assigned', assignedById: actorId, dueAt } })
        result.created += 1
      } else if (existing.status === 'dropped') {
        await prisma.lmsEnrollment.update({
          where: { id: existing.id },
          data: { status: existing.completedAt ? 'completed' : 'active', source: 'assigned', assignedById: actorId, dueAt },
        })
        result.reactivated += 1
      } else result.skipped += 1
    }
    return result
  }

  async function updateEnrollment(companyId, enrollmentId, body = {}) {
    const current = await prisma.lmsEnrollment.findFirst({ where: { id: enrollmentId, companyId } })
    if (!current) throw new LmsError('La inscripción no existe.', 404)
    const data = {}
    const dueAt = parseDueAt(body.dueAt)
    if (dueAt !== undefined) data.dueAt = dueAt
    if (body.status !== undefined) {
      if (body.status === 'dropped') data.status = 'dropped'
      else if (body.status === 'active') data.status = current.completedAt ? 'completed' : 'active'
      else throw new LmsError('Estado inválido.', 400)
    }
    const row = await prisma.lmsEnrollment.update({ where: { id: current.id }, data, include: { learner: true } })
    return ser.serializeEnrollment(row)
  }

  return {
    listCourses, createCourse, getCourse, updateCourse, archiveCourse,
    createSection, updateSection, deleteSection,
    createLesson, updateLesson, deleteLesson, reorder,
    ensureLearnerForProfile, listEnrollments, assign, updateEnrollment,
  }
}
