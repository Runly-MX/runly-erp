import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createStudioService } from './studio-service.js'
import { StudioError } from '../../../../shared/studio/document.js'

export function createStudioRouter({ prisma, requirePermission, service = createStudioService({ prisma }) }) {
  const app = new Hono()
  app.use('/studio/*', bodyLimit({ maxSize: 1_100_000, onError: c => c.json({ error: 'El diseño supera el tamaño permitido.' }, 413) }))
  const context = c => [c.get('companyId'), c.get('userContext')?.profile?.id]
  app.onError((error, c) => {
    if (error instanceof StudioError) return c.json({ error: error.message, code: error.code }, error.status)
    if (error instanceof SyntaxError) return c.json({ error: 'El diseño no contiene JSON válido.' }, 400)
    return c.json({ error: 'No se pudo procesar el diseño.' }, 500)
  })
  app.get('/studio/designs', requirePermission('studio.view'), async c => c.json({ data: await service.list(...context(c), c.req.query()) }))
  app.get('/studio/designs/:id', requirePermission('studio.view'), async c => c.json({ data: await service.get(...context(c), c.req.param('id')) }))
  app.post('/studio/designs', requirePermission('studio.create'), async c => c.json({ data: await service.create(...context(c), await c.req.json()) }, 201))
  app.put('/studio/designs/:id', requirePermission('studio.edit'), async c => c.json({ data: await service.update(...context(c), c.req.param('id'), await c.req.json()) }))
  return app
}
