import { websiteAccessFromRequest, websiteErrorHandler } from '../../services/website-authorization-service.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createThemeSchema, updateThemeSchema } from './validators.js'
import { WebsiteServiceError } from './service-helpers.js'

export function createThemesRouter({ websiteSvc, requirePermission }) {
  const app = new Hono()
  app.onError(websiteErrorHandler)

  // GET /theme — returns active theme for site (used by web builder wizard/editor)
  app.get('/theme', requirePermission('website.theme.read'), async (c) => {
    const companyId = c.get('companyId')
    try {
      const theme = await websiteSvc.getActiveTheme({ access: websiteAccessFromRequest(c), companyId })
      return c.json({ data: theme ?? null })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      console.error('[GET /website/theme]', err?.message)
      return c.json({ error: 'Internal error' }, 500)
    }
  })

  // POST /theme — create/upsert theme (used by web builder wizard)
  app.post('/theme', requirePermission('website.theme.update'), async (c) => {
    const companyId = c.get('companyId')
    try {
      const { site_id, siteId, tokens, typography } = await c.req.json()
      const resolvedSiteId = site_id ?? siteId
      const theme = await websiteSvc.upsertTheme({ access: websiteAccessFromRequest(c), companyId, siteId: resolvedSiteId, tokens, typography })
      return c.json({ data: theme }, 201)
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      console.error('[POST /website/theme]', err?.message)
      return c.json({ error: 'Internal error' }, 500)
    }
  })

  app.get('/themes', requirePermission('website.theme.read'), async (c) => {
    const companyId = c.get('companyId')
    const siteId    = c.req.query('siteId')
    if (!siteId) return c.json({ data: [] })
    const themes = await websiteSvc.listThemes({ access: websiteAccessFromRequest(c), companyId, siteId })
    return c.json({ data: themes })
  })

  app.get('/themes/:id', requirePermission('website.theme.read'), async (c) => {
    const companyId = c.get('companyId')
    try {
      const theme = await websiteSvc.getTheme({ access: websiteAccessFromRequest(c), companyId, themeId: c.req.param('id') })
      if (!theme) return c.json({ error: 'Tema no encontrado' }, 404)
      return c.json(theme)
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  app.post(
    '/themes',
    requirePermission('website.theme.update'),
    zValidator('json', createThemeSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const data      = c.req.valid('json')
      try {
        const theme = await websiteSvc.createTheme({ access: websiteAccessFromRequest(c), companyId, siteId: data.siteId, data })
        return c.json(theme, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.patch(
    '/themes/:id',
    requirePermission('website.theme.update'),
    zValidator('json', updateThemeSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const data      = c.req.valid('json')
      try {
        const theme = await websiteSvc.updateTheme({ access: websiteAccessFromRequest(c), companyId, themeId: c.req.param('id'), data })
        return c.json(theme)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  return app
}
