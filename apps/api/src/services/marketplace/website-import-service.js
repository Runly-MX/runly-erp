import {createHash} from 'node:crypto'
import {z} from 'zod'
import {inspectWebsiteTemplate} from '@runly/studio-interchange/website-template'
import {sectionsToAtlasPage,websiteThemeToAtlasTokens} from '@runly/studio-interchange/website-document'
import {resourceRefSchema} from './marketplace-import-gate.js'
import {assertWebsiteAccess} from '../website-authorization-service.js'
import {WebsiteServiceError,notFound} from '../../routes/website/service-helpers.js'
import {BLOCK_CATALOG} from '../../routes/website/page-document.js'
import {createWebsiteDraftService,websiteDocumentHash} from '../website-draft-service.js'
import {createWebsiteTemplateService} from '../website-template-service.js'
import {createWebsiteTemplatePreparationService} from '../website-template-preparation-service.js'
import {createFileAccess} from '../files/access.js'
import {websiteReleasePath} from '../website-release-service.js'

const catalogs={'0.3.5':BLOCK_CATALOG}, sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const request=z.strictObject({ref:resourceRefSchema,pageIds:z.array(z.string().max(512)).min(1).max(24),expectedRevision:z.number().int().nonnegative(),includeTheme:z.boolean(),replaceExisting:z.boolean().default(false),formMode:z.enum(['disabled','local']).default('disabled'),acceptWarnings:z.literal(true)})
const messages={import_cancelled:'La instalación se canceló. Revisa de nuevo la plantilla para iniciar otro intento.',import_in_progress:'La instalación sigue en curso o en recuperación. Reintenta con la misma selección más tarde.',idempotency_conflict:'Este intento ya corresponde a otra selección. Revisa de nuevo la plantilla.',cleanup_pending:'La limpieza sigue pendiente. Los borradores no se aplicaron; se reintentará automáticamente.',legacy_public_requires_release:'Sella primero una release del sitio público actual antes de instalar nuevos borradores.'}
const fail=(code,status=409)=>new WebsiteServiceError(messages[code]??'No se pudo instalar la plantilla. Revisa los conflictos y requisitos.',status,code)

