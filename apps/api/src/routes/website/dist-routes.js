import { Hono } from 'hono'
import {websiteDocumentHash} from '../../services/website-draft-service.js'
import {releaseBytesHash} from '../../services/website-release-storage.js'
import {readWebsiteZipRequest} from './import-routes.js'
import { invalidateCache, invalidatePrimaryCache } from '../../services/dist-serve-service.js'
import { websiteErrorHandler, websiteAccessFromRequest, assertWebsiteAccess } from '../../services/website-authorization-service.js'
import { revisionedSiteSchema } from './validators.js'

const VALID_SOURCE_TYPES = new Set(['none', 'builder', 'dist'])

export function createDistRoutes({ prisma, supabaseAdmin, requirePermission, websiteSvc, publicationContext }) {
  const app = new Hono()
  app.onError(websiteErrorHandler)


  // Authority boundary only. The unsafe public ZIP publisher is not replaced
  // in this block; no new executable upload is permitted before isolation.
  const holdUnsafeMutation = (code, message) => async (c) => {
    const site = await prisma.websiteSite.findFirst({ where: { id: c.req.param('siteId'), companyId: c.get('companyId'), enabled: true }, select: { id: true } })
    if (!site) return c.json({ error: 'Recurso no encontrado.', code: 'resource_not_found' }, 404)
    return c.json({ error: message, code }, 409)
  }

  app.get(
    '/website/sites/:siteId/dist/builds',
    requirePermission('website.site.read'),
    async (c) => {
      try {
        const { siteId } = c.req.param()
        const companyId = c.get('companyId')
        const access=websiteAccessFromRequest(c)
        assertWebsiteAccess(access,companyId,'website.dist.upload')
        const site=await prisma.websiteSite.findFirst({where:{id:siteId,companyId,enabled:true}})
        if(!site)return c.json({error:'Recurso no encontrado.'},404)
        const rows=await prisma.websiteImport.findMany({where:{siteId,companyId},orderBy:{createdAt:'desc'},take:20})
        const builds=rows.map(row=>({id:row.id,name:'site.zip',size:row.manifest?.observed?.compressed??null,uploadedAt:row.createdAt,phase:row.phase,downloadUrl:`/website/sites/${siteId}/imports/${row.id}/archive`}))
        return c.json({ data: builds })
      } catch (err) {
        return websiteErrorHandler(err, c)
      }
    }
  )

  app.delete(
    '/website/sites/:siteId/dist/builds/:buildName',
    requirePermission('website.dist.upload'),
    holdUnsafeMutation('retention_required', 'Los archivos existentes se conservan; su eliminación requiere una política aprobada.')
  )

  app.get(
    '/website/sites/:siteId',
    requirePermission('website.site.read'),
    async (c) => {
      try {
        const { siteId } = c.req.param()
        const companyId = c.get('companyId')
        if (websiteSvc) return c.json({ data: await websiteSvc.getSite({ access: websiteAccessFromRequest(c), companyId, siteId }) })
        const rows = await prisma.$queryRaw`
          SELECT id, name, source_type as "sourceType",
                 dist_uploaded_at as "distUploadedAt",
                 dist_file_count as "distFileCount",
                 dist_has_prerender as "distHasPrerender"
          FROM website_site
          WHERE id = ${siteId}::uuid
            AND company_id = ${companyId}::uuid
            AND enabled = true
          LIMIT 1
        `
        if (!rows[0]) return c.json({ error: 'Sitio no encontrado' }, 404)
        return c.json({ data: rows[0] })
      } catch (err) {
        return websiteErrorHandler(err, c)
      }
    }
  )

  app.patch(
    '/website/sites/:siteId',
    requirePermission('website.site.update'),
    async (c) => {
      try {
        const { siteId } = c.req.param()
        const companyId = c.get('companyId')
        const actorId = c.get('userId') ?? null
        const body = await c.req.json().catch(() => ({}))
        if (!Object.hasOwn(body, 'sourceType') && websiteSvc) {
          const parsed = revisionedSiteSchema.safeParse(body)
          if (!parsed.success) return c.json({ error: 'Datos inválidos.', code: 'validation_failed' }, 422)
          const saved = await websiteSvc.saveSiteDraft({ access: websiteAccessFromRequest(c), companyId, siteId, data: parsed.data.identity, expectedRevision: parsed.data.expectedRevision, idempotencyKey: c.req.header('Idempotency-Key') })
          return c.json({ data: saved })
        }
        assertWebsiteAccess(websiteAccessFromRequest(c), companyId, 'website.pages.publish')
        const { sourceType } = body
        if (Object.keys(body).some(key => key !== 'sourceType') || !sourceType || !VALID_SOURCE_TYPES.has(sourceType)) {
          return c.json({ error: 'sourceType debe ser none, builder o dist' }, 422)
        }
        const managed=await prisma.websiteSite.findFirst({where:{id:siteId,companyId,enabled:true}})
        if(managed?.releaseManaged&&publicationContext) {
          if(sourceType!=='none')return c.json({error:'Usa un comando de publicación explícito.',code:'publication_requires_explicit_action'},409)
          if(managed.activeReleaseId)await publicationContext.releases.unpublish({access:websiteAccessFromRequest(c),companyId,siteId,expectedPublicationRevision:managed.publicationRevision,idempotencyKey:c.req.header('Idempotency-Key')??`legacy-unpublish-${managed.activeReleaseId}`})
          return c.json({data:{id:siteId,sourceType:'none'}})
        }
        const before = await prisma.$queryRaw`
          SELECT source_type FROM website_site
          WHERE id = ${siteId}::uuid AND company_id = ${companyId}::uuid AND enabled = true
          LIMIT 1
        `
        if (!before[0]) return c.json({ error: 'Sitio no encontrado' }, 404)
        if (sourceType === 'dist') return c.json({ error: 'La publicación ZIP requiere aislamiento acreditado.', code: 'isolation_required' }, 409)
        const updated = await prisma.$queryRaw`
          UPDATE website_site
          SET source_type = ${sourceType}
          WHERE id = ${siteId}::uuid
            AND company_id = ${companyId}::uuid
            AND enabled = true
          RETURNING id, name, source_type as "sourceType",
                    dist_uploaded_at as "distUploadedAt",
                    dist_file_count as "distFileCount",
                    dist_has_prerender as "distHasPrerender"
        `
        invalidateCache(companyId)
        invalidatePrimaryCache()
        await prisma.auditLog.create({
          data: {
            actorId,
            moduleKey: 'runly.website',
            entityType: 'website.site',
            entityId: siteId,
            action: 'site.source_type.update',
            before: JSON.stringify({ sourceType: before[0].source_type }),
            after: JSON.stringify({ sourceType }),
          },
        }).catch(() => {})
        return c.json({ data: updated[0] })
      } catch (err) {
        return websiteErrorHandler(err, c)
      }
    }
  )

  app.post(
    '/website/sites/:siteId/dist/upload',
    requirePermission('website.dist.upload'),
    requirePermission('website.site.update'),
    requirePermission('website.pages.publish'),
    async c=>{
      const companyId=c.get('companyId'),siteId=c.req.param('siteId'),access=websiteAccessFromRequest(c)
      const site=await prisma.websiteSite.findFirst({where:{id:siteId,companyId,enabled:true}})
      if(!site)return c.json({error:'Recurso no encontrado.'},404)
      const domains=await prisma.websiteDomain.findMany({where:{companyId,siteId,state:'assigned',ready:true}})
      if(!domains.length)return c.json({error:'El origen aislado no está habilitado.',code:'isolation_required'},409)
      for(const domain of domains)publicationContext.isolation.publicHost(domain.hostname)
      const body=await readWebsiteZipRequest(c);if(!body)return c.json({error:'Archivo excesivo.',code:'archive_too_large'},413)
      const idempotencyKey=c.req.header('Idempotency-Key')??`legacy-zip-${websiteDocumentHash({archive:releaseBytesHash(body.bytes),routingMode:body.routingMode,rootDirectory:body.rootDirectory??null})}`
      const imported=await publicationContext.imports.create({...body,companyId,siteId,access,idempotencyKey})
      const prior=await prisma.websiteDraftCommand.findFirst({where:{companyId,actorId:access.actorId,operation:`release.dist:${siteId}`,keyHash:websiteDocumentHash(idempotencyKey)}})
      const candidate=prior?.result??await publicationContext.releases.prepare({companyId,siteId,access,idempotencyKey,kind:'dist',importId:imported.id,baseReleaseId:site.activeReleaseId,expectedDraftRevision:site.draftRevision,expectedPublicationRevision:site.publicationRevision})
      const publication=await publicationContext.releases.activate({companyId,siteId,access,idempotencyKey,releaseId:candidate.id,manifestHash:candidate.manifestHash,expectedDraftRevision:candidate.draftRevision,expectedPublicationRevision:candidate.publicationRevision})
      return c.json({fileCount:imported.manifest.files.length,hasPrerender:imported.manifest.files.some(f=>f.path!=='index.html'&&f.mime==='text/html'),uploadedAt:imported.createdAt,releaseId:candidate.id,publication:publication.current})
    }
  )

  app.delete(
    '/website/sites/:siteId/dist',
    requirePermission('website.dist.upload'),
    requirePermission('website.site.update'),
    requirePermission('website.pages.publish'),
    holdUnsafeMutation('retention_required', 'Los archivos existentes se conservan; su eliminación requiere una política aprobada.')
  )

  return app
}
