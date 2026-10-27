import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { tenantActiveContext } from '../../../lib/active-context.js'
import { StudioError } from '../../../../../shared/studio/document.js'
import { createStudioInterchange } from './service.js'
import { PACKAGE_LIMITS, PACKAGE_MIME } from './zip.js'
import { manifestSchema } from './package.js'

export function createStudioInterchangeRouter({ prisma, filesService, supabaseAdmin, service: designs, templates, requirePermission, onInternalError, interchange = createStudioInterchange({ prisma, filesService, supabaseAdmin, designs, templates }) }) {
  const app = new Hono(), prefix = '/studio/interchange'
  const actor = c => [c.get('companyId'), c.get('userContext')?.profile?.id]
  const files = c => ({ authUserId: c.get('authUserId'), activeContext: tenantActiveContext(c) })
  app.onError((error, c) => {
    if (error.name === 'AbortError') return c.body(null, 499)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'La solicitud de intercambio no es válida.' }, 400)
    if (error instanceof StudioError) return c.json({ error: error.message, code: error.code }, error.status)
    onInternalError?.(error)
    return c.json({ error: 'No se pudo procesar el intercambio de Studio.' }, 500)
  })
  app.use(`${prefix}/*`, requirePermission('studio.view'), async (c, next) => {
    c.header('Cache-Control', 'private, no-store')
    return interchange.withCapacity(next)
  })
  app.use(`${prefix}/*`, bodyLimit({ maxSize: PACKAGE_LIMITS.compressed + 65536, onError: c => c.json({ error: 'El paquete supera 64 MiB.' }, 413) }))
  app.use(`${prefix}/*`, async (c, next) => {
    if (c.req.method === 'POST' && c.req.header('X-Runly-Studio-Protocol') !== '3') throw new StudioError('Actualiza el cliente de Studio.', 426)
    await next()
  })
  async function upload(c) {
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File) || !file.size || file.size > PACKAGE_LIMITS.compressed) throw new StudioError('Falta un archivo compatible de hasta 64 MiB.', 413)
    let mime = file.type
    if (['', 'application/zip', 'application/octet-stream'].includes(mime) && file.name.endsWith('.runlystudio')) mime = PACKAGE_MIME
    return { bytes: Buffer.from(await file.arrayBuffer()), mime, body }
  }
  app.post(`${prefix}/inspect`, async c => { const input = await upload(c); return c.json({ data: await interchange.inspect(input.bytes, input.mime) }) })
  app.get(`${prefix}/schema`, c => c.json({ data: { formatVersion: 1, documentSchemaVersion: 7, mime: PACKAGE_MIME, limits: PACKAGE_LIMITS, manifest: z.toJSONSchema(manifestSchema),
    exportNotice: 'El paquete incluirá copias completas de todas las imágenes del documento, incluidas las ocultas y recortadas. Esas copias y sus metadatos podrán salir de la empresa.',
    adapters: { svg: { version: 1, maxBytes: 32000, transforms: ['translate'], text: false, externalResources: false }, openRaster: false, odg: false },
  } }))
  app.post(`${prefix}/imports`, async c => {
    const input = await upload(c), options = JSON.parse(input.body.options ?? '{}')
    return c.json({ data: await interchange.prepare(...actor(c), input.bytes, input.mime, options, files(c), c.req.raw.signal) }, 201)
  })
  app.post(`${prefix}/recover`, async c => c.json({ data: await interchange.recover(...actor(c)) }))
  app.get(`${prefix}/imports/:id`, async c => c.json({ data: await interchange.status(...actor(c), c.req.param('id')) }))
  app.get(`${prefix}/imports/:id/assets/:resourceId`, async c => {
    const result = await interchange.previewAsset(...actor(c), c.req.param('id'), c.req.param('resourceId'), c.req.raw.signal)
    c.header('Content-Type', result.mime); return c.body(result.bytes)
  })
  app.post(`${prefix}/imports/:id/confirm`, async c => c.json({ data: await interchange.confirm(...actor(c), c.req.param('id'), await c.req.json(), files(c), c.req.raw.signal) }, 201))
  app.delete(`${prefix}/imports/:id`, async c => c.json({ data: await interchange.cancel(...actor(c), c.req.param('id')) }))
  for (const [segment, kind] of [['designs','design'], ['templates','template']]) app.post(`${prefix}/${segment}/:id/export`, async c => {
    const bytes = await interchange.exportPackage(...actor(c), kind, c.req.param('id'), await c.req.json(), files(c), c.req.raw.signal)
    c.header('Content-Type', PACKAGE_MIME); c.header('Content-Disposition', 'attachment; filename="plantilla.runlystudio"')
    return c.body(bytes)
  })
  interchange.startCleanup()
  return app
}
