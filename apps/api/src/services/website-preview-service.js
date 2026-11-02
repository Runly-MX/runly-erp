import {randomBytes} from 'node:crypto'
import {assertWebsiteAccess} from './website-authorization-service.js'
import {websiteDocumentHash as hash} from './website-draft-service.js'
import {releaseBytesHash} from './website-release-storage.js'
import {WebsiteServiceError,notFound} from '../routes/website/service-helpers.js'

export function createWebsitePreviewService({prisma,isolation,storage,releases}) {
  const opaque=()=>new WebsiteServiceError('Vista previa no disponible.',404,'resource_not_found')
  async function owner(a,permission='website.pages.read') {
    assertWebsiteAccess(a.access,a.companyId,permission);assertWebsiteAccess(a.access,a.companyId,'website.site.read')
    if(!a.siteId||!await prisma.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}}))throw notFound('Recurso')
  }
  async function create(a) {
    await owner(a)
    let releaseId=a.releaseId
    if(!releaseId)releaseId=(await releases.preparePreview({...a,idempotencyKey:a.idempotencyKey??`preview-${randomBytes(24).toString('hex')}`})).id
    const release=await prisma.websiteRelease.findFirst({where:{id:releaseId,companyId:a.companyId,siteId:a.siteId,state:'ready'}})
    if(!release||hash(release.manifest)!==release.manifestHash)throw opaque()
    const token=randomBytes(32).toString('hex'),hostname=isolation.previewHost(randomBytes(16).toString('hex'))
    const session=await prisma.$transaction(async tx=>{const created=await tx.websitePreviewSession.create({data:{companyId:a.companyId,siteId:a.siteId,releaseId,actorId:a.access.actorId,hostname,tokenHash:releaseBytesHash(Buffer.from(token)),expiresAt:new Date(Date.now()+15*60*1000)}});await tx.auditLog.create({data:{actorId:a.access.actorId,moduleKey:'runly.website',entityType:'website.preview',entityId:created.id,action:'preview.create',metadata:{companyId:a.companyId,siteId:a.siteId,releaseId}}});return created})
    return {id:session.id,releaseId,expiresAt:session.expiresAt,url:`${isolation.previewOrigin(hostname)}/__preview#${token}`,readOnly:true,capabilities:{formSubmission:false,analytics:false,calendar:false,dynamicCatalog:false}}
  }
  async function revoke(a) {
    await owner(a)
    return prisma.$transaction(async tx=>{
      const where={id:a.previewId,companyId:a.companyId,siteId:a.siteId,actorId:a.access.actorId}
      const changed=await tx.websitePreviewSession.updateMany({where:{...where,revokedAt:null},data:{revokedAt:new Date()}})
      if(!changed.count){if(!await tx.websitePreviewSession.findFirst({where}))throw opaque();return {revoked:true}}
      await tx.auditLog.create({data:{actorId:a.access.actorId,moduleKey:'runly.website',entityType:'website.preview',entityId:a.previewId,action:'preview.revoke',metadata:{companyId:a.companyId,siteId:a.siteId}}})
      return {revoked:true}
    })
  }
  async function session(host) {
    const s=await prisma.websitePreviewSession.findUnique({where:{hostname:host}})
    if(!s||s.revokedAt||s.expiresAt<=new Date())throw opaque()
    const site=await prisma.websiteSite.findFirst({where:{id:s.siteId,companyId:s.companyId,enabled:true}})
    if(!site||!await prisma.company.findFirst({where:{id:s.companyId,enabled:true}}))throw opaque()
    const r=await prisma.websiteRelease.findFirst({where:{id:s.releaseId,companyId:s.companyId,siteId:s.siteId,state:'ready'}})
    if(!r||hash(r.manifest)!==r.manifestHash)throw opaque()
    return {session:s,site,release:r}
  }
  async function exchange(host,token,origin) {
    if(origin!==isolation.previewOrigin(host)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw opaque()
    const current=await session(host),cookie=randomBytes(32).toString('hex')
    const changed=await prisma.websitePreviewSession.updateMany({where:{id:current.session.id,companyId:current.session.companyId,siteId:current.session.siteId,tokenHash:releaseBytesHash(Buffer.from(token)),consumedAt:null,revokedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date(),cookieHash:releaseBytesHash(Buffer.from(cookie))}})
    if(!changed.count)throw opaque()
    return `__Host-runly-preview=${cookie}; Path=/; Max-Age=900; Secure; HttpOnly; SameSite=Strict`
  }
  async function authorize(host,cookies) {
    const current=await session(host),cookie=String(cookies??'').match(/(?:^|;\s*)__Host-runly-preview=([a-f0-9]{64})(?:;|$)/)?.[1]
    if(!cookie||!current.session.cookieHash||releaseBytesHash(Buffer.from(cookie))!==current.session.cookieHash)throw opaque()
    return current
  }
  async function bytes(ref) {const b=await storage.get(ref.objectKey);if(b.length!==ref.size||releaseBytesHash(b)!==ref.hash)throw new WebsiteServiceError('Recurso no disponible.',503,'integrity_failed');return b}
  return {create,revoke,session,exchange,authorize,bytes}
}
