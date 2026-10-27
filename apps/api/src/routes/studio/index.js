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
import { buildPrintPdf } from './studio-print.js'
import {STUDIO_PROTOCOL_VERSION,STUDIO_PROTOCOL_HEADER} from '../../../../shared/studio/protocol.js'
import {studioAssetIds} from './studio-document-data.js'
import {checkAbort} from '../../../../shared/studio/abort.js'
import {createStudioPrintJobs} from './studio-print-jobs.js'
import {documentPages, pageDocument} from '../../../../shared/studio/pages.js'

export function createStudioRouter({ prisma, requirePermission, filesService, broadcaster, supabaseAdmin,printBuilder=buildPrintPdf,
  service = createStudioService({ prisma, filesService, broadcaster }),
  templates = createStudioTemplatesService({ prisma, filesService, supabaseAdmin, designService: service }) }) {
  const app = new Hono()
  const collaboration = createStudioCollaboration({ prisma, access: service.access, broadcaster, supabaseAdmin })
  const resources = createStudioResources({ access: service.access, filesService, supabaseAdmin })
  const catalog = createStudioCatalog({ prisma, access: service.access, filesService, supabaseAdmin })
  const imageCopies = createStudioImageCopies({prisma,access:service.access,filesService})
  const printJobs = createStudioPrintJobs({getDesign: (...args) => service.access.get(...args), builder: printBuilder,
    authorizeAssets: async (companyId, ids) => {
      if (!ids.length) return
      const found = await prisma.fileAsset.findMany({where:{id:{in:ids},entityId:companyId,enabled:true},select:{id:true}})
      if (found.length !== ids.length) throw new StudioError('Un archivo dejó de estar disponible.',403,'STUDIO_ASSET_DENIED')
    },
  })
  // High-resolution print renders are larger than documents and photo copies.
  const bodyMax = path => /\/export\/(?:print-pdf|jobs\/[^/]+\/pages\/[^/]+)$/.test(path) ? 64 * 1024 * 1024 : /^\/studio\/designs\/[^/]+\/assets\/[^/]+\/edited-copy$/.test(path) ? 11 * 1024 * 1024 : 4_100_000
  app.use('/studio/*', (c,next) => bodyLimit({ maxSize: bodyMax(c.req.path),
    onError: c => c.json({ error: 'El contenido supera el tamaño permitido.' }, 413) })(c,next))
  const context = c => [c.get('companyId'), c.get('userContext')?.profile?.id]
  const fileContext = c => ({ authUserId: c.get('authUserId'), activeContext: tenantActiveContext(c) })
  app.use('/studio/designs/:id/live', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'Presencia demasiado grande.' }, 413) }))
  app.onError((error, c) => {
    if(error.name==='AbortError')return c.body(null,499)
    if (error instanceof StudioError) {
      if(error.status===429)c.header('Retry-After','60')
      return c.json({ error: error.message, code: error.code }, error.status)
    }
    if (error instanceof SyntaxError) return c.json({ error: 'El diseño no contiene JSON válido.' }, 400)
    return c.json({ error: 'No se pudo procesar el diseño.' }, 500)
  })
  app.get('/studio/designs', requirePermission('studio.view'), async c => c.json({ data: await service.list(...context(c), c.req.query()) }))
  app.get('/studio/protocol',requirePermission('studio.view'),async c=>{await service.access.member(...context(c));c.header('Cache-Control','no-store');return c.json({data:{version:STUDIO_PROTOCOL_VERSION,schemaVersion:7}})})
  app.use('/studio/designs/:id',async(c,next)=>{if(c.req.method==='PUT'&&c.req.header(STUDIO_PROTOCOL_HEADER)!==String(STUDIO_PROTOCOL_VERSION))throw new StudioError('Actualiza Studio antes de guardar. El borrador se conserva.',426,'STUDIO_UPGRADE_REQUIRED');await next()})
  app.use('/studio/designs/:id/changes',async(c,next)=>{if(c.req.method==='POST'&&c.req.header(STUDIO_PROTOCOL_HEADER)!==String(STUDIO_PROTOCOL_VERSION))throw new StudioError('Actualiza Studio antes de guardar. El borrador se conserva.',426,'STUDIO_UPGRADE_REQUIRED');await next()})
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
  app.get('/studio/designs/:id/pages',requirePermission('studio.view'),async c => {
    const record=await service.get(...context(c),c.req.param('id'))
    c.header('Cache-Control','private, no-store')
    return c.json({data:{revision:record.revision,pages:documentPages(record.document).map(({page,objects})=>({...page,objectCount:objects.length}))}})
  })
  app.get('/studio/designs/:id/pages/:pageId',requirePermission('studio.view'),async c => {
    const record=await service.get(...context(c),c.req.param('id'))
    if(!documentPages(record.document).some(scene=>scene.page.id===c.req.param('pageId')))throw new StudioError('La página ya no existe.',404)
    c.header('Cache-Control','private, no-store')
    return c.json({data:{revision:record.revision,canEdit:record.canEdit,document:pageDocument(record.document,c.req.param('pageId'))}})
  })
  app.post('/studio/designs', requirePermission('studio.create'), async c => c.json({ data: await service.create(...context(c), await c.req.json(), fileContext(c)) }, 201))
  app.put('/studio/designs/:id', requirePermission('studio.edit'), async c => c.json({ data: await service.update(...context(c), c.req.param('id'), await c.req.json(), fileContext(c)) }))
  // Real-time collaboration: a batch of object operations from an editor session.
  // Print PDF (RGB or CMYK, bleed, crop marks) from the editor's high-resolution render.
  app.post('/studio/designs/:id/export/jobs',requirePermission('studio.view'),async c =>
    c.json({data:await printJobs.create(...context(c),c.req.param('id'),await c.req.json(),c.req.raw.signal)},201))
  app.post('/studio/designs/:id/export/jobs/:jobId/pages/:pageId',requirePermission('studio.view'),async c => {
    const image=async()=>{
      const body=await c.req.parseBody()
      if(!(body.file instanceof Blob))throw new StudioError('Falta la imagen de exportación.')
      return Buffer.from(await body.file.arrayBuffer())
    }
    return c.json({data:await printJobs.append(...context(c),c.req.param('id'),c.req.param('jobId'),c.req.param('pageId'),image,c.req.raw.signal)})
  })
  app.post('/studio/designs/:id/export/jobs/:jobId/finish',requirePermission('studio.view'),async c => {
    const pdf=await printJobs.finish(...context(c),c.req.param('id'),c.req.param('jobId'),c.req.raw.signal)
    c.header('Content-Type','application/pdf');c.header('Cache-Control','private, no-store');c.header('Content-Disposition','attachment; filename="studio.pdf"')
    return c.body(pdf)
  })
  app.delete('/studio/designs/:id/export/jobs/:jobId',requirePermission('studio.view'),async c =>
    c.json({data:await printJobs.cancel(...context(c),c.req.param('id'),c.req.param('jobId'))}))
  app.post('/studio/designs/:id/export/print-pdf', requirePermission('studio.view'), async c => {
    const signal=c.req.raw.signal;checkAbort(signal)
    const before=await service.access.get(...context(c), c.req.param('id'))
    const assetIds=studioAssetIds(before.document)
    async function checkAssets(){if(!assetIds.length)return;const found=await prisma.fileAsset.findMany({where:{id:{in:assetIds},entityId:context(c)[0],enabled:true},select:{id:true}});if(found.length!==assetIds.length)throw new StudioError('Un archivo dejó de estar disponible.',403,'STUDIO_ASSET_DENIED')}
    await checkAssets()
    const body = await c.req.parseBody()
    if(before.document.additionalPages?.length && !body.pageId)throw new StudioError('Utiliza la exportación multipágina o indica la página que quieres imprimir.')
    if(body.pageId && ![before.document,...(before.document.additionalPages??[])].some(scene=>(scene.page.id??'page-1')===body.pageId))throw new StudioError('La página ya no existe.',409)
    if (!(body.file instanceof Blob)) throw new StudioError('Falta la imagen de exportación.')
    if(!Number.isSafeInteger(Number(body.revision))||Number(body.revision)!==before.revision)throw new StudioError('Revisa la revisión actual antes de imprimir.',409,'STUDIO_REVISION_CONFLICT')
    const pdf = await printBuilder({ image: Buffer.from(await body.file.arrayBuffer()), widthMm: body.widthMm, heightMm: body.heightMm,
      bleedMm: body.bleedMm, cropMarks: body.cropMarks === 'true', profile: body.profile, title: body.title,signal })
    checkAbort(signal)
    const after=await service.access.get(...context(c),c.req.param('id'))
    await checkAssets()
    if(after.revision!==before.revision)throw new StudioError('El diseño cambió durante el procesamiento.',409,'STUDIO_REVISION_CONFLICT')
    c.header('Cache-Control', 'private, no-store'); c.header('Content-Type', 'application/pdf')
    return c.body(pdf)
  })
  app.post('/studio/designs/:id/changes', requirePermission('studio.edit'), async c => c.json({ data: await service.applyChanges(...context(c), c.req.param('id'), await c.req.json(), fileContext(c)) }))
  app.get('/studio/designs/:id/changes', requirePermission('studio.view'), async c => c.json({data:await service.changeReceipt(...context(c),c.req.param('id'),{clientId:c.req.query('clientId'),batchId:Number(c.req.query('batchId'))})}))
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
