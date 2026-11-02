import { websiteAccessFromRequest, websiteErrorHandler } from '../../services/website-authorization-service.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  createBlogCategorySchema, updateBlogCategorySchema,
  createBlogPostSchema,
  updateBlogPostSchema,
  saveBlogDraftSchema,
} from './validators.js'
import { WebsiteServiceError } from './service-helpers.js'

export function createBlogRouter({ websiteSvc, requirePermission }) {
  const app = new Hono()
  app.onError(websiteErrorHandler)

  // ─── Categories ────────────────────────────────────────────────────────────

  app.get('/blog/categories', requirePermission('website.pages.read'), async (c) => {
    const companyId = c.get('companyId')
    const siteId    = c.req.query('siteId')
    if (!siteId) return c.json({ data: [] })
    const cats = await websiteSvc.listBlogCategories({ access: websiteAccessFromRequest(c), companyId, siteId })
    return c.json({ data: cats })
  })

  app.post(
    '/blog/categories',
    requirePermission('website.pages.create'),
    zValidator('json', createBlogCategorySchema),
    async (c) => {
      const companyId = c.get('companyId')
      const data      = c.req.valid('json')
      try {
        const cat = await websiteSvc.createBlogCategory({ access: websiteAccessFromRequest(c), companyId, siteId: data.siteId, data })
        return c.json(cat, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.patch('/blog/categories/:id', requirePermission('website.pages.update'), zValidator('json', updateBlogCategorySchema), async (c) => {
    const companyId = c.get('companyId')
    const data      = c.req.valid('json')
    try {
      const cat = await websiteSvc.updateBlogCategory({ access: websiteAccessFromRequest(c), companyId, categoryId: c.req.param('id'), data })
      return c.json(cat)
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  app.delete('/blog/categories/:id', requirePermission('website.pages.delete'), async (c) => {
    const companyId = c.get('companyId')
    try {
      await websiteSvc.softDeleteBlogCategory({ access: websiteAccessFromRequest(c), companyId, categoryId: c.req.param('id') })
      return c.json({ success: true })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  // ─── Posts ──────────────────────────────────────────────────────────────────

  app.get('/blog/posts', requirePermission('website.pages.read'), async (c) => {
    const companyId = c.get('companyId')
    const { siteId, status, categoryId, page, pageSize } = c.req.query()
    if (!siteId) return c.json({ data: [], total: 0 })
    const result = await websiteSvc.listBlogPosts({ access: websiteAccessFromRequest(c), companyId, siteId, status, categoryId,
      page:     parseInt(page     ?? '1',  10),
      pageSize: parseInt(pageSize ?? '20', 10),
    })
    return c.json(result)
  })

  app.post(
    '/blog/posts',
    requirePermission('website.pages.create'),
    zValidator('json', createBlogPostSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      const data      = c.req.valid('json')
      try {
        const post = await websiteSvc.createBlogPost({ access: websiteAccessFromRequest(c), companyId, siteId: data.siteId, data, actorId })
        return c.json(post, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.get('/blog/posts/:id', requirePermission('website.pages.read'), async (c) => {
    const companyId = c.get('companyId')
    try {
      const post = await websiteSvc.getBlogPost({ access: websiteAccessFromRequest(c), companyId, postId: c.req.param('id') })
      return c.json(post)
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  app.patch(
    '/blog/posts/:id',
    requirePermission('website.pages.update'),
    zValidator('json', updateBlogPostSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      const data      = c.req.valid('json')
      try {
        const post = await websiteSvc.updateBlogPost({ access: websiteAccessFromRequest(c), companyId, postId: c.req.param('id'), data, actorId })
        return c.json(post)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.post(
    '/blog/posts/:id/save-draft',
    requirePermission('website.pages.update'),
    zValidator('json', saveBlogDraftSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const { builderData, seo } = c.req.valid('json')
      try {
        const post = await websiteSvc.saveBlogDraft({ access: websiteAccessFromRequest(c), companyId, postId: c.req.param('id'), builderData, seo })
        return c.json(post)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.post('/blog/posts/:id/publish', requirePermission('website.pages.publish'), async (c) => {
    const companyId = c.get('companyId')
    const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
    try {
      const post = await websiteSvc.publishBlogPost({ access: websiteAccessFromRequest(c), companyId, postId: c.req.param('id'), actorId })
      return c.json(post)
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  app.delete('/blog/posts/:id', requirePermission('website.pages.delete'), async (c) => {
    const companyId = c.get('companyId')
    try {
      await websiteSvc.softDeleteBlogPost({ access: websiteAccessFromRequest(c), companyId, postId: c.req.param('id') })
      return c.json({ success: true })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  return app
}
