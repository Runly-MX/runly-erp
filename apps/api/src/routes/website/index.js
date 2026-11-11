import { createWebsitePublicationContext } from '../../services/website-publication-context.js'
import {createWebsiteMarketplaceRoutes} from './marketplace-routes.js'
import {createWebsiteDependencyRoutes} from './dependency-routes.js'
import { createWebsiteReleaseRoutes } from './releases-routes.js'
import { createWebsiteImportRoutes } from './import-routes.js'
import { createWebsitePreviewRoutes } from './preview-routes.js'
import { websiteAccessFromRequest, websiteErrorHandler,requireWebsitePermission } from '../../services/website-authorization-service.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createWebsiteService } from './website-service.js'
import { createFormsService } from '../../services/forms-service.js'
import { createPagesRouter } from './pages-routes.js'
import { createThemesRouter } from './themes-routes.js'
import { createMenusRouter } from './menus-routes.js'
import { createBlogRouter } from './blog-routes.js'
import { createFormsRouter } from './forms-routes.js'
import { createWebsiteSettingsRouter } from './website-settings-routes.js'
import { createWebsiteAccountsAdminRouter, createWebsiteIdentity, WEBSITE_REALM } from './accounts-routes.js'
import { createExternalFiles, supabaseExternalStorage } from '../../services/external-identity/index.js'
import { createDistRoutes } from './dist-routes.js'
import { createSiteSchema, updateSiteSchema } from './validators.js'
import { WebsiteServiceError } from './service-helpers.js'

