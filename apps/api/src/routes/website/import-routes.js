import {Hono} from 'hono'
import {websiteAccessFromRequest,websiteErrorHandler} from '../../services/website-authorization-service.js'
import {STATIC_ZIP_POLICY} from '../../services/website-zip-policy.js'
import {releaseBytesHash} from '../../services/website-release-storage.js'
import {WebsiteServiceError} from './service-helpers.js'
export async function readWebsiteZipRequest(c) {
  // Count raw multipart bytes rather than trusting Content-Length or File.size.
  const reader=c.req.raw.body?.getReader(),chunks=[];let size=0
  if(!reader)throw new WebsiteServiceError('Archivo requerido.',400,'invalid_archive_request')
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>STATIC_ZIP_POLICY.compressed+1024*1024){await reader.cancel();return null}chunks.push(value)}}finally{reader.releaseLock()}
  const raw=new Request(c.req.url,{method:'POST',headers:c.req.raw.headers,body:Buffer.concat(chunks)})
  const form=await raw.formData().catch(()=>{throw new WebsiteServiceError('Archivo inválido.',400,'invalid_archive_request')}),file=form.get('file')
  if(!file||typeof file.arrayBuffer!=='function'||file.size>STATIC_ZIP_POLICY.compressed)return null
  return {bytes:Buffer.from(await file.arrayBuffer()),routingMode:form.get('routingMode')??'mpa',rootDirectory:form.get('rootDirectory')??undefined}
}
export function createWebsiteImportRoutes({imports,storage,requirePermission}) {
  const app=new Hono();app.onError(websiteErrorHandler)
  const args=c=>({companyId:c.get('companyId'),siteId:c.req.param('siteId'),access:websiteAccessFromRequest(c),importId:c.req.param('importId'),idempotencyKey:c.req.header('Idempotency-Key')})
  app.post('/sites/:siteId/imports',requirePermission('website.dist.upload'),async c=>{
    const input=await readWebsiteZipRequest(c);if(!input)return c.json({error:'Archivo inválido o excesivo.',code:'archive_too_large'},413)
    return c.json({data:await imports.create({...input,...args(c)})},202)
  })
  app.get('/sites/:siteId/imports/:importId',requirePermission('website.dist.upload'),async c=>c.json({data:await imports.get(args(c))}))
  app.get('/sites/:siteId/imports/:importId/archive',requirePermission('website.dist.upload'),async c=>{
    const row=await imports.get(args(c)),bytes=await storage.get(row.archiveKey)
    if(releaseBytesHash(bytes)!==row.archiveHash)throw new WebsiteServiceError('Archivo no disponible.',503,'integrity_failed')
    c.header('Cache-Control','no-store');c.header('Content-Disposition','attachment; filename="site.zip"');c.header('Content-Type','application/zip');return c.body(bytes)
  })
  return app
}
