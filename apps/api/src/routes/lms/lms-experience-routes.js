// runly.lms learner experience routes (course page, lesson resources),
// registered from createLmsRouter.
import { createLmsOverviewService } from './lms-overview-service.js'
import { createLmsResourcesService } from './lms-resources-service.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null
const body = (c) => c.req.json().catch(() => ({}))

function canManage(c) {
  const ctx = c.get('userContext')
  return Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.('lms.course.manage'))
}

// resources / overview: optional service overrides (tests).
export function registerLmsExperienceRoutes(app, { prisma, requirePermission, signFile = null, run, resources = null, overview = null }) {
  const files = resources ?? createLmsResourcesService({ prisma, signFile })
  const page = overview ?? createLmsOverviewService({ prisma, signFile })
  const access = requirePermission('lms.access')
  const courses = requirePermission('lms.course.manage')
  const id = (c) => c.req.param('id')

  // ---- course page --------------------------------------------------------
  app.get('/lms/courses/:id/overview', access, run('Error al cargar el curso.', async (c) => c.json({ data: await page.overview(companyId(c), actorId(c), id(c), { canManage: canManage(c) }) })))

  // ---- lesson resources ---------------------------------------------------
  app.get('/lms/lessons/:id/resources', courses, run('Error al cargar los recursos.', async (c) => c.json({ data: await files.listResources(companyId(c), id(c)) })))
  app.post('/lms/lessons/:id/resources', courses, run('Error al agregar el recurso.', async (c) => c.json({ data: await files.addResource(companyId(c), id(c), await body(c)) }, 201)))
  app.post('/lms/lessons/:id/resources/reorder', courses, run('Error al ordenar los recursos.', async (c) => c.json({ data: await files.reorderResources(companyId(c), id(c), await body(c)) })))
  app.patch('/lms/resources/:id', courses, run('Error al guardar el recurso.', async (c) => c.json({ data: await files.updateResource(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/resources/:id', courses, run('Error al eliminar el recurso.', async (c) => c.json({ data: await files.deleteResource(companyId(c), id(c)) })))

  return { resources: files }
}