export function createWebsiteMarketplaceService({prisma,gate,filesService,supabaseAdmin,readFile:providedRead,afterStage=async()=>{}}) {
 const drafts=createWebsiteDraftService({prisma}),templates=createWebsiteTemplateService({prisma}),files=createFileAccess({prisma}),archives=new WeakMap()
 const readFile=providedRead??(async file=>{const {data,error}=await supabaseAdmin.storage.from(file.bucket).download(file.objectKey);if(error||!data)throw fail('asset_unavailable',503);return Buffer.from(await data.arrayBuffer())})
 async function authorize(a,db=prisma) {
  for(const p of ['website.site.read','website.pages.create'])assertWebsiteAccess(a.access,a.companyId,p)
  const site=await db.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}})
  if(!site)throw notFound('Recurso');return site
 }
 async function inspect(a,ref) {
  const site=await authorize(a),download=await gate.download(ref,'website_template',{companyId:a.companyId,actorId:a.access.actorId})
  const inspected=await inspectWebsiteTemplate(download.bytes,{builderCatalogs:catalogs})
  if(!inspected.ok)throw Object.assign(fail('website_template_invalid',422),{details:{errors:inspected.errors}})
  archives.set(inspected,download.bytes)
  if(inspected.content.assets.some(asset=>asset.bytes>8*1024*1024))throw fail('asset_too_large',422)
  const existing=await prisma.websitePage.findMany({where:{companyId:a.companyId,siteId:a.siteId},select:{routePath:true,draftMetadata:true,enabled:true,status:true}})
  const {content,...validation}=inspected
  return {source:download.source,validation,expectedRevision:site.draftRevision,catalog:BLOCK_CATALOG,
   pages:content.pages.map(p=>({...p,document:sectionsToAtlasPage(p),sections:undefined,conflict:existing.some(row=>row.routePath===p.path||row.draftMetadata?.routePath===p.path)})),
   themeTokens:websiteThemeToAtlasTokens(content.theme??{}),assets:content.assets.map(({data,...asset})=>({...asset,base64:Buffer.from(data).toString('base64')})),licenses:content.licenses,
   requirements:{forms:inspected.manifest.forms,legacyPublicBaseline:!site.activeReleaseId&&existing.some(p=>p.enabled&&p.status==='published'),formsLocal:a.access.can('website.forms.create'),home:a.access.can('website.site.update'),theme:a.access.can('website.site.update')&&a.access.can('website.theme.update'),files:a.access.can('files.assets.create')},
   _inspected:inspected}
 }
 async function job(a,db=prisma,lock=false) {
  const rows=lock?await db.$queryRaw`SELECT * FROM website_template_job WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid AND actor_id=${a.access.actorId}::uuid AND key_hash=${websiteDocumentHash(a.idempotencyKey)} FOR UPDATE`
   :await db.$queryRaw`SELECT * FROM website_template_job WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid AND actor_id=${a.access.actorId}::uuid AND key_hash=${websiteDocumentHash(a.idempotencyKey)}`
  return rows[0]
 }
 async function compensate(id,expiredOnly=false) {
  const [row]=await prisma.$queryRaw`UPDATE website_template_job SET state='cleanup',lease_until=now()+interval '2 minutes' WHERE id=${id}::uuid AND state<>'committed' AND (NOT ${expiredOnly} OR (next_cleanup_at<=now() AND lease_until<=now())) RETURNING *`
  if(!row)return
  for(const location of row.staged){const {error}=await supabaseAdmin.storage.from(location.bucket).remove([location.objectKey]);if(error){await prisma.$queryRaw`UPDATE website_template_job SET lease_until=now(),next_cleanup_at=now()+interval '1 minute' WHERE id=${id}::uuid`;throw fail('cleanup_pending',503)}}
  // Recheck tombstones for a day to cover an upload that completes after its lease expires.
  await prisma.$queryRaw`UPDATE website_template_job SET state='cancelled',lease_until=now(),next_cleanup_at=CASE WHEN created_at>now()-interval '1 day' THEN now()+interval '5 minutes' ELSE NULL END WHERE id=${id}::uuid AND state='cleanup'`
 }
 let sweeping=false,timer
 async function recoverExpired() {
  if(sweeping)return;sweeping=true
  try{const rows=await prisma.$queryRaw`SELECT id FROM website_template_job WHERE state<>'committed' AND next_cleanup_at<=now() AND lease_until<=now() ORDER BY next_cleanup_at LIMIT 32`;for(const row of rows)await compensate(row.id,true).catch(()=>{})}finally{sweeping=false}
 }
 function startCleanup(){if(!timer){timer=setInterval(()=>{void recoverExpired().catch(()=>{})},60000);timer.unref?.()}}
 async function confirm(a,input) {
  await authorize(a)
  const body=request.parse(input),requestHash=websiteDocumentHash(body)
  if(typeof a.idempotencyKey!=='string'||a.idempotencyKey.length<16||a.idempotencyKey.length>200)throw fail('idempotency_required',422)
  const previous=await job(a)
  if(previous){if(previous.request_hash!==requestHash)throw fail('idempotency_conflict');if(previous.state==='committed')return previous.result;throw fail(previous.state==='cancelled'?'import_cancelled':'import_in_progress')}
  const preview=await inspect(a,body.ref),data=preview._inspected
  if(preview.requirements.legacyPublicBaseline)throw fail('legacy_public_requires_release')
  if(new Set(body.pageIds).size!==body.pageIds.length||body.pageIds.some(path=>!preview.pages.some(p=>p.path===path)))throw fail('page_selection_invalid',422)
  for(const path of body.pageIds)websiteReleasePath(path)
  if(body.pageIds.includes('/'))assertWebsiteAccess(a.access,a.companyId,'website.site.update')
  if(data.content.assets.length)assertWebsiteAccess(a.access,a.companyId,'files.assets.create')
  if(body.includeTheme)for(const p of ['website.site.update','website.theme.update'])assertWebsiteAccess(a.access,a.companyId,p)
  if(body.replaceExisting)for(const p of ['website.pages.delete','website.pages.update'])assertWebsiteAccess(a.access,a.companyId,p)
  if(body.formMode==='local')assertWebsiteAccess(a.access,a.companyId,'website.forms.create')
  await gate.recheck(preview.source)
  const row=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${a.companyId}::text,31))::text`
   await drafts.lockSite(tx,a.companyId,a.siteId);const site=await authorize(a,tx);drafts.expected(site.draftRevision,body.expectedRevision)
   if(await job(a,tx))throw fail('import_in_progress')
   const [quota]=await tx.$queryRaw`SELECT count(*) FILTER(WHERE state IN ('preparing','cleanup'))::int AS count,count(*) FILTER(WHERE actor_id=${a.access.actorId}::uuid AND created_at>now()-interval '1 hour')::int AS rate FROM website_template_job WHERE company_id=${a.companyId}::uuid`
   if(quota.count>=4||quota.rate>=20)throw fail('import_quota',429)
   const [result]=await tx.$queryRaw`INSERT INTO website_template_job(company_id,site_id,actor_id,key_hash,request_hash,source) VALUES(${a.companyId}::uuid,${a.siteId}::uuid,${a.access.actorId}::uuid,${websiteDocumentHash(a.idempotencyKey)},${requestHash},${JSON.stringify(preview.source)}::jsonb) RETURNING *`
   return result
  })
  const staged=[],bindings={},reused=[]
  const heartbeat=setInterval(()=>{void prisma.$queryRaw`UPDATE website_template_job SET lease_until=now()+interval '2 minutes',next_cleanup_at=now()+interval '2 minutes' WHERE id=${row.id}::uuid AND state='preparing'`.catch(()=>{})},30000);heartbeat.unref?.()
  try{
   for(const asset of data.content.assets){
    const existing=await prisma.fileAsset.findFirst({where:{entityId:a.siteId,moduleKey:'runly.website',enabled:true,visibility:'PRIVATE',checksum:`sha256:${asset.sha256}`,metadata:{path:['companyId'],equals:a.companyId},...(a.access.isAdmin?{}:{uploadedById:a.access.actorId})}})
    if(existing){await files.assertAccess(existing,{profileId:a.access.actorId,admin:a.access.isAdmin});const bytes=await readFile(existing);if(bytes.length===asset.bytes&&sha(bytes)===asset.sha256&&existing.mimeType===asset.mime){bindings[asset.sha256]=existing.id;reused.push(existing);continue}}
    const result=await filesService.upload({activeContext:{companyId:a.companyId,profileId:a.access.actorId,isAdmin:a.access.isAdmin},file:new File([asset.data],asset.path.split('/').at(-1),{type:asset.mime}),fields:{moduleKey:'runly.website',entityType:'WebsiteSite',entityId:a.siteId,visibility:'PRIVATE',metadata:{websiteTemplate:{sha256:asset.sha256,source:preview.source,license:data.content.licenses.find(l=>l.id===asset.license)}}},staging:{beforeStorage:async location=>{
     staged.push({...location,sha256:asset.sha256});const changed=await prisma.$queryRaw`UPDATE website_template_job SET staged=${JSON.stringify(staged)}::jsonb,lease_until=now()+interval '2 minutes' WHERE id=${row.id}::uuid AND state='preparing' RETURNING id`;if(!changed.length)throw fail('import_cancelled')
    }}})
    staged.at(-1).asset={...result.staged,entityId:a.siteId,checksum:`sha256:${asset.sha256}`}
   }
   await afterStage(row)
   await gate.recheck(preview.source)
   return await prisma.$transaction(async tx=>{
    await drafts.lockSite(tx,a.companyId,a.siteId);const locked=await job(a,tx,true)
    if(locked?.state!=='preparing'||locked.request_hash!==requestHash)throw fail('import_cancelled')
    const site=await authorize(a,tx);drafts.expected(site.draftRevision,body.expectedRevision)
    for(const file of reused){await tx.$queryRaw`SELECT id FROM file_asset WHERE id=${file.id}::uuid FOR UPDATE`;const latest=await tx.fileAsset.findUnique({where:{id:file.id}});if(!latest?.enabled||latest.contentRevision!==file.contentRevision||latest.objectKey!==file.objectKey||latest.checksum!==file.checksum)throw fail('asset_changed')}
    for(const item of staged){const file=await tx.fileAsset.create({data:item.asset});bindings[item.sha256]=file.id}
    const preparation=createWebsiteTemplatePreparationService({prisma:tx,files,readFile,builderCatalogs:catalogs})
    const prepared=await preparation.prepare({...a,bytes:archives.get(data),bindings})
    const pages=prepared.pages.filter(p=>body.pageIds.includes(p.path)).map(p=>({id:p.path,label:p.title,routePath:p.path,document:p.document}))
    const applied=await templates.applyBundle({...a,...body},{source:preview.source,title:data.manifest.title,pages,themeTokens:prepared.themeTokens},tx)
    const result={...applied,assets:bindings,source:preview.source,jobId:row.id,formsMode:body.formMode,warnings:data.warnings}
    await tx.$queryRaw`UPDATE website_template_job SET state='committed',result=${JSON.stringify(result)}::jsonb,next_cleanup_at=NULL WHERE id=${row.id}::uuid`
    await tx.auditLog.create({data:{actorId:a.access.actorId,companyId:a.companyId,moduleKey:'runly.website',entityType:'website.site',entityId:a.siteId,action:'template.marketplace.imported',metadata:{source:preview.source,jobId:row.id,pageIds:applied.pages.map(p=>p.id),assetIds:Object.values(bindings),formMode:body.formMode}}})
    return result
   },{timeout:30000})
  }catch(error){await compensate(row.id).catch(()=>{});throw error}finally{clearInterval(heartbeat)}
 }
 // Inspect retains bytes only server-side for the current request; never puts a ZIP in a browser URL.
 async function describe(a,ref){const {_inspected,...result}=await inspect(a,ref);return result}
 return {inspect:describe,confirm,startCleanup,recoverExpired,readFile,files}
}
