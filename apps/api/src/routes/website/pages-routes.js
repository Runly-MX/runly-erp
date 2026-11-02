import { websiteAccessFromRequest, websiteErrorHandler } from '../../services/website-authorization-service.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createPageSchema, updatePageSchema, saveDraftSchema } from './validators.js'
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
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
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
          actorId,
        })
        return c.json(page, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) {
          return c.json({ error: err.message }, err.status)
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
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
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
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
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
      const { builderData, seo } = c.req.valid('json')
      try {
        const updated = await websiteSvc.saveDraft({ access: websiteAccessFromRequest(c), companyId,
          pageId: c.req.param('id'),
          builderData,
          seo,
          actorId,
        })
        return c.json(updated)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  // POST /pages/:id/draft — alias used by the web builder editor (sends draft_builder_data)
  app.post('/pages/:id/draft', requirePermission('website.pages.update'), async (c) => {
    const companyId = c.get('companyId')
    const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
    try {
      const body = await c.req.json()
      const builderData = body.draft_builder_data ?? body.builderData ?? {}
      const updated = await websiteSvc.saveDraft({ access: websiteAccessFromRequest(c), companyId,
        pageId: c.req.param('id'),
        builderData,
        seo: body.seo,
        actorId,
      })
      return c.json({ ok: true, data: updated })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      console.error('[POST /website/pages/:id/draft]', err?.message)
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
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
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
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  return app
}
