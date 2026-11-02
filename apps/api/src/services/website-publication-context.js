import {readFile as readDisk} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createWebsiteReleaseStorage,releaseBytesHash} from './website-release-storage.js'
import {createWebsiteReleaseService} from './website-release-service.js'
import {createWebsiteGatewayService} from './website-gateway-service.js'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'
export function createWebsitePublicationContext({prisma,supabaseAdmin,storage:provided,runtime:providedRuntime,...options}) {
 const storage=provided??createWebsiteReleaseStorage({supabaseAdmin})
 const runtime=providedRuntime??(async()=>{
   const folder=resolve(process.env.RUNLY_WEBSITE_RUNTIME_DIR??'apps/api/public/website-runtime')
   const registry=JSON.parse(await readDisk(resolve(folder,'registry.json'),'utf8')), files={}
   for(const[name,entry]of Object.entries(registry)) {
     if(!['entry.js','style.css'].includes(name))throw new WebsiteServiceError('Runtime inválido.',503,'runtime_unavailable')
     const bytes=await readDisk(resolve(folder,name));if(releaseBytesHash(bytes)!==entry.hash)throw new WebsiteServiceError('Runtime inválido.',503,'runtime_unavailable')
     files[name]={bytes,mime:entry.mime,hash:entry.hash}
   }
   if(!files['entry.js'])throw new WebsiteServiceError('Runtime no disponible.',503,'runtime_unavailable')
   return files
 })
 const readFile=options.readFile??(async file=>{
   const result=await supabaseAdmin.storage.from(file.bucket).download(file.objectKey)
   if(result.error||!result.data)throw new WebsiteServiceError('Archivo no disponible.',503,'dependency_unavailable')
   return Buffer.from(await result.data.arrayBuffer())
 })
 const releases=createWebsiteReleaseService({prisma,storage,runtime,readFile,...options})
 const adminUrl=process.env.RUNLY_APP_URL
 const gateway=createWebsiteGatewayService({prisma,storage,namespaceRoot:process.env.RUNLY_WEBSITE_NAMESPACE_ROOT,adminHosts:adminUrl?[new URL(adminUrl).host]:[],...options})
 return {storage,releases,gateway,runtime}
}
