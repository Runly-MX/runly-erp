// runly.lms social: lesson discussion, course reviews and announcements.
// perms: { isStaff (manage or grade or admin), canManage (manage or admin) }.
import { LmsError } from './lms-core.js'
import {
  buildThreads, canReview, commentShape, isCommentAuthor, normalizeAnnouncementInput, normalizeCommentBody,
  normalizeCommentPatch, normalizeReviewInput, normalizeReviewModeration, ratingAggregate, replyRecipients, rootIdFor,
} from './lms-social-core.js'
import { isUuid } from './lms-eval-shared.js'
import { TX_OPTS } from './lms-progress.js'

const OPEN_STATUSES = new Set(['active', 'completed'])
const REVIEW_LIST_LIMIT = 200
const iso = (value) => (value ? new Date(value).toISOString() : null)
const WITH_LEARNER = { authorLearner: { select: { id: true, displayName: true, userProfileId: true } } }

export function createLmsSocialService({ prisma, notifier = null, signFile = null }) {
  const sign = async (fileId) => (signFile && fileId ? signFile(fileId, 'thumb') : null)

  const findLearner = (companyId, userProfileId) => (userProfileId
    ? prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId } } })
    : null)

  async function findCourse(companyId, courseId, { canManage = false } = {}) {
    if (!isUuid(courseId)) throw new LmsError('El curso no existe.', 404)
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true } })
    if (!course || (course.status === 'draft' && !canManage)) throw new LmsError('El curso no existe.', 404)
    return course
  }

  async function enrollmentOf(companyId, profileId, courseId) {
    const learner = await findLearner(companyId, profileId)
    const enrollment = learner
      ? await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId, learnerId: learner.id } } })
      : null
    return { learner, enrollment }
  }

  // Profiles behind comment authors and announcement writers: name + avatar.
  async function profilesById(ids) {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return new Map()
    const rows = await prisma.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, avatarFileId: true } })
    const entries = await Promise.all(rows.map(async (row) => [row.id, { displayName: row.displayName, avatarUrl: await sign(row.avatarFileId) }]))
    return new Map(entries)
  }

  async function withAuthors(rows) {
    const profiles = await profilesById(rows.map((row) => row.authorProfileId ?? row.authorLearner?.userProfileId))
    return rows.map((row) => {
      if (row.authorLearnerId) {
        const profile = profiles.get(row.authorLearner?.userProfileId)
        return { ...row, author: { kind: 'learner', id: row.authorLearnerId, displayName: row.authorLearner?.displayName ?? profile?.displayName ?? 'Alumno', avatarUrl: profile?.avatarUrl ?? null } }
      }
      const profile = profiles.get(row.authorProfileId)
      return { ...row, author: { kind: 'staff', id: row.authorProfileId, displayName: profile?.displayName ?? 'Instructor', avatarUrl: profile?.avatarUrl ?? null } }
    })
  }

  // ---- discussion ---------------------------------------------------------
  // mode: write (open enrollment or staff), own (dropped: read-only, own threads).
  async function discussionContext(companyId, profileId, lessonId, perms = {}) {
    if (!isUuid(lessonId)) throw new LmsError('La lección no existe.', 404)
    const lesson = await prisma.lmsLesson.findFirst({ where: { id: lessonId, companyId, enabled: true } })
    if (!lesson) throw new LmsError('La lección no existe.', 404)
    const course = await findCourse(companyId, lesson.courseId, { canManage: perms.isStaff })
    const { learner, enrollment } = await enrollmentOf(companyId, profileId, course.id)
    let mode = null
    if (perms.isStaff || OPEN_STATUSES.has(enrollment?.status)) mode = 'write'
    else if (enrollment?.status === 'dropped') mode = 'own'
    if (!mode) throw new LmsError('No estás inscrito en este curso.', 403, 'NOT_ENROLLED')
    const viewer = {
      learnerId: learner?.id ?? null,
      profileId,
      canManage: perms.canManage === true,
      readOnly: mode !== 'write',
      onlyOwn: mode === 'own',
    }
    return { lesson, course, learner, enrollment, mode, viewer }
  }

  const assertWritable = (ctx) => {
    if (ctx.mode !== 'write') throw new LmsError('Ya no estás inscrito en este curso; solo puedes consultar tus preguntas.', 403, 'READ_ONLY')
  }

  async function loadThreadRows(lessonId, rootIds = null) {
    const roots = await prisma.lmsComment.findMany({
      where: rootIds ? { id: { in: rootIds } } : { lessonId, parentId: null },
      include: WITH_LEARNER,
      orderBy: { createdAt: 'desc' },
    })
    const replies = roots.length
      ? await prisma.lmsComment.findMany({ where: { parentId: { in: roots.map((row) => row.id) } }, include: WITH_LEARNER, orderBy: { createdAt: 'asc' } })
      : []
    return withAuthors([...roots, ...replies])
  }

  async function listComments(companyId, profileId, lessonId, perms = {}) {
    const ctx = await discussionContext(companyId, profileId, lessonId, perms)
    return buildThreads(await loadThreadRows(ctx.lesson.id), ctx.viewer)
  }

  // The comment as the client shows it: a root with its replies, or a reply.
  async function shapeOne(row, viewer) {
    if (!row.parentId) {
      const rows = await loadThreadRows(row.lessonId, [row.id])
      return buildThreads(rows, { ...viewer, onlyOwn: false })[0] ?? commentShape((await withAuthors([row]))[0], viewer, [])
    }
    return commentShape((await withAuthors([row]))[0], viewer)
  }

  async function createComment(companyId, profileId, lessonId, body = {}, perms = {}) {
    const ctx = await discussionContext(companyId, profileId, lessonId, perms)
    assertWritable(ctx)
    if (ctx.course.status === 'archived' && !perms.isStaff) throw new LmsError('El curso está archivado.', 409, 'NOT_PUBLISHED')
    const text = normalizeCommentBody(body.body)
    let root = null
    if (body.parentId !== undefined && body.parentId !== null && body.parentId !== '') {
      if (!isUuid(String(body.parentId))) throw new LmsError('El comentario no existe.', 404)
      const parent = await prisma.lmsComment.findFirst({ where: { id: String(body.parentId), companyId, lessonId: ctx.lesson.id }, include: WITH_LEARNER })
      if (!parent) throw new LmsError('El comentario no existe.', 404)
      const rootId = rootIdFor(parent)
      root = rootId === parent.id ? parent : await prisma.lmsComment.findFirst({ where: { id: rootId, companyId }, include: WITH_LEARNER })
      if (!root) throw new LmsError('El comentario no existe.', 404)
    }
    // Staff always post as instructors; learners post as their learner record.
    const asStaff = perms.isStaff === true || !ctx.learner
    const row = await prisma.lmsComment.create({
      data: {
        companyId,
        courseId: ctx.course.id,
        lessonId: ctx.lesson.id,
        parentId: root?.id ?? null,
        authorLearnerId: asStaff ? null : ctx.learner.id,
        authorProfileId: asStaff ? profileId : null,
        body: text,
        isInstructor: asStaff,
      },
      include: WITH_LEARNER,
    })
    const name = asStaff ? (await profilesById([profileId])).get(profileId)?.displayName ?? 'Instructor' : ctx.learner.displayName
    const note = { companyId, actorId: profileId, course: ctx.course, lesson: ctx.lesson, actorName: name, commentId: row.id, body: text }
    if (root) {
      const earlier = await prisma.lmsComment.findMany({ where: { parentId: root.id, id: { not: row.id } }, include: WITH_LEARNER })
      await notifier?.commentReplied?.({ ...note, recipientIds: replyRecipients({ root, replies: earlier, actor: profileId }) })
    } else {
      await notifier?.commentQuestion?.(note)
    }
    return shapeOne(row, ctx.viewer)
  }

  async function findComment(companyId, commentId) {
    if (!isUuid(commentId)) throw new LmsError('El comentario no existe.', 404)
    const row = await prisma.lmsComment.findFirst({ where: { id: commentId, companyId, deletedAt: null }, include: WITH_LEARNER })
    if (!row) throw new LmsError('El comentario no existe.', 404)
    return row
  }

  async function updateComment(companyId, profileId, commentId, body = {}, perms = {}) {
    const row = await findComment(companyId, commentId)
    const ctx = await discussionContext(companyId, profileId, row.lessonId, perms)
    assertWritable(ctx)
    const data = normalizeCommentPatch(body, { isRoot: !row.parentId, isAuthor: isCommentAuthor(row, ctx.viewer), isStaff: perms.isStaff === true })
    if (data.body !== undefined) data.editedAt = new Date()
    const updated = await prisma.lmsComment.update({ where: { id: row.id }, data, include: WITH_LEARNER })
    return shapeOne(updated, ctx.viewer)
  }

  // Soft delete by the author or a course manager.
  async function deleteComment(companyId, profileId, commentId, perms = {}) {
    const row = await findComment(companyId, commentId)
    const ctx = await discussionContext(companyId, profileId, row.lessonId, perms)
    const allowed = perms.canManage === true || (ctx.mode === 'write' && isCommentAuthor(row, ctx.viewer))
    if (!allowed) throw new LmsError('No tienes permiso para eliminar este comentario.', 403)
    await prisma.lmsComment.update({ where: { id: row.id }, data: { deletedAt: new Date() } })
    return { id: row.id, deleted: true }
  }

  // ---- reviews ------------------------------------------------------------
  function reviewShape(row, profileId) {
    return {
      id: row.id,
      rating: row.rating,
      body: row.body,
      hidden: row.hidden,
      learner: { id: row.learner?.id ?? row.learnerId, displayName: row.learner?.displayName ?? 'Alumno' },
      replyBody: row.replyBody,
      repliedAt: iso(row.repliedAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      mine: Boolean(profileId) && row.learner?.userProfileId === profileId,
    }
  }

  // Recomputes the cached course aggregate inside the review write's transaction.
  // Raw SQL keeps lms_course.updated_at (catalog order) untouched.
  async function refreshRating(tx, courseId) {
    const rows = await tx.lmsReview.findMany({ where: { courseId, hidden: false }, select: { rating: true, hidden: true } })
    const { ratingAvg, ratingCount } = ratingAggregate(rows)
    await tx.$executeRaw`UPDATE "lms_course" SET "rating_avg" = ${ratingAvg}::numeric, "rating_count" = ${ratingCount} WHERE "id" = ${courseId}::uuid`
  }

  async function getReviews(companyId, profileId, courseId, perms = {}) {
    const course = await findCourse(companyId, courseId, { canManage: perms.canManage })
    const { learner, enrollment } = await enrollmentOf(companyId, profileId, course.id)
    const [rows, ratings, mine] = await Promise.all([
      prisma.lmsReview.findMany({
        where: { courseId: course.id, ...(perms.canManage ? {} : { hidden: false }) },
        include: { learner: true },
        orderBy: { createdAt: 'desc' },
        take: REVIEW_LIST_LIMIT,
      }),
      prisma.lmsReview.findMany({ where: { courseId: course.id, hidden: false }, select: { rating: true } }),
      learner ? prisma.lmsReview.findUnique({ where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } }, include: { learner: true } }) : null,
    ])
    const { ratingAvg, ratingCount, distribution } = ratingAggregate(ratings)
    return {
      ratingAvg,
      ratingCount,
      distribution,
      mine: mine ? reviewShape(mine, profileId) : null,
      canReview: course.status !== 'draft' && canReview(enrollment),
      reviews: rows.map((row) => reviewShape(row, profileId)),
    }
  }

  async function saveMyReview(companyId, profileId, courseId, body = {}) {
    const course = await findCourse(companyId, courseId)
    const { learner, enrollment } = await enrollmentOf(companyId, profileId, course.id)
    if (!learner || !canReview(enrollment)) {
      throw new LmsError('Avanza al menos 30 % del curso para calificarlo.', 409, 'NOT_ELIGIBLE')
    }
    const data = normalizeReviewInput(body)
    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.lmsReview.upsert({
        where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } },
        create: { companyId, courseId: course.id, learnerId: learner.id, ...data },
        update: data,
        include: { learner: true },
      })
      await refreshRating(tx, course.id)
      return saved
    }, TX_OPTS)
    return reviewShape(row, profileId)
  }

  async function moderateReview(companyId, actorId, reviewId, body = {}) {
    if (!isUuid(reviewId)) throw new LmsError('La reseña no existe.', 404)
    const current = await prisma.lmsReview.findFirst({ where: { id: reviewId, companyId }, include: { learner: true, course: true } })
    if (!current || current.course.enabled === false) throw new LmsError('La reseña no existe.', 404)
    const input = normalizeReviewModeration(body)
    const data = {}
    if (input.hidden !== undefined) data.hidden = input.hidden
    if (input.replyBody !== undefined) {
      Object.assign(data, input.replyBody
        ? { replyBody: input.replyBody, repliedById: actorId, repliedAt: new Date() }
        : { replyBody: null, repliedById: null, repliedAt: null })
    }
    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.lmsReview.update({ where: { id: current.id }, data, include: { learner: true } })
      if (data.hidden !== undefined && data.hidden !== current.hidden) await refreshRating(tx, current.courseId)
      return saved
    }, TX_OPTS)
    if (data.replyBody && data.replyBody !== current.replyBody) {
      await notifier?.reviewReplied?.({ companyId, actorId, recipientId: current.learner?.userProfileId, course: current.course, reviewId: current.id, body: data.replyBody })
    }
    return reviewShape(row, actorId)
  }

  // ---- announcements ------------------------------------------------------
  async function announcementShapes(rows) {
    const profiles = await profilesById(rows.map((row) => row.createdById))
    return rows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      title: row.title,
      body: row.body,
      author: { displayName: profiles.get(row.createdById)?.displayName ?? null },
      createdAt: iso(row.createdAt),
      editedAt: iso(row.editedAt),
    }))
  }

  async function listAnnouncements(companyId, profileId, courseId, perms = {}) {
    const course = await findCourse(companyId, courseId, { canManage: perms.canManage })
    if (!perms.canManage) {
      const { enrollment } = await enrollmentOf(companyId, profileId, course.id)
      if (!OPEN_STATUSES.has(enrollment?.status)) throw new LmsError('No estás inscrito en este curso.', 403, 'NOT_ENROLLED')
    }
    const rows = await prisma.lmsAnnouncement.findMany({ where: { courseId: course.id, deletedAt: null }, orderBy: { createdAt: 'desc' } })
    return announcementShapes(rows)
  }

  async function createAnnouncement(companyId, actorId, courseId, body = {}) {
    const course = await findCourse(companyId, courseId, { canManage: true })
    const data = normalizeAnnouncementInput(body)
    const row = await prisma.lmsAnnouncement.create({ data: { companyId, courseId: course.id, createdById: actorId, ...data } })
    if (course.status === 'published') {
      const enrollments = await prisma.lmsEnrollment.findMany({
        where: { courseId: course.id, status: 'active', learner: { userProfileId: { not: null } } },
        select: { learner: { select: { userProfileId: true } } },
      })
      await notifier?.announcementPublished?.({ companyId, actorId, recipientIds: enrollments.map((e) => e.learner.userProfileId), course, announcement: row })
    }
    return (await announcementShapes([row]))[0]
  }

  async function findAnnouncement(companyId, announcementId) {
    if (!isUuid(announcementId)) throw new LmsError('El anuncio no existe.', 404)
    const row = await prisma.lmsAnnouncement.findFirst({ where: { id: announcementId, companyId, deletedAt: null, course: { enabled: true } } })
    if (!row) throw new LmsError('El anuncio no existe.', 404)
    return row
  }

  async function updateAnnouncement(companyId, announcementId, body = {}) {
    const current = await findAnnouncement(companyId, announcementId)
    const data = normalizeAnnouncementInput(body, { partial: true })
    const row = await prisma.lmsAnnouncement.update({ where: { id: current.id }, data: { ...data, editedAt: new Date() } })
    return (await announcementShapes([row]))[0]
  }

  async function deleteAnnouncement(companyId, announcementId) {
    const current = await findAnnouncement(companyId, announcementId)
    await prisma.lmsAnnouncement.update({ where: { id: current.id }, data: { deletedAt: new Date() } })
    return { id: current.id }
  }

  return {
    listComments, createComment, updateComment, deleteComment,
    getReviews, saveMyReview, moderateReview,
    listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  }
}
