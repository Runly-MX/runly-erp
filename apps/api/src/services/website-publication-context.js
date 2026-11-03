import {createWebsiteAdminContractService} from './website-admin-contract-service.js'
import {readFile as readDisk} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
// Anchored to this file, not the process cwd: the API container starts in /app/apps/api.
const bundledRuntime=fileURLToPath(new URL('../../public/website-runtime',import.meta.url))
import {createWebsiteReleaseStorage,releaseBytesHash} from './website-release-storage.js'
import {createWebsiteReleaseService} from './website-release-service.js'
import {createWebsiteGatewayService} from './website-gateway-service.js'
import {createRegistryClientFromEnv} from './website-registry-client.js'
import {createWebsiteHostnameService} from './website-hostname-service.js'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'
import {createWebsiteImportService} from './website-import-service.js'
import {createWebsiteContentIsolation} from './website-content-isolation.js'
import {createWebsiteStaticServing} from './website-static-serving.js'
import {createWebsitePreviewService} from './website-preview-service.js'
export function createWebsitePublicationContext({prisma,supabaseAdmin,storage:provided,runtime:providedRuntime,...options}) {
 const storage=provided??createWebsiteReleaseStorage({supabaseAdmin})
 const runtime=providedRuntime??(async()=>{
   const folder=resolve(process.env.RUNLY_WEBSITE_RUNTIME_DIR??bundledRuntime)
   const registry=JSON.parse(await readDisk(resolve(folder,'registry.json'),'utf8')), files={}
   for(const[name,entry]of Object.entries(registry)) {
     if(!['entry.js','style.css'].includes(name))throw new WebsiteServiceError('Runtime inválido.',503,'runtime_unavailable')
     const bytes=await readDisk(resolve(folder,name));if(releaseBytesHash(bytes)!==entry.hash)throw new WebsiteServiceError('Runtime inválido.',503,'runtime_unavailable')
     files[name]={bytes,mime:entry.mime,hash:entry.hash,rendererVersion:entry.rendererVersion}
   }
   if(!files['entry.js'])throw new WebsiteServiceError('Runtime no disponible.',503,'runtime_unavailable')
   return files
 })
 const readFile=options.readFile??(async file=>{
   const result=await supabaseAdmin.storage.from(file.bucket).download(file.objectKey)
   if(result.error||!result.data)throw new WebsiteServiceError('Archivo no disponible.',503,'dependency_unavailable')
   return Buffer.from(await result.data.arrayBuffer())
 })
 const isolation=options.isolation??createWebsiteContentIsolation({adminOrigin:process.env.RUNLY_APP_URL,contentRoot:process.env.RUNLY_WEBSITE_CONTENT_ROOT,previewRoot:process.env.RUNLY_WEBSITE_PREVIEW_ROOT})
 const imports=createWebsiteImportService({prisma,storage,limits:options.importLimits})
 const releases=createWebsiteReleaseService({prisma,storage,runtime,readFile,imports,isolation,...options})
 const adminUrl=process.env.RUNLY_APP_URL
 const gateway=createWebsiteGatewayService({prisma,storage,isolation,namespaceRoot:process.env.RUNLY_WEBSITE_NAMESPACE_ROOT,registryMaxStaleMs:Number(process.env.RUNLY_REGISTRY_MAX_STALE_MS)||undefined,adminHosts:[adminUrl,process.env.RUNLY_API_URL??process.env.ATLAS_API_URL].filter(Boolean).map(url=>new URL(url).host),...options})
 const registry=options.registry===undefined?createRegistryClientFromEnv(process.env):options.registry
 const hostnames=createWebsiteHostnameService({prisma,registry,namespaceRoot:process.env.RUNLY_WEBSITE_NAMESPACE_ROOT,gateway})
 const staticServing=createWebsiteStaticServing({prisma,storage,isolation})
 gateway.staticContent=staticServing.serve
 const previews=createWebsitePreviewService({prisma,isolation,storage,releases})
 const contracts=createWebsiteAdminContractService({prisma,isolation,readFile,namespaceRoot:process.env.RUNLY_WEBSITE_NAMESPACE_ROOT,...options})
 return {storage,releases,gateway,hostnames,registry,runtime,imports,isolation,previews,contracts}
}
