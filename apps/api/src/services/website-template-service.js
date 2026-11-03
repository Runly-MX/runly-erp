import {allTemplates} from '../../../desktop/src/website/runlyTemplates/index.js'
import {createWebsiteDraftService,normalizeWebsiteDocument} from './website-draft-service.js'
import {assertWebsiteAccess} from './website-authorization-service.js'
import {WebsiteServiceError,notFound} from '../routes/website/service-helpers.js'
import {defaultTheme,defineTheme} from '@raulbellosom/atlas-web-builder'

export function createWebsiteTemplateService({prisma}) {
  const drafts=createWebsiteDraftService({prisma})
  const fail=(code,status=422)=>new WebsiteServiceError('No se pudo aplicar la plantilla.',status,code)
  async function apply(a) {
    for(const permission of ['website.site.read','website.pages.create'])assertWebsiteAccess(a.access,a.companyId,permission)
    const template=allTemplates.find(t=>t.id===a.templateId)
    if(!template)throw notFound('Recurso')
    if(!Array.isArray(a.pageIds)||!a.pageIds.length||a.pageIds.length>100||new Set(a.pageIds).size!==a.pageIds.length||a.pageIds.some(id=>!template.pages.some(p=>p.id===id)))throw fail('validation_failed')
    if(typeof a.idempotencyKey!=='string'||a.idempotencyKey.length<16||a.idempotencyKey.length>200||!Number.isSafeInteger(a.expectedRevision))throw fail('validation_failed')
    if(a.includeTheme)for(const permission of ['website.site.update','website.theme.update'])assertWebsiteAccess(a.access,a.companyId,permission)
    const pages=template.pages.filter(p=>a.pageIds.includes(p.id)).map(p=>({...p,document:normalizeWebsiteDocument(p.page,{strict:true})}))
    return prisma.$transaction(async tx=>{
      await drafts.lockSite(tx,a.companyId,a.siteId)
      return drafts.receipt(tx,{...a,actorId:a.access.actorId},`template.apply:${a.siteId}`,{templateId:a.templateId,pageIds:[...a.pageIds].sort(),includeTheme:Boolean(a.includeTheme),expectedRevision:a.expectedRevision},async()=>{
        const site=await tx.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}})
        if(!site)throw notFound('Recurso');drafts.expected(site.draftRevision,a.expectedRevision)
        const existing=await tx.websitePage.findMany({where:{companyId:a.companyId,siteId:a.siteId},select:{routePath:true,draftMetadata:true}})
        if(pages.some(p=>existing.some(row=>row.routePath===p.routePath||row.draftMetadata?.routePath===p.routePath)))throw fail('route_conflict',409)
        const created=[]
        for(const page of pages){
          const slug=page.routePath.replace(/^\//,'').replace(/[^a-z0-9-]/g,'-')||'inicio'
          const metadata={title:page.label,slug,routePath:page.routePath,visibility:'public'}
          const row=await tx.websitePage.create({data:{companyId:a.companyId,siteId:a.siteId,...metadata,pageType:'page',status:'draft',draftMetadata:metadata,draftBuilderData:page.document,draftSeo:page.document.seo??{},seo:{},createdById:a.access.actorId,updatedById:a.access.actorId}})
          created.push({id:row.id,title:row.title,routePath:row.routePath})
        }
        if(a.includeTheme&&template.themeTokens){
          const tokens=defineTheme({...defaultTheme,id:'site-theme',name:template.label,tokens:{...defaultTheme.tokens,color:{...defaultTheme.tokens.color,...template.themeTokens.color}}}).tokens
          const theme=await tx.websiteTheme.create({data:{companyId:a.companyId,siteId:a.siteId,name:template.label,tokens}})
          const current=await tx.websiteSite.findUnique({where:{id:a.siteId}})
          await tx.websiteSite.update({where:{id:a.siteId},data:{draftIdentity:{...(current.draftIdentity??{name:current.name,siteType:current.siteType,settings:current.settings??{},seoDefaults:current.seoDefaults??{}}),themeId:theme.id},draftRevision:{increment:1}}})
        }
        await tx.auditLog.create({data:{actorId:a.access.actorId,moduleKey:'runly.website',entityType:'website.site',entityId:a.siteId,action:'template.apply',metadata:{companyId:a.companyId,templateId:a.templateId,pageIds:created.map(p=>p.id)}}})
        const final=await tx.websiteSite.findUnique({where:{id:a.siteId}})
        return {siteId:a.siteId,pages:created,firstPageId:created[0].id,draftRevision:final.draftRevision,publicReleaseUnchanged:true}
      })
    },{timeout:30000})
  }
  return {apply}
}
