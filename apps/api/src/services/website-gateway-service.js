import { WebsiteServiceError,notFound } from '../routes/website/service-helpers.js'
import { assertWebsiteAccess } from './website-authorization-service.js'
import { websiteDocumentHash as hash } from './website-draft-service.js'
import { releaseBytesHash } from './website-release-storage.js'
const fail=(code,status=404)=>new WebsiteServiceError('Sitio no disponible.',status,code)
const reserved=new Set(['admin','api','app','auth','login','public','preview','support','status','www','mail','erp','mcp','runly','atlas','internal','system'])
export function strictWebsiteHostname(authority) {
  if(typeof authority!=='string'||authority.length>253||/[\s,@\\/#?%\x00-\x1f]/.test(authority))throw fail('invalid_hostname',400)
  const match=authority.match(/^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/i)
  if(!match||match[2]&&Number(match[2])>65535)throw fail('invalid_hostname',400)
  const host=match[1].toLowerCase().replace(/\.$/,'')
  if(host.split('.').some(label=>!label||label.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))throw fail('invalid_hostname',400)
  return host
}
export function createWebsiteGatewayService({prisma,storage,namespaceRoot,adminHosts=[],trustedAuthority,isolation}) {
  const admin=new Set(adminHosts.filter(Boolean).map(strictWebsiteHostname))
  async function authority(c) {
    // Forwarded headers are ignored unless a server-owned peer verifier supplied
    // this callback. Request headers can never enable proxy trust.
    return strictWebsiteHostname(trustedAuthority?await trustedAuthority(c):c.req.header('host')??new URL(c.req.url).host)
  }
  async function resolveUnsafe(c) {
    const hostname=await authority(c)
    if(admin.has(hostname))throw fail('administrative_origin')
    const domain=await prisma.websiteDomain.findUnique({where:{hostname}})
    if(!domain||domain.state!=='assigned'||!domain.ready||!domain.siteId)throw notFound('Recurso')
    const site=await prisma.websiteSite.findFirst({where:{id:domain.siteId,companyId:domain.companyId,enabled:true}})
    const company=site&&await prisma.company.findFirst({where:{id:site.companyId,enabled:true},select:{slug:true}})
    if(!site||!company)throw notFound('Recurso')
    if(site.status==='maintenance'||site.sourceType==='none')throw notFound('Recurso')
    if(site.releaseManaged&&(!site.activeReleaseId||site.lifecycle!=='published'||site.status==='maintenance'||site.sourceType==='none'))throw notFound('Recurso')
    if(!site.releaseManaged)return {site,company,hostname,release:null}
    const release=await prisma.websiteRelease.findFirst({where:{id:site.activeReleaseId,companyId:site.companyId,siteId:site.id,state:'ready'}})
    if(!release||hash(release.manifest)!==release.manifestHash)throw fail('integrity_failed',503)
    if(release.manifest.kind==='dist'){if(!isolation)throw fail('isolation_required',409);isolation.publicHost(hostname)}
    return {site,company,hostname,release}
  }
  async function resolve(c) {try{return await resolveUnsafe(c)}catch(e){if(e instanceof WebsiteServiceError)throw e;throw fail('dependency_unavailable',503)}}
  function response(snapshot,path) {
    const m=snapshot.release.manifest,r=m.routes.find(r=>r.path===path)
    return {initialized:true,integrityMode:'sealed',releaseId:snapshot.release.id,publicationRevision:snapshot.site.publicationRevision,
      site:{id:snapshot.site.id,name:m.identity.name,domain:snapshot.hostname,sourceType:m.kind,company:snapshot.company.slug,analyticsMode:snapshot.site.analyticsMode??'off',turnstileSiteKey:snapshot.site.turnstileSiteKey??null},
      page:r?{id:r.sourceId,title:r.title,slug:r.slug,routePath:r.path,status:'published',publishedBuilderData:r.document,seo:r.seo}:null,theme:m.theme,menus:m.menus,
      runtime:{...m.runtime,assets:Object.fromEntries(Object.entries(m.runtime.assets).map(([k,v])=>[k,{hash:v.hash,mime:v.mime,size:v.size}]))},dynamic:m.dynamic,assets:Object.fromEntries(Object.entries(m.assets).map(([k,v])=>[k,{hash:v.hash,mime:v.mime,size:v.size}]))}
  }
  async function asset(c,releaseId,digest) {
    const current=await resolve(c)
    if(!current.release)throw notFound('Recurso')
    const event=await prisma.websitePublicationEvent.findFirst({where:{companyId:current.site.companyId,siteId:current.site.id,releaseId}})
    if(!event)throw notFound('Recurso')
    const previous=await prisma.websiteRelease.findFirst({where:{id:releaseId,companyId:current.site.companyId,siteId:current.site.id,state:'ready'}})
    if(!previous||hash(previous.manifest)!==previous.manifestHash)throw notFound('Recurso')
    if(previous.manifest.kind==='dist'){if(!isolation)throw fail('isolation_required',409);isolation.publicHost(current.hostname)}
    const ref=previous.manifest.assets[digest]??Object.values(previous.manifest.runtime.assets).find(a=>a.hash===digest)
    if(!ref)throw notFound('Recurso')
    let bytes;try{bytes=await storage.get(ref.objectKey)}catch{throw fail('dependency_unavailable',503)}
    if(bytes.length!==ref.size||releaseBytesHash(bytes)!==digest)throw fail('integrity_failed',503)
    return {bytes,mime:ref.mime,kind:previous.manifest.kind}
  }
  async function reserve(a) {
    assertWebsiteAccess(a.access,a.companyId,'website.domains.manage');assertWebsiteAccess(a.access,a.companyId,'website.site.update')
    if(!a.siteId)throw notFound('Recurso')
    const parent=await prisma.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}})
    if(!parent)throw notFound('Recurso')
    if(!namespaceRoot)throw fail('namespace_unavailable',409)
    if(typeof a.slug!=='string'||!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(a.slug)||reserved.has(a.slug)||/^(?:runly|atlas|internal|system|admin|api|auth)-/.test(a.slug))throw fail('hostname_reserved',409)
    const hostname=strictWebsiteHostname(`${a.slug}.${namespaceRoot}`)
    if(admin.has(hostname))throw fail('hostname_reserved',409)
    const previous=await prisma.websiteDomain.findUnique({where:{hostname}})
    if(previous) {
      if(previous.companyId===a.companyId&&previous.siteId===a.siteId)return previous
      throw fail('hostname_taken',409)
    }
    try{return await prisma.websiteDomain.create({data:{hostname,companyId:a.companyId,siteId:a.siteId,kind:'platform',state:namespaceRoot.endsWith('.test')?'assigned':'pending',ready:namespaceRoot.endsWith('.test')}})}catch(e){if(e.code==='P2002')throw fail('hostname_taken',409);throw e}
  }
  async function domains(a) {
    assertWebsiteAccess(a.access,a.companyId,'website.site.read')
    if(!a.siteId)throw notFound('Recurso')
    if(!await prisma.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}}))throw notFound('Recurso')
    return prisma.websiteDomain.findMany({where:{companyId:a.companyId,siteId:a.siteId},select:{hostname:true,kind:true,state:true,ready:true,registryManaged:true,registryVersion:true,registrySyncedAt:true}})
  }
  return {resolve,response,asset,reserve,authority,domains}
}
