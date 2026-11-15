import { Hono } from 'hono'
import { z } from 'zod'
import { websiteAccessFromRequest, websiteErrorHandler } from '../../services/website-authorization-service.js'

// Customer-owned hostnames of a site (see services/website-custom-domain-service.js).
const addBody = z.object({ hostname: z.string().trim().min(3).max(253) }).strict()

export function createWebsiteCustomDomainRoutes({ customDomains, requirePermission }) {
  const app = new Hono()
  app.onError(websiteErrorHandler)
  const base = '/sites/:siteId/custom-domains'
  const args = (c) => ({ companyId: c.get('companyId'), siteId: c.req.param('siteId'), access: websiteAccessFromRequest(c) })
  const withHost = (c) => ({ ...args(c), hostname: c.req.param('hostname') })

  app.get(base, requirePermission('website.site.read'), async (c) => c.json({ data: await customDomains.list(args(c)) }))
  app.post(base, requirePermission('website.domains.manage'), async (c) => {
    const parsed = addBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Datos inválidos.', code: 'validation_failed' }, 400)
    return c.json({ data: await customDomains.add({ ...args(c), ...parsed.data }) }, 201)
  })
  app.get(`${base}/:hostname`, requirePermission('website.site.read'), async (c) => c.json({ data: await customDomains.status(withHost(c)) }))
  app.post(`${base}/:hostname/verify`, requirePermission('website.domains.manage'), async (c) => c.json({ data: await customDomains.verify(withHost(c)) }))
  app.post(`${base}/:hostname/check-https`, requirePermission('website.domains.manage'), async (c) => c.json({ data: await customDomains.checkHttps(withHost(c)) }))
  app.post(`${base}/:hostname/release`, requirePermission('website.domains.manage'), async (c) => c.json({ data: await customDomains.release(withHost(c)) }))
  return app
}
