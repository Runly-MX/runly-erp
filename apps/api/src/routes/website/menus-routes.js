import { websiteAccessFromRequest, websiteErrorHandler } from '../../services/website-authorization-service.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  createMenuSchema, updateMenuSchema,
  createMenuItemSchema, updateMenuItemSchema, reorderItemsSchema,
} from './validators.js'
import { WebsiteServiceError } from './service-helpers.js'

export function createMenusRouter({ websiteSvc, requirePermission }) {
  const app = new Hono()
  app.onError(websiteErrorHandler)

  app.get('/menus', requirePermission('website.menus.read'), async (c) => {
    const companyId = c.get('companyId')
    const siteId    = c.req.query('siteId')
    if (!siteId) return c.json({ data: [] })
    const menus = await websiteSvc.listMenus({ access: websiteAccessFromRequest(c), companyId, siteId })
    return c.json({ data: menus })
  })

  app.post(
    '/menus',
    requirePermission('website.menus.update'),
    zValidator('json', createMenuSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const data      = c.req.valid('json')
      try {
        const menu = await websiteSvc.createMenu({ access: websiteAccessFromRequest(c), companyId, siteId: data.siteId, data })
        return c.json(menu, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.patch(
    '/menus/:id',
    requirePermission('website.menus.update'),
    zValidator('json', updateMenuSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const data      = c.req.valid('json')
      try {
        const menu = await websiteSvc.updateMenu({ access: websiteAccessFromRequest(c), companyId, menuId: c.req.param('id'), data })
        return c.json(menu)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.delete('/menus/:id', requirePermission('website.menus.update'), async (c) => {
    const companyId = c.get('companyId')
    try {
      await websiteSvc.softDeleteMenu({ access: websiteAccessFromRequest(c), companyId, menuId: c.req.param('id') })
      return c.json({ success: true })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  app.post(
    '/menus/:menuId/items',
    requirePermission('website.menus.update'),
    zValidator('json', createMenuItemSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const data      = c.req.valid('json')
      try {
        const item = await websiteSvc.createMenuItem({ access: websiteAccessFromRequest(c), companyId,
          menuId: c.req.param('menuId'),
          data,
        })
        return c.json(item, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.post(
    '/menus/:menuId/items/reorder',
    requirePermission('website.menus.update'),
    zValidator('json', reorderItemsSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const { items } = c.req.valid('json')
      await websiteSvc.reorderMenuItems({ access: websiteAccessFromRequest(c), companyId, menuId: c.req.param('menuId'), items })
      return c.json({ success: true })
    },
  )

  app.patch(
    '/menu-items/:id',
    requirePermission('website.menus.update'),
    zValidator('json', updateMenuItemSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const data      = c.req.valid('json')
      try {
        const item = await websiteSvc.updateMenuItem({ access: websiteAccessFromRequest(c), companyId, itemId: c.req.param('id'), data })
        return c.json(item)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.delete('/menu-items/:id', requirePermission('website.menus.update'), async (c) => {
    const companyId = c.get('companyId')
    try {
      await websiteSvc.softDeleteMenuItem({ access: websiteAccessFromRequest(c), companyId, itemId: c.req.param('id') })
      return c.json({ success: true })
    } catch (err) {
      if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
      throw err
    }
  })

  return app
}
