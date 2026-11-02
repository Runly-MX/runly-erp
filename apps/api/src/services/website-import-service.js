import {inspectWebsiteZip,STATIC_ZIP_POLICY} from './website-zip-policy.js'
import {validateWebsiteZipReferences} from './website-zip-references.js'
import {releaseBytesHash} from './website-release-storage.js'
import {assertWebsiteAccess} from './website-authorization-service.js'
import {createWebsiteDraftService} from './website-draft-service.js'
import {WebsiteServiceError,notFound} from '../routes/website/service-helpers.js'

export function createWebsiteImportService({prisma,storage,limits=STATIC_ZIP_POLICY}) {
  const drafts=createWebsiteDraftService({prisma})
  const fail=(code,status=422)=>new WebsiteServiceError('No se pudo completar la importación.',status,code)
  async function authorize(a) {
    assertWebsiteAccess(a.access,a.companyId,'website.dist.upload')
    if(!a.siteId||!await prisma.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}}))throw notFound('Recurso')
    return {...a,actorId:a.access.actorId}
  }
  async function get(input) {
    const a=await authorize(input)
    const row=await prisma.websiteImport.findFirst({where:{id:a.importId,companyId:a.companyId,siteId:a.siteId}})
    if(!row)throw notFound('Recurso');return row
  }
  async function create(input) {
    const a=await authorize(input)
    if(typeof a.idempotencyKey!=='string'||a.idempotencyKey.length<16||a.idempotencyKey.length>200)throw fail('validation_failed')
    if(!Buffer.isBuffer(a.bytes)||a.bytes.length>limits.compressed)throw fail('archive_too_large',413)
    const archiveHash=releaseBytesHash(a.bytes),archiveKey=`company/${a.companyId}/site/${a.siteId}/imports/${archiveHash}.zip`
    let claimed=false
    const captured=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('website.import.capacity',2))::text`
      return drafts.receipt(tx,a,`import:${a.siteId}`,{archiveHash,routingMode:a.routingMode??'mpa',rootDirectory:a.rootDirectory??null},async()=>{
        // Explicit requests reclaim expired work after a crashed local process.
        // The ready update below is fenced by phase so a stale worker cannot win.
        const cutoff=new Date(Date.now()-limits.timeout)
        await tx.websiteImport.updateMany({where:{companyId:a.companyId,siteId:a.siteId,phase:'validating',createdAt:{lt:cutoff}},data:{phase:'failed',errorCode:'archive_timeout'}})
        if(await tx.websiteImport.count({where:{phase:'validating',createdAt:{gte:cutoff}}})>=2||await tx.websiteImport.count({where:{companyId:a.companyId,siteId:a.siteId,phase:'validating'}}))throw fail('import_capacity',429)
        claimed=true
        const created=await tx.websiteImport.create({data:{companyId:a.companyId,siteId:a.siteId,actorId:a.actorId,archiveHash,archiveKey,phase:'validating'}})
        await tx.auditLog.create({data:{actorId:a.actorId,moduleKey:'runly.website',entityType:'website.import',entityId:created.id,action:'import.create',metadata:{companyId:a.companyId,siteId:a.siteId,archiveHash}}})
        return created
      })
    })
    const previous=await get({...a,importId:captured.id})
    if(previous.phase!=='validating'||!claimed)return previous
    const refs=new Map(),texts=new Map(),deadline=Date.now()+limits.timeout
    const check=()=>{if(Date.now()>=deadline)throw fail('archive_timeout',413)}
    let timer
    try {
      return await Promise.race([(async()=>{
      check()
      await storage.put(archiveKey,a.bytes,'application/zip')
      check()
      const archive=await storage.get(archiveKey);check();if(releaseBytesHash(archive)!==archiveHash)throw fail('archive_integrity_failed')
      const manifest=await inspectWebsiteZip(archive,{limits,routingMode:a.routingMode,rootDirectory:a.rootDirectory,onFile:async(file,bytes)=>{
        check()
        const objectKey=`company/${a.companyId}/site/${a.siteId}/objects/${file.hash}`
        await storage.put(objectKey,bytes,file.mime)
        check()
        const verify=await storage.get(objectKey);check();if(verify.length!==file.size||releaseBytesHash(verify)!==file.hash)throw fail('archive_integrity_failed')
        refs.set(file.path,objectKey)
        if(['text/html','text/css','text/javascript'].includes(file.mime))texts.set(file.path,bytes.toString('utf8'))
      }})
      const normalizedTexts=new Map([...texts].map(([path,text])=>[path.slice(manifest.rootDirectory.length),text]))
      await validateWebsiteZipReferences(manifest.files,normalizedTexts,{timeout:deadline-Date.now()})
      manifest.files=manifest.files.map(file=>({...file,objectKey:refs.get(manifest.rootDirectory+file.path)}))
      await prisma.websiteImport.updateMany({where:{id:previous.id,companyId:a.companyId,siteId:a.siteId,phase:'validating',createdAt:{gte:new Date(Date.now()-limits.timeout)}},data:{phase:'ready',manifest}})
      check();return get({...a,importId:previous.id})
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('archive_timeout',413)),limits.timeout)})])
    }catch(e){
      await prisma.websiteImport.updateMany({where:{id:previous.id,companyId:a.companyId,siteId:a.siteId,phase:'validating'},data:{phase:'failed',errorCode:e instanceof WebsiteServiceError?e.code:'import_dependency_unavailable'}})
      if(e instanceof WebsiteServiceError)throw e;throw fail('import_dependency_unavailable',503)
    }finally{clearTimeout(timer)}
  }
  return {create,get}
}
