import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createStudioService } from './studio-service.js'
import { StudioError } from '../../../../shared/studio/document.js'
import { createStudioCollaboration } from './studio-collaboration.js'
import { tenantActiveContext } from '../../lib/active-context.js'
import { createStudioResources } from './studio-resources.js'

export function createStudioRouter({ prisma, requirePermission, filesService, broadcaster, supabaseAdmin,
  service = createStudioService({ prisma, filesService, broadcaster }) }) {
  const app = new Hono()
  const collaboration = createStudioCollaboration({ prisma, access: service.access, broadcaster, supabaseAdmin })
  const resources = createStudioResources({ access: service.access, filesService, supabaseAdmin })
  app.use('/studio/*', bodyLimit({ maxSize: 1_100_000, onError: c => c.json({ error: 'El diseño supera el tamaño permitido.' }, 413) }))
  const context = c => [c.get('companyId'), c.get('userContext')?.profile?.id]
  const fileContext = c => ({ authUserId: c.get('authUserId'), activeContext: tenantActiveContext(c) })
  app.use('/studio/designs/:id/live', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'Presencia demasiado grande.' }, 413) }))
  app.onError((error, c) => {
    if (error instanceof StudioError) return c.json({ error: error.message, code: error.code }, error.status)
    if (error instanceof SyntaxError) return c.json({ error: 'El diseño no contiene JSON válido.' }, 400)
    return c.json({ error: 'No se pudo procesar el diseño.' }, 500)
  })
  app.get('/studio/designs', requirePermission('studio.view'), async c => c.json({ data: await service.list(...context(c), c.req.query()) }))
  app.get('/studio/resources', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store')
    return c.json({ data: await resources.list(...context(c), c.req.query(), fileContext(c)) })
  })
  app.get('/studio/resources/:id/thumbnail', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store'); c.header('Content-Type', 'image/png')
    return c.body(await resources.thumbnail(...context(c), c.req.param('id'), fileContext(c)))
  })
  app.get('/studio/designs/:id', requirePermission('studio.view'), async c => c.json({ data: await service.get(...context(c), c.req.param('id')) }))
  app.post('/studio/designs', requirePermission('studio.create'), async c => c.json({ data: await service.create(...context(c), await c.req.json(), fileContext(c)) }, 201))
  app.put('/studio/designs/:id', requirePermission('studio.edit'), async c => c.json({ data: await service.update(...context(c), c.req.param('id'), await c.req.json(), fileContext(c)) }))
  app.get('/studio/designs/:id/collaborators', requirePermission('studio.view'), async c => c.json({ data: await collaboration.collaborators(...context(c), c.req.param('id')) }))
  app.get('/studio/designs/:id/candidates', requirePermission('studio.edit'), async c => c.json({ data: await collaboration.candidates(...context(c), c.req.param('id'), c.req.query('q')) }))
  app.put('/studio/designs/:id/collaborators', requirePermission('studio.edit'), async c => c.json({ data: await collaboration.share(...context(c), c.req.param('id'), await c.req.json()) }))
  app.get('/studio/designs/:id/assets/:fileId/signed-url', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'no-store')
    return c.json({ data: await collaboration.signedAsset(...context(c), c.req.param('id'), c.req.param('fileId')) })
  })
  app.post('/studio/designs/:id/live', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'no-store')
    return c.json({ data: await collaboration.live(...context(c), c.req.param('id'), await c.req.json()) })
  })
  return app
}
