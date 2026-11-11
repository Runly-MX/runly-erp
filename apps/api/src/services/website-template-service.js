import {allTemplates} from '../../../desktop/src/website/runlyTemplates/index.js'
import {createWebsiteDraftService,normalizeWebsiteDocument} from './website-draft-service.js'
import {assertWebsiteAccess} from './website-authorization-service.js'
import {WebsiteServiceError,notFound} from '../routes/website/service-helpers.js'
import {defaultTheme,defineTheme} from '@raulbellosom/atlas-web-builder'
import {conformTemplateDocument} from './website-template-conform.js'
import {applyTemplateBranding} from './website-template-branding.js'
import {bindContactForm,ensureTemplateForm,placeholdersIn,usesContactForm} from './website-template-forms.js'

// A template theme may override any token group (color, font, radius, button, card), never the scale tokens.
export const mergeTemplateTokens=(base,custom={})=>Object.fromEntries(Object.entries(base).map(([group,value])=>[group,custom[group]&&typeof value==='object'?{...value,...custom[group]}:value]))

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
    if(a.replaceExisting)assertWebsiteAccess(a.access,a.companyId,'website.pages.delete')
    const branding=a.branding??null
    if(branding?.logoFileId){
      const file=await prisma.fileAsset.findFirst({where:{id:branding.logoFileId,entityId:{in:[a.companyId,a.siteId]},enabled:true}})
      if(!file||!/^image\/(?:png|jpeg|webp|gif|avif)$/.test(file.mimeType??''))throw fail('validation_failed')
    }
    const pages=template.pages.filter(p=>a.pageIds.includes(p.id)).map(p=>({...p,document:applyTemplateBranding(conformTemplateDocument(normalizeWebsiteDocument(structuredClone(p.page),{strict:true})),branding??{})}))
    return applyResolved(a,template,pages)
  }
  async function applyResolved(a,template,pages,{tx:provided,formMode='local',allowDropForms=true}={}) {
    const branding=a.branding??null
    const execute=async tx=>{
      await drafts.lockSite(tx,a.companyId,a.siteId)
      return drafts.receipt(tx,{...a,actorId:a.access.actorId},`template.apply:${a.siteId}`,{templateId:a.templateId??template.id,pageIds:[...a.pageIds].sort(),includeTheme:Boolean(a.includeTheme),replaceExisting:Boolean(a.replaceExisting),branding,expectedRevision:a.expectedRevision,...(!allowDropForms?{formMode}:{})},async()=>{
        const site=await tx.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}})
        if(!site)throw notFound('Recurso');drafts.expected(site.draftRevision,a.expectedRevision)
        const existing=await tx.websitePage.findMany({where:{companyId:a.companyId,siteId:a.siteId},select:{id:true,enabled:true,routePath:true,draftMetadata:true}})
        const clashes=existing.filter(row=>pages.some(p=>row.routePath===p.routePath||row.draftMetadata?.routePath===p.routePath))
        // Replacing deletes only the draft pages whose route the template takes; the public version changes on the next publish.
        if(clashes.length&&(!a.replaceExisting||clashes.some(row=>!row.enabled)))throw fail('route_conflict',409)
        for(const row of clashes){
          await tx.websitePage.update({where:{id:row.id},data:{enabled:false,routePath:`${row.routePath}#deleted-${row.id}`}})
          await tx.auditLog.create({data:{actorId:a.access.actorId,moduleKey:'runly.website',entityType:'website.page',entityId:row.id,action:'page.delete',metadata:{companyId:a.companyId,siteId:a.siteId,reason:'template.replace',templateId:a.templateId}}})
        }
        // A ContactFormBlock placeholder gets the site's contact form; without permission to create forms it is dropped.
        if(pages.some(p=>usesContactForm(p.document))){
          let canCreate=true
          try{assertWebsiteAccess(a.access,a.companyId,'website.forms.create')}catch{canCreate=false}
          const forms={}
          if(!allowDropForms&&formMode==='local'&&!canCreate)throw fail('permission_denied',403)
          for(const placeholder of new Set(pages.flatMap(p=>placeholdersIn(p.document))))forms[placeholder]=canCreate&&formMode==='local'?await ensureTemplateForm({tx,companyId:a.companyId,siteId:a.siteId,placeholder,createsLead:allowDropForms}):null
          for(const p of pages) {
            if(allowDropForms)bindContactForm(p.document,forms)
            else for(const block of Object.values(p.document.blocks))if(block.type==='ContactFormBlock'&&Object.hasOwn(forms,block.props?.formId)&&forms[block.props.formId])block.props.formId=forms[block.props.formId]
          }
        }
        const created=[]
        for(const page of pages){
          const slug=page.routePath.replace(/^\//,'').replace(/[^a-z0-9-]/g,'-')||'inicio'
          const metadata={title:page.label,slug,routePath:page.routePath,visibility:'public'}
          const row=await tx.websitePage.create({data:{companyId:a.companyId,siteId:a.siteId,...metadata,pageType:'page',status:'draft',draftMetadata:metadata,draftBuilderData:page.document,draftSeo:page.document.seo??{},seo:{},createdById:a.access.actorId,updatedById:a.access.actorId}})
          created.push({id:row.id,title:row.title,routePath:row.routePath})
        }
        if(!allowDropForms&&created.some(p=>p.routePath==='/')){
          const current=await tx.websiteSite.findUnique({where:{id:a.siteId}})
          await tx.websiteSite.update({where:{id:a.siteId},data:{draftIdentity:{...(current.draftIdentity??{name:current.name,siteType:current.siteType,settings:current.settings??{},seoDefaults:current.seoDefaults??{},themeId:current.themeId}),homepagePageId:created.find(p=>p.routePath==='/').id},draftRevision:{increment:1}}})
        }
        if(a.includeTheme&&template.themeTokens){
          const tokens=defineTheme({...defaultTheme,id:'site-theme',name:template.label,tokens:mergeTemplateTokens(defaultTheme.tokens,template.themeTokens)}).tokens
          const theme=await tx.websiteTheme.create({data:{companyId:a.companyId,siteId:a.siteId,name:template.label,tokens}})
          const current=await tx.websiteSite.findUnique({where:{id:a.siteId}})
          await tx.websiteSite.update({where:{id:a.siteId},data:{draftIdentity:{...(current.draftIdentity??{name:current.name,siteType:current.siteType,settings:current.settings??{},seoDefaults:current.seoDefaults??{}}),themeId:theme.id},draftRevision:{increment:1}}})
        }
        await tx.auditLog.create({data:{actorId:a.access.actorId,moduleKey:'runly.website',entityType:'website.site',entityId:a.siteId,action:'template.apply',metadata:{companyId:a.companyId,templateId:a.templateId,pageIds:created.map(p=>p.id)}}})
        const final=await tx.websiteSite.findUnique({where:{id:a.siteId}})
        return {siteId:a.siteId,pages:created,replaced:clashes.length,firstPageId:created[0].id,draftRevision:final.draftRevision,publicReleaseUnchanged:true}
      })
    }
    return provided?execute(provided):prisma.$transaction(execute,{timeout:30000})
  }
  async function applyBundle(a,bundle,tx) {
    for(const permission of ['website.site.read','website.pages.create'])assertWebsiteAccess(a.access,a.companyId,permission)
    if(a.includeTheme)for(const permission of ['website.site.update','website.theme.update'])assertWebsiteAccess(a.access,a.companyId,permission)
    if(bundle.pages.some(p=>p.routePath==='/'))assertWebsiteAccess(a.access,a.companyId,'website.site.update')
    if(a.replaceExisting)for(const permission of ['website.pages.update','website.pages.delete'])assertWebsiteAccess(a.access,a.companyId,permission)
    return applyResolved(a,{id:bundle.source.releaseId,label:bundle.title,themeTokens:bundle.themeTokens},bundle.pages,{tx,formMode:a.formMode,allowDropForms:false})
  }
  return {apply,applyBundle}
}