export function createWebsiteRouter({ prisma, requirePermission, supabaseAdmin, publicationContext, marketplace, filesService }) {
  const app = new Hono()
  app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');return next()})
  app.onError(websiteErrorHandler)
  if(marketplace&&filesService)app.route('/website',createWebsiteMarketplaceRoutes({prisma,requirePermission,supabaseAdmin,marketplace,filesService}))
  app.route('/website',createWebsiteDependencyRoutes({prisma,requirePermission,supabaseAdmin}))
  const publication = publicationContext ?? createWebsitePublicationContext({ prisma, supabaseAdmin })
  const accountFiles = supabaseAdmin ? createExternalFiles({ prisma, storage: supabaseExternalStorage(supabaseAdmin) }) : null
  const websiteSvc = createWebsiteService({ prisma, publicationContext: publication,
    purgeSiteAccounts: accountFiles ? (siteId) => accountFiles.purgeRealm({ moduleKey: WEBSITE_REALM, ownerId: siteId }) : null })
  app.route('/website',createWebsiteReleaseRoutes({...publication,requirePermission}))
  app.route('/website',createWebsiteImportRoutes({...publication,requirePermission}))
  app.route('/website',createWebsitePreviewRoutes({...publication,requirePermission}))
  const formsService = createFormsService({ prisma })
  app.get('/website/sites/:siteId/forms',requirePermission('website.site.read'),async c=>{
    const args={access:websiteAccessFromRequest(c),companyId:c.get('companyId'),siteId:c.req.param('siteId')};
    const forms=await formsService.listForms(args);
    return c.json({data:await Promise.all(forms.map(async f=>({...f,publishability:await publication.contracts.form({...args,formId:f.id})})))});
  })
  app.post('/website/sites/:siteId/forms/:formId/scope',requireWebsitePermission(requirePermission,'website.forms.update'),async c=>{
    const body=await c.req.json().catch(()=>null);
    if(!body||Object.keys(body).some(k=>!['expectedLegacySiteId','resolveAmbiguous'].includes(k))||typeof body.resolveAmbiguous!=='boolean'&&body.resolveAmbiguous!==undefined)return c.json({code:'validation_failed',error:'Datos inválidos.'},422);
    return c.json({data:await formsService.resolveFormScope({...body,access:websiteAccessFromRequest(c),companyId:c.get('companyId'),siteId:c.req.param('siteId'),formId:c.req.param('formId')})});
  })

  app.route('/website', createPagesRouter({ websiteSvc, requirePermission }))
  app.route('/website', createThemesRouter({ websiteSvc, requirePermission }))
  app.route('/website', createMenusRouter({ websiteSvc, requirePermission }))
  app.route('/website', createBlogRouter({ websiteSvc, requirePermission }))
  app.route('/website', createFormsRouter({ formsService, requirePermission }))
  app.route('/', createWebsiteSettingsRouter({ prisma, requirePermission, supabaseAdmin }))
  app.route('/website', createWebsiteAccountsAdminRouter({ prisma, requirePermission, files: accountFiles, identity: createWebsiteIdentity({ prisma, supabaseAdmin }) }))
  app.route('/', createDistRoutes({ prisma, supabaseAdmin, requirePermission, websiteSvc, publicationContext:publication }))

  app.get('/website/sites', requirePermission('website.site.read'), async c => {
    c.header('Cache-Control', 'no-store')
    return c.json({ data: await websiteSvc.listSites({ access: websiteAccessFromRequest(c), companyId: c.get('companyId') }) })
  })
  app.post('/website/sites', requirePermission('website.site.update'), zValidator('json', createSiteSchema), async c => {
    const idempotencyKey = c.req.header('Idempotency-Key')
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) return c.json({ error: 'Idempotency-Key requerida.', code: 'validation_failed' }, 422)
    const data = await websiteSvc.createSite({ access: websiteAccessFromRequest(c), companyId: c.get('companyId'), data: c.req.valid('json'), idempotencyKey })
    return c.json({ data }, 201)
  })

  app.get('/website/site', requirePermission('website.site.read'), async (c) => {
    const companyId = c.get('companyId')
    const site = await websiteSvc.getSite({ access: websiteAccessFromRequest(c), companyId })
    return c.json({ data: site })
  })

  app.post(
    '/website/site',
    requirePermission('website.site.update'),
    zValidator('json', createSiteSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      const data      = c.req.valid('json')
      try {
        const site = await websiteSvc.createSite({ access: websiteAccessFromRequest(c), companyId, data, actorId, idempotencyKey: c.req.header('Idempotency-Key') })
        return c.json(site, 201)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.patch(
    '/website/site/:id',
    requirePermission('website.site.update'),
    zValidator('json', updateSiteSchema),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      const siteId    = c.req.param('id')
      const data      = c.req.valid('json')
      try {
        const site = await websiteSvc.updateSite({ access: websiteAccessFromRequest(c), companyId, siteId, data, actorId })
        return c.json(site)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  app.delete(
    '/website/site/:id',
    requirePermission('website.site.update'),
    async (c) => {
      const companyId = c.get('companyId')
      const actorId   = c.get('userId') ?? c.get('user')?.id ?? null
      const siteId    = c.req.param('id')
      try {
        await websiteSvc.deleteSite({ access: websiteAccessFromRequest(c), companyId, siteId, actorId })
        return c.body(null, 204)
      } catch (err) {
        if (err instanceof WebsiteServiceError) return c.json({ error: err.message }, err.status)
        throw err
      }
    },
  )

  // Lifecycle of a whole site: archive (reversible), restore (back as an unpublished draft) and delete (tombstone, archived sites only).
  const lifecycle = (method, status = 204) => async (c) => {
    const body = method === 'purgeSite' ? await c.req.json().catch(() => ({})) : {}
    await websiteSvc[method]({ access: websiteAccessFromRequest(c), companyId: c.get('companyId'), siteId: c.req.param('siteId'), actorId: c.get('userId') ?? null, confirmName: body.confirmName })
    return c.body(null, status)
  }
  app.post('/website/sites/:siteId/archive', requirePermission('website.site.update'), lifecycle('deleteSite'))
  app.post('/website/sites/:siteId/restore', requirePermission('website.site.update'), lifecycle('restoreSite'))
  app.delete('/website/sites/:siteId', requirePermission('website.site.update'), lifecycle('purgeSite'))

  return app
}
