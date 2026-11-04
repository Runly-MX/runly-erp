import {Hono} from 'hono'
import {z} from 'zod'
import {zValidator} from '@hono/zod-validator'
import {websiteAccessFromRequest,websiteErrorHandler} from '../../services/website-authorization-service.js'
import {createWebsiteCatalogService} from '../../services/website-catalog-service.js'
import {createWebsiteTemplateService} from '../../services/website-template-service.js'
import {notFound} from './service-helpers.js'

export function createWebsiteDependencyRoutes({prisma,requirePermission,supabaseAdmin}) {
 const app=new Hono(),catalog=createWebsiteCatalogService({prisma,supabaseAdmin}),templates=createWebsiteTemplateService({prisma})
 app.onError(websiteErrorHandler)
 const args=c=>{
   for(const key of ['siteId','productId']){const id=c.req.param(key);if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw notFound('Recurso')}
   return {companyId:c.get('companyId'),siteId:c.req.param('siteId'),access:websiteAccessFromRequest(c),idempotencyKey:c.req.header('Idempotency-Key')}
 }
 app.get('/sites/:siteId/catalog/products',requirePermission('website.site.read'),async c=>c.json(await catalog.list({...args(c),...Object.fromEntries(['limit','offset','published','categoryId','search'].map(key=>[key,c.req.query(key)]).filter(([,value])=>value!==undefined))})))
 app.put('/sites/:siteId/catalog/products/:productId',requirePermission('website.site.update'),zValidator('json',z.object({included:z.boolean(),expectedRevision:z.number().int().nonnegative()}).strict()),async c=>c.json({data:await catalog.select({...args(c),productId:c.req.param('productId'),...c.req.valid('json')})}))
 app.put('/sites/:siteId/catalog/selection',requirePermission('website.site.update'),zValidator('json',z.object({productIds:z.array(z.string().uuid()).max(1000),expectedRevision:z.number().int().nonnegative()}).strict()),async c=>c.json({data:await catalog.replaceSelection({...args(c),...c.req.valid('json')})}))
 app.get('/sites/:siteId/catalog/products/:productId/used-by',requirePermission('website.site.read'),async c=>c.json(await catalog.usedBy({...args(c),productId:c.req.param('productId'),cursor:c.req.query('cursor'),limit:c.req.query('limit')})))
 app.post('/sites/:siteId/templates/:templateId/apply',requirePermission('website.pages.create'),zValidator('json',z.object({expectedRevision:z.number().int().nonnegative(),pageIds:z.array(z.string().min(1)).min(1).max(100),includeTheme:z.boolean().default(false),branding:z.object({name:z.string().trim().min(1).max(120).optional(),logoFileId:z.string().uuid().optional(),logoHeight:z.number().int().min(16).max(160).optional()}).strict().optional()}).strict()),async c=>c.json({data:await templates.apply({...args(c),templateId:c.req.param('templateId'),...c.req.valid('json')})}))
 return app
}
