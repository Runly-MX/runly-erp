// runly.lms standalone evaluations: authoring, participants and the
// participant session (spec 2026-11-21, phases 1-2).
import { createLmsAssessmentService } from './lms-assessment-service.js'
import { createLmsSessionService } from './lms-session-service.js'
import { createLmsNotifier } from './lms-notify.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null
const body = (c) => c.req.json().catch(() => ({}))

export function registerLmsAssessmentRoutes(app, {
  prisma, requirePermission, signFile = null, run, service = null, sessionService = null, learners = null, media = null, notificationService = null,
}) {
  const sessions = sessionService ?? createLmsSessionService({ prisma, signFile, media, notifier: createLmsNotifier({ notificationService }) })
  const svc = service ?? createLmsAssessmentService({ prisma, signFile, learners, sessions })
  const manage = requirePermission('lms.course.manage')
  const enrollments = requirePermission('lms.enrollment.manage')
  const access = requirePermission('lms.access')
  const id = (c) => c.req.param('id')

  // ---- authoring ------------------------------------------------------------
  app.get('/lms/assessments', manage, run('Error al cargar las evaluaciones.', async (c) => c.json({ data: await svc.list(companyId(c), c.req.query()) })))
  app.post('/lms/assessments', manage, run('Error al crear la evaluación.', async (c) => c.json({ data: await svc.create(companyId(c), actorId(c), await body(c)) }, 201)))
  app.get('/lms/assessments/:id', manage, run('Error al cargar la evaluación.', async (c) => c.json({ data: await svc.get(companyId(c), id(c)) })))
  app.patch('/lms/assessments/:id', manage, run('Error al guardar la evaluación.', async (c) => c.json({ data: await svc.update(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/assessments/:id', manage, run('Error al archivar la evaluación.', async (c) => c.json({ data: await svc.archive(companyId(c), id(c)) })))
  app.post('/lms/assessments/:id/activities', manage, run('Error al crear la actividad.', async (c) => c.json({ data: await svc.createActivity(companyId(c), id(c), await body(c)) }, 201)))
  app.post('/lms/assessments/:id/activities/reorder', manage, run('Error al ordenar las actividades.', async (c) => c.json({ data: await svc.reorderActivities(companyId(c), id(c), await body(c)) })))
  app.patch('/lms/activities/:id', manage, run('Error al guardar la actividad.', async (c) => c.json({ data: await svc.updateActivity(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/activities/:id', manage, run('Error al eliminar la actividad.', async (c) => c.json({ data: await svc.deleteActivity(companyId(c), id(c)) })))

  // ---- participants ---------------------------------------------------------
  app.get('/lms/assessments/:id/participants', enrollments, run('Error al cargar los participantes.', async (c) => c.json({ data: await svc.listParticipants(companyId(c), id(c)) })))
  app.post('/lms/assessments/:id/participants', enrollments, run('Error al agregar participantes.', async (c) => c.json({ data: await svc.assignParticipants(companyId(c), actorId(c), id(c), await body(c)) })))

  // ---- participant session (one clock for every activity) -------------------
  const sid = (c) => c.req.param('sessionId')
  app.get('/lms/my/assessments', access, run('Error al cargar tus evaluaciones.', async (c) => c.json({ data: await sessions.myAssessments(companyId(c), actorId(c)) })))
  app.get('/lms/learn/assessments/:id', access, run('Error al cargar la evaluación.', async (c) => c.json({ data: await sessions.overview(companyId(c), actorId(c), id(c)) })))
  app.post('/lms/learn/assessments/:id/sessions', access, run('Error al iniciar la evaluación.', async (c) => {
    const { session, resumed } = await sessions.start(companyId(c), actorId(c), id(c))
    return c.json({ data: { ...session, resumed } }, resumed ? 200 : 201)
  }))
  app.get('/lms/learn/sessions/:sessionId', access, run('Error al cargar la evaluación.', async (c) => c.json({ data: await sessions.getSession(companyId(c), actorId(c), sid(c)) })))
  app.post('/lms/learn/sessions/:sessionId/submit', access, run('Error al entregar la evaluación.', async (c) => c.json({ data: await sessions.submit(companyId(c), actorId(c), sid(c)) })))
  app.get('/lms/learn/sessions/:sessionId/attempts/:attemptId', access, run('Error al cargar el cuestionario.', async (c) => c.json({ data: await sessions.getAttempt(companyId(c), actorId(c), sid(c), c.req.param('attemptId')) })))
  app.put('/lms/learn/sessions/:sessionId/attempts/:attemptId/answers', access, run('Error al guardar las respuestas.', async (c) => c.json({ data: await sessions.saveAnswers(companyId(c), actorId(c), sid(c), c.req.param('attemptId'), await body(c)) })))
  app.put('/lms/learn/sessions/:sessionId/activities/:activityId/draft', access, run('Error al guardar la entrega.', async (c) => c.json({ data: await sessions.saveDraft(companyId(c), actorId(c), sid(c), c.req.param('activityId'), await body(c)) })))
  app.post('/lms/learn/sessions/:sessionId/uploads/presign', access, run('Error al preparar la subida.', async (c) => c.json({ data: await sessions.presignUpload(companyId(c), actorId(c), sid(c), await body(c)) })))
  app.post('/lms/learn/sessions/:sessionId/uploads/:fileId/confirm', access, run('Error al confirmar la subida.', async (c) => c.json({ data: await sessions.confirmUpload(companyId(c), actorId(c), sid(c), c.req.param('fileId')) })))
  app.delete('/lms/learn/sessions/:sessionId/files/:fileId', access, run('Error al quitar el archivo.', async (c) => c.json({ data: await sessions.removeFile(companyId(c), actorId(c), sid(c), c.req.param('fileId')) })))
  app.post('/lms/learn/sessions/:sessionId/resources/:resourceId/download', access, run('Error al preparar la descarga.', async (c) => c.json({ data: await sessions.downloadResource(companyId(c), actorId(c), sid(c), c.req.param('resourceId')) })))

  // ---- graders: delivered files with their versions and integrity -------------
  const grade = requirePermission('lms.grade')
  app.get('/lms/review/sessions/:sessionId/files', grade, run('Error al cargar las entregas.', async (c) => c.json({ data: await sessions.reviewFiles(companyId(c), sid(c)) })))
  app.post('/lms/review/session-files/:versionId/download', grade, run('Error al preparar la descarga.', async (c) => c.json({ data: await sessions.reviewDownload(companyId(c), c.req.param('versionId')) })))

  return { sessions }
}
