import { Hono } from 'hono'
import { createDistUploadService } from '../../services/dist-upload-service.js'
import { invalidateCache, invalidatePrimaryCache } from '../../services/dist-serve-service.js'
import { websiteErrorHandler, websiteAccessFromRequest, assertWebsiteAccess } from '../../services/website-authorization-service.js'
import { revisionedSiteSchema } from './validators.js'

const VALID_SOURCE_TYPES = new Set(['none', 'builder', 'dist'])

export function createDistRoutes({ prisma, supabaseAdmin, requirePermission, websiteSvc }) {
  const app = new Hono()
  app.onError(websiteErrorHandler)
  const uploadService = createDistUploadService({ prisma, supabaseAdmin })

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
        const site = await prisma.$queryRaw`
          SELECT ws.id, c.slug as company_slug
          FROM website_site ws
          JOIN company c ON c.id = ws.company_id
          WHERE ws.id = ${siteId}::uuid AND ws.company_id = ${companyId}::uuid AND ws.enabled = true
          LIMIT 1
        `
        if (!site[0]) return c.json({ error: 'Sitio no encontrado' }, 404)
        const builds = await uploadService.listBuilds({ companySlug: site[0].company_slug })
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
    holdUnsafeMutation('isolation_required', 'La publicación ZIP requiere almacenamiento privado y aislamiento acreditado.')
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
