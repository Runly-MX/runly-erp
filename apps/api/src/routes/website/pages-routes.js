import { normalizeWebsiteDocument, websiteDocumentHash } from '../../services/website-draft-service.js'
import { BLOCK_CATALOG } from './page-document.js'
import { websiteAccessFromRequest, websiteErrorHandler } from '../../services/website-authorization-service.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createPageSchema, updatePageSchema, saveDraftSchema, revisionedDraftSchema } from './validators.js'
import { WebsiteServiceError } from './service-helpers.js'

export function createPagesRouter({ websiteSvc, requirePermission }) {
  const app = new Hono()
  app.onError(websiteErrorHandler)

  app.get('/pages', requirePermission('website.pages.read'), async (c) => {
    const companyId = c.get('companyId')
    const { siteId, page, pageSize, page_type, status } = c.req.query()
    const site = siteId
      ? { id: siteId }
      : await websiteSvc.getDefaultPageSite({ access: websiteAccessFromRequest(c), companyId })
    if (!site) return c.json({ data: [], total: 0 })
    const result = await websiteSvc.listPages({ access: websiteAccessFromRequest(c), companyId,
      siteId:   site.id,
      page:     parseInt(page     ?? '1',  10),
      pageSize: parseInt(pageSize ?? '30', 10),
      pageType: page_type ?? null,
      status:   status ?? null,
    })
    return c.json(result)
  })

  // Find a page by its routePath (for inline editor — includes drafts)
  app.get('/pages/by-path', requirePermission('website.pages.read'), async (c) => {
    const companyId = c.get('companyId')
    const { siteId, routePath } = c.req.query()
    if (!siteId || !routePath) return c.json({ data: null })
    try {
      const page = await websiteSvc.getPageByPath({ access: websiteAccessFromRequest(c), companyId, siteId, routePath })
      return c.json({ data: page })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message, code: err.code }, err.status)
      throw err
    }
  })

  app.post(
    '/pages',
    requirePermission('website.pages.create'),
    zValidator('json', createPageSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      const data      = c.req.valid('json')
      try {
        const page = await websiteSvc.createPage({ access: websiteAccessFromRequest(c), companyId,
          siteId: data.siteId,
          data,
          idempotencyKey: c.req.header('Idempotency-Key'),
          actorId,
        })
        return c.json(page, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) {
          return c.json({ error: err.message, code: err.code }, err.status)
        }
        throw err
      }
    },
  )

  app.get('/pages/:id', requirePermission('website.pages.read'), async (c) => {
    const companyId = c.get('companyId')
    try {
      const page = await websiteSvc.getPage({ access: websiteAccessFromRequest(c), companyId, pageId: c.req.param('id') })
      return c.json({ data: page })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message, code: err.code }, err.status)
      throw err
    }
  })

  app.patch(
    '/pages/:id',
    requirePermission('website.pages.update'),
    zValidator('json', updatePageSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      try {
        const updated = await websiteSvc.updatePage({ access: websiteAccessFromRequest(c), companyId,
          pageId: c.req.param('id'),
          data:   c.req.valid('json'),
          actorId,
        })
        return c.json(updated)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message, code: err.code }, err.status)
        throw err
      }
    },
  )

  app.post(
    '/pages/:id/save-draft',
    requirePermission('website.pages.update'),
    zValidator('json', saveDraftSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      const { builderData, seo, expectedRevision } = c.req.valid('json')
      try {
        const updated = await websiteSvc.saveDraft({ access: websiteAccessFromRequest(c), companyId,
          pageId: c.req.param('id'),
          builderData,
          seo, expectedRevision, idempotencyKey: c.req.header('Idempotency-Key'),
          actorId,
        })
        if (expectedRevision === undefined) c.header('Warning', '299 - Legacy last-write-wins; provide expectedRevision')
        return c.json(updated)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message, code: err.code }, err.status)
        throw err
      }
    },
  )

  // POST /pages/:id/draft — alias used by the web builder editor (sends draft_builder_data)
  app.post('/pages/:id/draft', requirePermission('website.pages.update'), async (c) => {
    const companyId = c.get('companyId')
    const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
    try {
      const body = await c.req.json().catch(() => { throw new WebsiteServiceError('JSON inválido.', 400, 'validation_failed') })
      const sourceKeys = ['draft_builder_data', 'builderData'].filter(key => Object.hasOwn(body ?? {}, key))
      if (!body || Array.isArray(body) || sourceKeys.length !== 1 || Object.keys(body).some(key => !['draft_builder_data','builderData','seo','expectedRevision'].includes(key))) return c.json({ error: 'Documento requerido y campos inválidos.', code: 'validation_failed' }, 422)
      const builderData = body[sourceKeys[0]]
      const updated = await websiteSvc.saveDraft({ access: websiteAccessFromRequest(c), companyId,
        pageId: c.req.param('id'),
        builderData,
        seo: body.seo, expectedRevision: body.expectedRevision, idempotencyKey: c.req.header('Idempotency-Key'),
        actorId,
      })
      if (body.expectedRevision === undefined) c.header('Warning', '299 - Legacy last-write-wins; provide expectedRevision')
      return c.json({ ok: true, data: updated })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message, code: err.code }, err.status)
      return c.json({ error: 'Internal error' }, 500)
    }
  })

  app.post('/pages/:id/publish', requirePermission('website.pages.publish'), async (c) => {
    const companyId = c.get('companyId')
    const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
    try {
      const published = await websiteSvc.publishPage({ access: websiteAccessFromRequest(c), companyId,
        pageId: c.req.param('id'),
        actorId,
      })
      return c.json(published)
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message, code: err.code }, err.status)
      throw err
    }
  })

  app.delete('/pages/:id', requirePermission('website.pages.delete'), async (c) => {
    const companyId = c.get('companyId')
    const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
    try {
      await websiteSvc.softDeletePage({ access: websiteAccessFromRequest(c), companyId, pageId: c.req.param('id'), actorId })
      return c.json({ success: true })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message, code: err.code }, err.status)
      throw err
    }
  })

  app.get('/sites/:siteId/pages', requirePermission('website.pages.read'), async c => {
    const result = await websiteSvc.listPages({ access: websiteAccessFromRequest(c), companyId: c.get('companyId'), siteId: c.req.param('siteId') })
    return c.json(result)
  })
  app.post('/sites/:siteId/pages', requirePermission('website.pages.create'), zValidator('json', createPageSchema.omit({ siteId: true })), async c => {
    const key = c.req.header('Idempotency-Key')
    if (!key || key.length < 16 || key.length > 200) return c.json({ error: 'Idempotency-Key requerida.', code: 'validation_failed' }, 422)
    return c.json({ data: await websiteSvc.createPage({ access: websiteAccessFromRequest(c), companyId: c.get('companyId'), siteId: c.req.param('siteId'), data: c.req.valid('json'), idempotencyKey: key }) }, 201)
  })
  app.get('/sites/:siteId/pages/:pageId/draft', requirePermission('website.pages.read'), async c => {
    const page = await websiteSvc.getPage({ access: websiteAccessFromRequest(c), companyId: c.get('companyId'), siteId: c.req.param('siteId'), pageId: c.req.param('pageId') })
    let document = page.draftBuilderData, issues = []
    try { document = normalizeWebsiteDocument(document ?? {}, { strict: true }) } catch (error) { issues = [error.code ?? 'validation_failed'] }
    const known = new Set(BLOCK_CATALOG.blocks.map(block => block.type))
    if (document && typeof document === 'object' && Object.values(document.blocks ?? {}).some(block => !known.has(block?.type))) issues.push('unknown_block_type')
    c.header('Cache-Control', 'no-store')
    return c.json({ data: { pageId: page.id, siteId: page.siteId, revision: page.revision, document, documentHash: websiteDocumentHash(document), metadata: page.draftMetadata, seo: page.draftSeo, issues } })
  })
  app.put('/sites/:siteId/pages/:pageId/draft', requirePermission('website.pages.update'), zValidator('json', revisionedDraftSchema), async c => {
    const { document, seo, metadata, expectedRevision } = c.req.valid('json')
    const result = await websiteSvc.saveDraft({ access: websiteAccessFromRequest(c), companyId: c.get('companyId'), siteId: c.req.param('siteId'), pageId: c.req.param('pageId'), builderData: document, seo, metadata, expectedRevision, strictDocument: true, idempotencyKey: c.req.header('Idempotency-Key') })
    return c.json({ data: { pageId: result.id, siteId: result.siteId, revision: result.revision, document: result.draftBuilderData, documentHash: result.documentHash, metadata: result.draftMetadata, seo: result.draftSeo } })
  })
  return app
}
