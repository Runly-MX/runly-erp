import {Hono} from 'hono'
import {ZodError} from 'zod'
import {createHash} from 'node:crypto'
import {validateImage} from '@runly/studio-interchange/inspect'
import {createWebsiteMarketplaceService} from '../../services/marketplace/website-import-service.js'
import {websiteAccessFromRequest,websiteErrorHandler,assertWebsiteAccess} from '../../services/website-authorization-service.js'
import {MarketplaceImportError} from '../../services/marketplace/marketplace-import-gate.js'
import {notFound} from './service-helpers.js'

export function createWebsiteMarketplaceRoutes({prisma,marketplace,filesService,supabaseAdmin,requirePermission}) {
 const app=new Hono(),service=createWebsiteMarketplaceService({prisma,gate:marketplace,filesService,supabaseAdmin})
 app.onError((error,c)=>error instanceof ZodError?c.json({error:'Solicitud inválida.',code:'validation_failed'},422):error instanceof MarketplaceImportError?c.json({error:error.message,code:error.code,details:error.details},error.status):websiteErrorHandler(error,c))
 const args=c=>({companyId:c.get('companyId'),siteId:c.req.param('siteId'),access:websiteAccessFromRequest(c),idempotencyKey:c.req.header('Idempotency-Key')})
 app.get('/marketplace/resources',requirePermission('website.site.read'),async c=>c.json({data:await marketplace.list('website_template',{query:c.req.query('q')??'',acknowledgeStale:c.req.query('acknowledgeStale')==='true'})}))
 app.post('/sites/:siteId/marketplace/inspect',requirePermission('website.pages.create'),async c=>c.json({data:await service.inspect(args(c),await c.req.json())}))
 app.post('/sites/:siteId/marketplace/install',requirePermission('website.pages.create'),async c=>c.json({data:await service.confirm(args(c),await c.req.json())},201))
 async function assets(c){const a=args(c);assertWebsiteAccess(a.access,a.companyId,'website.pages.read');if(!await prisma.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}}))throw notFound('Recurso');return {a,rows:await prisma.fileAsset.findMany({where:{entityId:a.siteId,moduleKey:'runly.website',enabled:true,visibility:'PRIVATE',mimeType:{in:['image/png','image/jpeg','image/webp']},sizeBytes:{lte:8*1024*1024},checksum:{startsWith:'sha256:'},metadata:{path:['companyId'],equals:a.companyId}},orderBy:{createdAt:'asc'}})}}
 app.get('/sites/:siteId/template-assets',requirePermission('website.pages.read'),async c=>{const {a,rows}=await assets(c),visible=[];for(const file of rows){try{await service.files.assertAccess(file,{profileId:a.access.actorId,admin:a.access.isAdmin});visible.push({id:file.id,name:file.originalName,mime:file.mimeType,sha256:file.checksum?.replace(/^sha256:/,'')})}catch{}}return c.json({data:visible})})
 app.get('/sites/:siteId/template-assets/:fileId',requirePermission('website.pages.read'),async c=>{
  const {a,rows}=await assets(c),file=rows.find(f=>f.id===c.req.param('fileId'))
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.mimeType)||file.sizeBytes>8*1024*1024)throw notFound('Recurso')
  await service.files.assertAccess(file,{profileId:a.access.actorId,admin:a.access.isAdmin})
  const bytes=await service.readFile(file)
  if(bytes.length!==file.sizeBytes||`sha256:${createHash('sha256').update(bytes).digest('hex')}`!==file.checksum)throw notFound('Recurso')
  await validateImage(bytes,file.mimeType)
  c.header('Content-Type',file.mimeType);c.header('X-Content-Type-Options','nosniff');return c.body(bytes)
 })
 service.startCleanup()
 return app
}
