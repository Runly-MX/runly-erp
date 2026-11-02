import {Hono} from 'hono'
import {websiteAccessFromRequest,websiteErrorHandler} from '../../services/website-authorization-service.js'
export function createWebsiteReleaseRoutes({releases,gateway,contracts,requirePermission}) {
 const app=new Hono();app.onError(websiteErrorHandler)
 const args=c=>({companyId:c.get('companyId'),siteId:c.req.param('siteId'),access:websiteAccessFromRequest(c),idempotencyKey:c.req.header('Idempotency-Key')})
 app.get('/sites/:siteId/state',requirePermission('website.site.read'),async c=>c.json({data:await contracts.state(args(c))}))
 app.get('/sites/:siteId/publication/integrity',requirePermission('website.site.read'),async c=>c.json({data:await contracts.integrity(args(c))}))
 const body=async c=>{try{return await c.req.json()}catch{return null}}
 app.get('/sites/:siteId/releases',requirePermission('website.pages.read'),async c=>c.json(await releases.list({...args(c),cursor:c.req.query('cursor'),limit:c.req.query('limit')})))
 app.get('/sites/:siteId/domains',requirePermission('website.site.read'),async c=>c.json({data:await gateway.domains(args(c))}))
 app.get('/sites/:siteId/releases/:releaseId',requirePermission('website.pages.read'),async c=>c.json({data:await releases.get({...args(c),releaseId:c.req.param('releaseId')})}))
 const command=(service,status=200)=>async c=>{const input=await body(c);if(!input||typeof input!=='object'||Array.isArray(input))return c.json({error:'Datos inválidos.',code:'validation_failed'},400);return c.json({data:await service({...input,...args(c)})},status)}
 app.post('/sites/:siteId/releases/preflight',requirePermission('website.pages.publish'),command(releases.preflight))
 app.post('/sites/:siteId/releases',requirePermission('website.pages.publish'),command(releases.prepare,202))
 for(const op of ['activate','rollback','unpublish'])app.post(`/sites/:siteId/publication/${op}`,requirePermission('website.pages.publish'),command(releases[op]))
 app.post('/sites/:siteId/domains',requirePermission('website.domains.manage'),command(gateway.reserve,201))
 return app
}
