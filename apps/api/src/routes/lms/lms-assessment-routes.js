// runly.lms standalone evaluations: authoring routes (spec 2026-11-21, phase 1).
import { createLmsAssessmentService } from './lms-assessment-service.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null
const body = (c) => c.req.json().catch(() => ({}))

export function registerLmsAssessmentRoutes(app, { prisma, requirePermission, signFile = null, run, service = null }) {
  const svc = service ?? createLmsAssessmentService({ prisma, signFile })
  const manage = requirePermission('lms.course.manage')

  app.get('/lms/assessments', manage, run('Error al cargar las evaluaciones.', async (c) => c.json({ data: await svc.list(companyId(c), c.req.query()) })))
  app.post('/lms/assessments', manage, run('Error al crear la evaluación.', async (c) => c.json({ data: await svc.create(companyId(c), actorId(c), await body(c)) }, 201)))
  app.get('/lms/assessments/:id', manage, run('Error al cargar la evaluación.', async (c) => c.json({ data: await svc.get(companyId(c), c.req.param('id')) })))
  app.patch('/lms/assessments/:id', manage, run('Error al guardar la evaluación.', async (c) => c.json({ data: await svc.update(companyId(c), c.req.param('id'), await body(c)) })))
  app.delete('/lms/assessments/:id', manage, run('Error al archivar la evaluación.', async (c) => c.json({ data: await svc.archive(companyId(c), c.req.param('id')) })))
  app.post('/lms/assessments/:id/activities', manage, run('Error al crear la actividad.', async (c) => c.json({ data: await svc.createActivity(companyId(c), c.req.param('id'), await body(c)) }, 201)))
  app.post('/lms/assessments/:id/activities/reorder', manage, run('Error al ordenar las actividades.', async (c) => c.json({ data: await svc.reorderActivities(companyId(c), c.req.param('id'), await body(c)) })))
  app.patch('/lms/activities/:id', manage, run('Error al guardar la actividad.', async (c) => c.json({ data: await svc.updateActivity(companyId(c), c.req.param('id'), await body(c)) })))
  app.delete('/lms/activities/:id', manage, run('Error al eliminar la actividad.', async (c) => c.json({ data: await svc.deleteActivity(companyId(c), c.req.param('id')) })))
}
