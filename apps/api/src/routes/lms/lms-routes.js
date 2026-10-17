import { Hono } from 'hono'
import { LmsError } from './lms-core.js'
import { createLmsService } from './lms-service.js'
import { createLmsLearnService } from './lms-learn-service.js'
import { createLmsMedia } from './lms-media.js'
import { registerLmsEvalRoutes } from './lms-eval-routes.js'
import { registerLmsSocialRoutes } from './lms-social-routes.js'
import { registerLmsCertRoutes } from './lms-cert-routes.js'
import { registerLmsExperienceRoutes } from './lms-experience-routes.js'
import { createLmsShareService } from './lms-share-service.js'
import { createLmsInviteService } from './lms-invite-service.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null
const body = (c) => c.req.json().catch(() => ({}))

// Managers preview drafts and locked lessons without enrolling.
function canManage(c) {
  const ctx = c.get('userContext')
  return Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.('lms.course.manage'))
}

function fail(c, error, fallback) {
  if (error instanceof LmsError) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
  if (process.env.NODE_ENV !== 'production') console.error('[runly.lms]', error)
  return c.json({ error: fallback }, 500)
}

export function createLmsRouter({ prisma, requirePermission, supabaseAdmin = null, bucket = 'runly-files', signFile = null, notificationService = null, service = null, learnService = null, media = null, evalServices = null, socialService = null, certService = null, experienceServices = null, shareService = null, inviteService = null, sendMail = null, isMailConfigured = null, buildMail = null, getBrand = null, appBaseUrl = undefined }) {
  const app = new Hono()
  const svc = service ?? createLmsService({ prisma, signFile })
  const files = media ?? createLmsMedia({ prisma, supabaseAdmin, bucket })
  const learn = learnService ?? createLmsLearnService({ prisma, signFile, authoring: svc, hlsManifest: files.manifestFor })
  const share = shareService ?? createLmsShareService({ prisma, ...(appBaseUrl ? { appBaseUrl } : {}) })
  const invites = inviteService ?? createLmsInviteService({ prisma, sendMail, isMailConfigured, buildMail, getBrand, ...(appBaseUrl ? { appBaseUrl } : {}) })
  const access = requirePermission('lms.access')
  const courses = requirePermission('lms.course.manage')
  const enrollments = requirePermission('lms.enrollment.manage')
  const run = (fallback, fn) => async (c) => {
    try { return await fn(c) } catch (error) { return fail(c, error, fallback) }
  }

  // ---- learner ------------------------------------------------------------
  app.get('/lms/catalog', access, run('Error al cargar el catálogo.', async (c) => c.json({ data: await learn.catalog(companyId(c), actorId(c)) })))
  app.get('/lms/my/courses', access, run('Error al cargar tus cursos.', async (c) => c.json({ data: await learn.myCourses(companyId(c), actorId(c)) })))
  app.post('/lms/courses/:id/enroll', access, run('Error al inscribirte.', async (c) => c.json({ data: await learn.enroll(companyId(c), actorId(c), c.req.param('id')) }, 201)))
  app.get('/lms/learn/lessons/:lessonId', access, run('Error al abrir la lección.', async (c) => c.json({ data: await learn.openLesson(companyId(c), actorId(c), c.req.param('lessonId'), { canManage: canManage(c) }) })))
  app.post('/lms/learn/lessons/:lessonId/progress', access, run('Error al guardar el avance.', async (c) => c.json({ data: await learn.saveProgress(companyId(c), actorId(c), c.req.param('lessonId'), await body(c)) })))
  app.get('/lms/learn/:courseId', access, run('Error al cargar el curso.', async (c) => c.json({ data: await learn.outline(companyId(c), actorId(c), c.req.param('courseId'), { canManage: canManage(c) }) })))

  // ---- authoring ----------------------------------------------------------
  app.get('/lms/courses', courses, run('Error al cargar los cursos.', async (c) => c.json({ data: await svc.listCourses(companyId(c), c.req.query()) })))
  app.post('/lms/courses', courses, run('Error al crear el curso.', async (c) => c.json({ data: await svc.createCourse(companyId(c), actorId(c), await body(c)) }, 201)))
  app.get('/lms/courses/:id', courses, run('Error al cargar el curso.', async (c) => c.json({ data: await svc.getCourse(companyId(c), c.req.param('id')) })))
  app.patch('/lms/courses/:id', courses, run('Error al guardar el curso.', async (c) => c.json({ data: await svc.updateCourse(companyId(c), c.req.param('id'), await body(c)) })))
  app.delete('/lms/courses/:id', courses, run('Error al archivar el curso.', async (c) => c.json({ data: await svc.archiveCourse(companyId(c), c.req.param('id')) })))
  app.post('/lms/courses/:id/sections', courses, run('Error al crear la sección.', async (c) => c.json({ data: await svc.createSection(companyId(c), c.req.param('id'), await body(c)) }, 201)))
  app.post('/lms/courses/:id/reorder', courses, run('Error al ordenar el contenido.', async (c) => c.json({ data: await svc.reorder(companyId(c), c.req.param('id'), await body(c)) })))
  app.patch('/lms/sections/:id', courses, run('Error al guardar la sección.', async (c) => c.json({ data: await svc.updateSection(companyId(c), c.req.param('id'), await body(c)) })))
  app.delete('/lms/sections/:id', courses, run('Error al eliminar la sección.', async (c) => c.json({ data: await svc.deleteSection(companyId(c), c.req.param('id')) })))
  app.post('/lms/sections/:id/lessons', courses, run('Error al crear la lección.', async (c) => c.json({ data: await svc.createLesson(companyId(c), c.req.param('id'), await body(c)) }, 201)))
  app.patch('/lms/lessons/:id', courses, run('Error al guardar la lección.', async (c) => c.json({ data: await svc.updateLesson(companyId(c), c.req.param('id'), await body(c)) })))
  app.delete('/lms/lessons/:id', courses, run('Error al eliminar la lección.', async (c) => c.json({ data: await svc.deleteLesson(companyId(c), c.req.param('id')) })))
  app.get('/lms/lessons/:id/media', courses, run('Error al cargar el video.', async (c) => c.json({ data: await learn.lessonMedia(companyId(c), c.req.param('id')) })))
  app.post('/lms/media/presign', courses, run('Error al preparar la subida.', async (c) => c.json({ data: await files.presign(companyId(c), actorId(c), await body(c)) })))
  app.post('/lms/media/hls/presign', courses, run('Error al preparar la subida del video.', async (c) => c.json({ data: await files.presignHls(companyId(c), actorId(c), await body(c)) })))
  app.post('/lms/media/:fileId/confirm', courses, run('Error al confirmar la subida.', async (c) => c.json({ data: await files.confirm(companyId(c), c.req.param('fileId')) })))

  // ---- public share link (external guests) --------------------------------
  app.get('/lms/courses/:id/share', courses, run('Error al cargar el enlace.', async (c) => c.json({ data: await share.getShare(companyId(c), c.req.param('id')) })))
  app.put('/lms/courses/:id/share', courses, run('Error al guardar el enlace.', async (c) => c.json({ data: await share.updateShare(companyId(c), c.req.param('id'), await body(c)) })))
  app.post('/lms/courses/:id/share/rotate', courses, run('Error al generar el enlace.', async (c) => c.json({ data: await share.rotateShare(companyId(c), c.req.param('id')) })))
  app.get('/lms/courses/:id/share/invites', courses, run('Error al cargar las invitaciones.', async (c) => c.json({ data: await invites.listInvites(companyId(c), c.req.param('id')) })))
  app.post('/lms/courses/:id/share/invites', courses, run('Error al crear las invitaciones.', async (c) => c.json({ data: await invites.createInvites(companyId(c), actorId(c), c.req.param('id'), await body(c)) }, 201)))
  app.post('/lms/courses/:id/share/invites/:inviteId/resend', courses, run('Error al reenviar la invitación.', async (c) => c.json({ data: await invites.resendInvite(companyId(c), c.req.param('id'), c.req.param('inviteId')) })))
  app.post('/lms/courses/:id/share/invites/:inviteId/revoke', courses, run('Error al revocar la invitación.', async (c) => c.json({ data: await invites.revokeInvite(companyId(c), c.req.param('id'), c.req.param('inviteId')) })))

  // ---- enrollments --------------------------------------------------------
  app.get('/lms/courses/:id/enrollments', enrollments, run('Error al cargar los alumnos.', async (c) => c.json({ data: await svc.listEnrollments(companyId(c), c.req.param('id')) })))
  app.post('/lms/courses/:id/enrollments', enrollments, run('Error al asignar el curso.', async (c) => c.json({ data: await svc.assign(companyId(c), actorId(c), c.req.param('id'), await body(c)) })))
  app.patch('/lms/enrollments/:id', enrollments, run('Error al guardar la inscripción.', async (c) => c.json({ data: await svc.updateEnrollment(companyId(c), c.req.param('id'), await body(c)) })))

  // ---- evaluation (quizzes, assignments, grading) -------------------------
  registerLmsEvalRoutes(app, { prisma, requirePermission, signFile, supabaseAdmin, bucket, notificationService, run, learn, media: files, services: evalServices })

  // ---- social (discussion, reviews, announcements) ------------------------
  registerLmsSocialRoutes(app, { prisma, requirePermission, signFile, notificationService, run, service: socialService })

  // ---- course page and lesson resources -----------------------------------
  registerLmsExperienceRoutes(app, { prisma, requirePermission, signFile, run, resolveMedia: learn.resolveMedia ?? null, ...(experienceServices ?? {}) })

  // ---- certificates -------------------------------------------------------
  registerLmsCertRoutes(app, { prisma, requirePermission, signFile, supabaseAdmin, bucket, run, service: certService })

  return app
}
