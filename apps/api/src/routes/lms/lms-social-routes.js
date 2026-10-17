// runly.lms social routes (discussion, reviews, announcements), registered from createLmsRouter.
import { createLmsSocialService } from './lms-social-service.js'
import { createLmsNotifier } from './lms-notify.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null
const body = (c) => c.req.json().catch(() => ({}))

// Staff = admin, course managers or graders; only managers moderate beyond that.
export function socialPerms(c) {
  const ctx = c.get('userContext')
  const has = (key) => Boolean(ctx?.permissionSet?.has?.(key))
  const canManage = Boolean(ctx?.isAdmin) || has('lms.course.manage')
  return { canManage, isStaff: canManage || has('lms.grade') }
}

// service: optional override (tests).
export function registerLmsSocialRoutes(app, { prisma, requirePermission, signFile = null, notificationService = null, run, service = null }) {
  const social = service ?? createLmsSocialService({ prisma, notifier: createLmsNotifier({ notificationService }), signFile })
  const access = requirePermission('lms.access')
  const courses = requirePermission('lms.course.manage')
  const id = (c) => c.req.param('id')

  // ---- discussion ---------------------------------------------------------
  app.get('/lms/lessons/:id/comments', access, run('Error al cargar las preguntas.', async (c) => c.json({ data: await social.listComments(companyId(c), actorId(c), id(c), socialPerms(c)) })))
  app.post('/lms/lessons/:id/comments', access, run('Error al publicar el comentario.', async (c) => c.json({ data: await social.createComment(companyId(c), actorId(c), id(c), await body(c), socialPerms(c)) }, 201)))
  app.patch('/lms/comments/:id', access, run('Error al guardar el comentario.', async (c) => c.json({ data: await social.updateComment(companyId(c), actorId(c), id(c), await body(c), socialPerms(c)) })))
  app.delete('/lms/comments/:id', access, run('Error al eliminar el comentario.', async (c) => c.json({ data: await social.deleteComment(companyId(c), actorId(c), id(c), socialPerms(c)) })))

  // ---- reviews ------------------------------------------------------------
  app.get('/lms/courses/:id/reviews', access, run('Error al cargar las reseñas.', async (c) => c.json({ data: await social.getReviews(companyId(c), actorId(c), id(c), socialPerms(c)) })))
  app.put('/lms/courses/:id/reviews/mine', access, run('Error al guardar tu reseña.', async (c) => c.json({ data: await social.saveMyReview(companyId(c), actorId(c), id(c), await body(c)) })))
  app.patch('/lms/reviews/:id', courses, run('Error al guardar la reseña.', async (c) => c.json({ data: await social.moderateReview(companyId(c), actorId(c), id(c), await body(c)) })))

  // ---- announcements ------------------------------------------------------
  // Listing is open to lms.access; the service requires an enrollment unless the caller manages courses.
  app.get('/lms/courses/:id/announcements', access, run('Error al cargar los anuncios.', async (c) => c.json({ data: await social.listAnnouncements(companyId(c), actorId(c), id(c), socialPerms(c)) })))
  app.post('/lms/courses/:id/announcements', courses, run('Error al publicar el anuncio.', async (c) => c.json({ data: await social.createAnnouncement(companyId(c), actorId(c), id(c), await body(c)) }, 201)))
  app.patch('/lms/announcements/:id', courses, run('Error al guardar el anuncio.', async (c) => c.json({ data: await social.updateAnnouncement(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/announcements/:id', courses, run('Error al eliminar el anuncio.', async (c) => c.json({ data: await social.deleteAnnouncement(companyId(c), id(c)) })))
}
