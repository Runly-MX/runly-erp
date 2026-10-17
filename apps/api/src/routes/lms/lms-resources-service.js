// runly.lms lesson resources: downloadable files attached to any lesson
// (Recursos tab in the player). Managers add, rename, reorder and remove them;
// learners get them signed in the opened lesson.
import { LmsError } from './lms-error.js'
import { isUuid } from './lms-eval-shared.js'

export const RESOURCE_TITLE_MAX = 200
export const RESOURCES_PER_LESSON_MAX = 50

const ORDERED = [{ position: 'asc' }, { createdAt: 'asc' }]

// Optional display title: trimmed, null when empty. Throws when too long.
export function normalizeResourceTitle(value) {
  if (value === undefined || value === null) return null
  const title = String(value).trim()
  if (!title) return null
  if (title.length > RESOURCE_TITLE_MAX) throw new LmsError(`El título no puede pasar de ${RESOURCE_TITLE_MAX} caracteres.`, 400)
  return title
}

// The new order must list every resource of the lesson exactly once.
export function validateResourceOrder(ids, existingIds) {
  if (!Array.isArray(ids)) throw new LmsError('Envía el orden de los recursos.', 400)
  const known = new Set(existingIds)
  const seen = new Set()
  for (const id of ids) {
    if (!known.has(id) || seen.has(id)) throw new LmsError('Un recurso no pertenece a esta lección.', 400)
    seen.add(id)
  }
  if (seen.size !== known.size) throw new LmsError('Envía el orden de todos los recursos de la lección.', 400)
  return ids
}

export function createLmsResourcesService({ prisma, signFile = null }) {
  const sign = async (fileId) => (signFile && fileId ? signFile(fileId, 'full') : null)

  async function findLesson(companyId, lessonId) {
    const lesson = isUuid(lessonId) ? await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, enabled: true }, select: { id: true, courseId: true } }) : null
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    return lesson
  }

  async function findResource(companyId, resourceId) {
    const row = isUuid(resourceId) ? await prisma.lmsLessonResource.findFirst({ where: { id: resourceId, companyId } }) : null
    if (!row) throw new LmsError('El recurso no existe.', 404)
    return row
  }

  // Same rule as a lesson fileId: a finished upload of this company.
  async function assertFile(companyId, fileId) {
    const file = isUuid(fileId) ? await prisma.fileAsset.findFirst({ where: { id: fileId, enabled: true }, select: { metadata: true } }) : null
    if (!file || file.metadata?.companyId !== companyId) throw new LmsError('El archivo no existe.', 404)
    if (file.metadata?.pending === true) throw new LmsError('El archivo no terminó de subirse.', 409)
  }

  async function filesById(fileIds) {
    const ids = [...new Set(fileIds.filter(Boolean))]
    if (!ids.length) return new Map()
    const rows = await prisma.fileAsset.findMany({ where: { id: { in: ids } }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true } })
    return new Map(rows.map((row) => [row.id, row]))
  }

  async function serialize(rows) {
    const files = await filesById(rows.map((row) => row.fileId))
    return Promise.all(rows.map(async (row) => {
      const file = files.get(row.fileId)
      return {
        id: row.id,
        lessonId: row.lessonId,
        fileId: row.fileId,
        title: row.title ?? null,
        fileName: file?.originalName ?? null,
        mimeType: file?.mimeType ?? null,
        sizeBytes: file?.sizeBytes === undefined || file?.sizeBytes === null ? null : Number(file.sizeBytes),
        position: row.position,
        url: await sign(row.fileId),
      }
    }))
  }

  const rowsOf = (lessonId) => prisma.lmsLessonResource.findMany({ where: { lessonId }, orderBy: ORDERED })

  async function listResources(companyId, lessonId) {
    const lesson = await findLesson(companyId, lessonId)
    return serialize(await rowsOf(lesson.id))
  }

  async function addResource(companyId, lessonId, body = {}) {
    const lesson = await findLesson(companyId, lessonId)
    const title = normalizeResourceTitle(body.title)
    await assertFile(companyId, body.fileId)
    const count = await prisma.lmsLessonResource.count({ where: { lessonId: lesson.id } })
    if (count >= RESOURCES_PER_LESSON_MAX) throw new LmsError(`Una lección admite como máximo ${RESOURCES_PER_LESSON_MAX} recursos.`, 409)
    const max = await prisma.lmsLessonResource.aggregate({ where: { lessonId: lesson.id }, _max: { position: true } })
    const row = await prisma.lmsLessonResource.create({
      data: { companyId, lessonId: lesson.id, fileId: body.fileId, title, position: (max._max.position ?? 0) + 1 },
    })
    return (await serialize([row]))[0]
  }

  async function updateResource(companyId, resourceId, body = {}) {
    const current = await findResource(companyId, resourceId)
    if (!Object.prototype.hasOwnProperty.call(body, 'title')) return (await serialize([current]))[0]
    const row = await prisma.lmsLessonResource.update({ where: { id: current.id }, data: { title: normalizeResourceTitle(body.title) } })
    return (await serialize([row]))[0]
  }

  // The row is removed; the file stays in runly.files (it may be shared).
  async function deleteResource(companyId, resourceId) {
    const current = await findResource(companyId, resourceId)
    await prisma.lmsLessonResource.delete({ where: { id: current.id } })
    return { id: current.id }
  }

  async function reorderResources(companyId, lessonId, body = {}) {
    const lesson = await findLesson(companyId, lessonId)
    const existing = await prisma.lmsLessonResource.findMany({ where: { lessonId: lesson.id }, select: { id: true } })
    const ids = validateResourceOrder(body.resourceIds, existing.map((row) => row.id))
    await prisma.$transaction(ids.map((id, index) => prisma.lmsLessonResource.update({ where: { id }, data: { position: index + 1 } })))
    return serialize(await rowsOf(lesson.id))
  }

  // Learner shape for the opened lesson (GET /lms/learn/lessons/:id).
  async function lessonResources(lessonId) {
    const rows = await serialize(await rowsOf(lessonId))
    return rows.map(({ id, title, fileName, url, sizeBytes, mimeType }) => ({ id, title, fileName, url, sizeBytes, mimeType }))
  }

  return { listResources, addResource, updateResource, deleteResource, reorderResources, lessonResources }
}
