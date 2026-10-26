import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createStudioService } from './studio-service.js'
import { StudioError } from '../../../../shared/studio/document.js'
import { createStudioCollaboration } from './studio-collaboration.js'
import { tenantActiveContext } from '../../lib/active-context.js'
import { createStudioResources } from './studio-resources.js'
import { createStudioTemplatesService } from './studio-templates-service.js'
import { createStudioCatalog } from './catalog/service.js'
import { createStudioImageCopies } from './studio-image-copies.js'

export function createStudioRouter({ prisma, requirePermission, filesService, broadcaster, supabaseAdmin,
  service = createStudioService({ prisma, filesService, broadcaster }),
  templates = createStudioTemplatesService({ prisma, filesService, supabaseAdmin, designService: service }) }) {
  const app = new Hono()
  const collaboration = createStudioCollaboration({ prisma, access: service.access, broadcaster, supabaseAdmin })
  const resources = createStudioResources({ access: service.access, filesService, supabaseAdmin })
  const catalog = createStudioCatalog({ prisma, access: service.access, filesService, supabaseAdmin })
  const imageCopies = createStudioImageCopies({prisma,access:service.access,filesService})
  app.use('/studio/*', (c,next) => bodyLimit({ maxSize: /^\/studio\/designs\/[^/]+\/assets\/[^/]+\/edited-copy$/.test(c.req.path) ? 11 * 1024 * 1024 : 1_100_000,
    onError: c => c.json({ error: 'El contenido supera el tamaño permitido.' }, 413) })(c,next))
  const context = c => [c.get('companyId'), c.get('userContext')?.profile?.id]
  const fileContext = c => ({ authUserId: c.get('authUserId'), activeContext: tenantActiveContext(c) })
  app.use('/studio/designs/:id/live', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'Presencia demasiado grande.' }, 413) }))
  app.onError((error, c) => {
    if (error instanceof StudioError) {
      if(error.status===429)c.header('Retry-After','60')
      return c.json({ error: error.message, code: error.code }, error.status)
    }
    if (error instanceof SyntaxError) return c.json({ error: 'El diseño no contiene JSON válido.' }, 400)
    return c.json({ error: 'No se pudo procesar el diseño.' }, 500)
  })
  app.get('/studio/designs', requirePermission('studio.view'), async c => c.json({ data: await service.list(...context(c), c.req.query()) }))
  app.post('/studio/designs/:id/assets/:fileId/edited-copy',requirePermission('studio.edit'),async c => {
    const body = await c.req.parseBody()
    return c.json({data:await imageCopies.create(...context(c),c.req.param('id'),c.req.param('fileId'),body.file,fileContext(c))},201)
  })
  app.get('/studio/catalog/:provider/search', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store')
    return c.json({ data: await catalog.search(...context(c), c.req.param('provider'), c.req.query()) })
  })
  app.get('/studio/catalog/:provider/:id', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store')
    return c.json({ data: await catalog.details(...context(c), c.req.param('provider'), c.req.param('id')) })
  })
  app.get('/studio/catalog/:provider/:id/thumbnail', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store'); c.header('Content-Type', 'image/png')
    return c.body(await catalog.thumbnail(...context(c), c.req.param('provider'), c.req.param('id')))
  })
  app.post('/studio/catalog/:provider/:id/import', requirePermission('studio.edit'), async c => {
    const body = await c.req.json()
    return c.json({ data: await catalog.insert(...context(c), c.req.param('provider'), c.req.param('id'), body.designId, fileContext(c)) })
  })
  app.post('/studio/designs/:id/credits', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store')
    return c.json({ data: await catalog.credits(...context(c), c.req.param('id'), (await c.req.json()).document, fileContext(c)) })
  })
  app.get('/studio/templates', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store')
    return c.json({ data: await templates.list(...context(c), c.req.query()) })
  })
  app.get('/studio/templates/:id/assets/:fileId/signed-url', requirePermission('studio.view'), async c => {
    c.header('Cache-Control','private, no-store')
    return c.json({data:await templates.signedAsset(...context(c),c.req.param('id'),c.req.param('fileId'))})
  })
  app.get('/studio/templates/:id', requirePermission('studio.view'), async c => {
    c.header('Cache-Control', 'private, no-store')
    return c.json({ data: await templates.get(...context(c),c.req.param('id')) })
  })
  app.post('/studio/templates', requirePermission('studio.view'), async c => c.json({data:await templates.create(...context(c),await c.req.json(),fileContext(c))},201))
  app.put('/studio/templates/:id', requirePermission('studio.view'), async c => c.json({data:await templates.update(...context(c),c.req.param('id'),await c.req.json(),fileContext(c))}))
  app.post('/studio/templates/:id/publish', requirePermission('studio.templates.publish'), async c => c.json({data:await templates.publish(...context(c),c.req.param('id'),await c.req.json(),fileContext(c))}))
  app.delete('/studio/templates/:id', requirePermission('studio.view'), async c => c.json({data:await templates.remove(...context(c),c.req.param('id'),await c.req.json(),fileContext(c))}))
  for (const suffix of ['designs','use']) app.post(`/studio/templates/:key/${suffix}`,requirePermission('studio.create'),async c =>
    c.json({data:await templates.use(...context(c),c.req.param('key'),fileContext(c))},201))
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
