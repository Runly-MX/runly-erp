import {WebsiteServiceError} from '../routes/website/service-helpers.js'
import {websiteDocumentHash} from './website-draft-service.js'

// A missing map is diagnostic, never permission to guess an owner during a GET.
export function createWebsiteFormScopeService({prisma}) {
  const fail=(code,status=409)=>new WebsiteServiceError('El formulario requiere revisión de pertenencia.',status,code)
  async function inspect({companyId,formId,db=prisma}) {
    const form=await db.websiteForm.findFirst({where:{id:formId,companyId}})
    if(!form)throw fail('resource_not_found',404)
    const scope=await db.websiteFormScope.findFirst({where:{companyId,formId}})
    const [site,property]=await Promise.all([
      db.websiteSite.findFirst({where:{companyId,id:scope?.ownerWebsiteSiteId??form.siteId,enabled:true}}),
      db.growthProperty.findFirst({where:{companyId,id:scope?.ownerPropertyId??form.siteId,enabled:true}}),
    ])
    if(!scope)return {form,scope:null,state:site&&property?'owner_ambiguous':'owner_unresolved',code:site&&property?'ambiguous_site_identifier':'form_scope_unresolved',site,property}
    const owner=scope.ownerKind==='website'?site:property
    const analytics=await db.growthProperty.findFirst({where:{companyId,id:scope.analyticsPropertyId,enabled:true,status:'active'}})
    let linked=scope.ownerKind==='website'?analytics?.websiteSiteId===site?.id:analytics?.id===property?.id
    if(scope.ownerKind==='growth_property'&&property?.websiteSiteId&&!await db.websiteSite.findFirst({where:{id:property.websiteSiteId,companyId,enabled:true}}))linked=false
    const challenge=scope.ownerKind==='website'?site:analytics
    const assignee=form.defaultAssigneeUserId?await db.membership.findFirst({where:{companyId,userId:form.defaultAssigneeUserId,enabled:true,user:{enabled:true}},select:{id:true}}):null
    const dependency=form.defaultAssigneeUserId&&!assignee?'assignee':form.turnstileRequired&&(!challenge?.turnstileSiteKey||!challenge?.turnstileSecretKey)?'turnstile':null
    const state=!form.enabled?'disabled':!owner||!analytics||!linked||analytics.capabilities?.forms===false?'owner_unresolved':dependency?'dependency_unavailable':'publishable'
    return {form,scope,state,dependency,code:state==='disabled'?'form_disabled':state==='publishable'?null:state==='dependency_unavailable'?'dependency_unavailable':'form_scope_unresolved',site,property,analytics}
  }
  async function provision({companyId,formId,ownerKind,ownerId,allowAmbiguous=false,newForm=false,db=prisma}) {
    await db.$queryRaw`SELECT id FROM website_form WHERE id=${formId}::uuid AND company_id=${companyId}::uuid FOR UPDATE`
    const current=await inspect({companyId,formId,db})
    if(current.scope){
      if(current.scope.ownerKind!==ownerKind||(current.scope.ownerWebsiteSiteId??current.scope.ownerPropertyId)!==ownerId)throw fail('scope_conflict')
      return current.scope
    }
    if(current.form.siteId!==ownerId)throw fail('resource_not_found',404)
    if(current.state==='owner_ambiguous'&&!allowAmbiguous)throw fail('ambiguous_site_identifier')
    const owner=ownerKind==='website'?current.site:current.property
    if(!owner||owner.id!==ownerId)throw fail('resource_not_found',404)
    let analytics=owner
    if(ownerKind==='website')analytics=await db.growthProperty.upsert({
      where:{companyId_websiteSiteId:{companyId,websiteSiteId:owner.id}},update:{},
      create:{companyId,websiteSiteId:owner.id,kind:'website_module',name:owner.name,domain:owner.domain,status:'active',analyticsMode:owner.analyticsMode??'off'},
    })
    if(!analytics.enabled)throw fail('form_scope_unresolved')
    return db.websiteFormScope.create({data:{companyId,formId,ownerKind,ownerWebsiteSiteId:ownerKind==='website'?ownerId:null,ownerPropertyId:ownerKind==='growth_property'?ownerId:null,analyticsPropertyId:analytics.id,legacySiteId:current.form.siteId,classification:newForm?'created':current.state==='owner_ambiguous'?'explicit_resolution':'unambiguous',policyVersion:'form-scope-v1'}})
  }
  async function publishability({companyId,formId,siteId,db=prisma}) {
    let result
    try{result=await inspect({companyId,formId,db})}catch(e){if(e.status!==404)throw e;return {state:'not_found',reason:{code:'form_not_found'},usedBy:[]}}
    if(result.scope&&(result.scope.ownerKind!=='website'||result.scope.ownerWebsiteSiteId!==siteId))return {state:'not_found',reason:{code:'form_not_found'},usedBy:[]}
    if(!result.scope&&result.form.siteId!==siteId)return {state:'not_found',reason:{code:'form_not_found'},usedBy:[]}
    return {state:result.state,...(result.code&&{reason:{code:result.code,...(result.dependency&&{dependency:result.dependency})}}),usedBy:[]}
  }
  async function publicContext({companySlug,formId,siteId,websiteSiteId,propertyId,origin,pageId,db=prisma,lock=false}) {
    const company=await db.company.findFirst({where:{slug:companySlug,enabled:true}})
    if(!company)throw fail('form_not_found',404)
    if(lock){
      await db.$queryRaw`SELECT id FROM company WHERE id=${company.id}::uuid FOR SHARE`
      if(!await db.company.findFirst({where:{id:company.id,enabled:true}}))throw fail('form_not_found',404)
    }
    const result=await inspect({companyId:company.id,formId,db})
    if(result.state!=='publishable')throw fail('form_not_found',404)
    const {scope}=result
    if(websiteSiteId&&propertyId)throw fail('scope_conflict',400)
    const ownerId=scope.ownerWebsiteSiteId??scope.ownerPropertyId
    if(websiteSiteId&&(scope.ownerKind!=='website'||websiteSiteId!==ownerId)||propertyId&&(scope.ownerKind!=='growth_property'||propertyId!==ownerId))throw fail('form_not_found',404)
    if(siteId&&siteId!==ownerId&&siteId!==scope.analyticsPropertyId)throw fail('form_not_found',404)
    if(siteId&&!websiteSiteId&&!propertyId) {
      const [ws,gp]=await Promise.all([db.websiteSite.findFirst({where:{id:siteId,companyId:company.id,enabled:true}}),db.growthProperty.findFirst({where:{id:siteId,companyId:company.id,enabled:true}})])
      if(ws&&gp)throw fail('ambiguous_site_identifier')
    }
    let binding=null
    if(scope.ownerKind==='website') {
      // Lock order matches publication: site first, then form. Disable waits on
      // the form lock; requests arriving after its commit cannot be accepted.
      if(lock)await db.$queryRaw`SELECT id FROM website_site WHERE id=${ownerId}::uuid AND company_id=${company.id}::uuid FOR SHARE`
      const site=await db.websiteSite.findFirst({where:{id:ownerId,companyId:company.id,enabled:true}})
      if(!site||site.lifecycle==='archived')throw fail('form_not_found',404)
      if(site.releaseManaged) {
        const release=site.activeReleaseId?await db.websiteRelease.findFirst({where:{id:site.activeReleaseId,companyId:company.id,siteId:ownerId,state:'ready'}}):null
        if(!release||websiteDocumentHash(release.manifest)!==release.manifestHash)throw fail('form_not_found',404)
        const pages=release.manifest?.routes?.filter(r=>(!pageId||r.sourceId===pageId)&&Object.values(r.document?.blocks??{}).some(b=>b.props?.formId===formId))??[]
        if(!pages.length||!release.manifest.dynamic?.some(d=>d.kind==='form'&&d.formId===formId&&d.websiteSiteId===ownerId))throw fail('form_not_found',404)
        const source=pageId?pages.find(r=>r.sourceId===pageId):pages.length===1?pages[0]:null
        binding={websiteSiteId:ownerId,releaseId:release.id,pageId:source?.sourceKind==='page'?source.sourceId:null,blogPostId:source?.sourceKind==='blog'?source.sourceId:null}
      } else {
        const pages=await db.websitePage.findMany({where:{companyId:company.id,siteId:ownerId,enabled:true,status:'published',visibility:'public',...(pageId&&{id:pageId})}})
        if(site.status!=='published'||!pages.some(p=>Object.values(p.publishedBuilderData?.blocks??{}).some(b=>b.props?.formId===formId)))throw fail('form_not_found',404)
        binding={websiteSiteId:ownerId,releaseId:null,pageId:pageId??null}
      }
      if(origin) {
        let host;try{const u=new URL(origin);if(!['https:','http:'].includes(u.protocol))throw Error();host=u.hostname}catch{throw fail('origin_forbidden',403)}
        const domain=await db.websiteDomain.findFirst({where:{companyId:company.id,siteId:ownerId,hostname:host,ready:true,state:'assigned'}})
        if(!domain)throw fail('origin_forbidden',403)
      }
    } else if(origin) {
      let configured,request;try{configured=new URL(result.analytics.domain.includes('://')?result.analytics.domain:'https://'+result.analytics.domain).origin;request=new URL(origin).origin}catch{throw fail('origin_forbidden',403)}
      if(configured!==request)throw fail('origin_forbidden',403)
    }
    if(lock){
      await db.$queryRaw`SELECT id FROM growth_property WHERE id=${scope.analyticsPropertyId}::uuid AND company_id=${company.id}::uuid FOR SHARE`
      const live=await db.growthProperty.findFirst({where:{id:scope.analyticsPropertyId,companyId:company.id,enabled:true,status:'active'}})
      if(!live||live.capabilities?.forms===false||scope.ownerKind==='website'&&live.websiteSiteId!==ownerId)throw fail('form_not_found',404)
      await db.$queryRaw`SELECT id FROM website_form WHERE id=${formId}::uuid AND company_id=${company.id}::uuid FOR SHARE`
    }
    const form=await db.websiteForm.findFirst({where:{id:formId,companyId:company.id,enabled:true},include:{fields:{where:{companyId:company.id,enabled:true},orderBy:{sortOrder:'asc'}}}})
    if(!form)throw fail('form_not_found',404)
    const policySite=scope.ownerKind==='website'?{...result.analytics,analyticsMode:result.site.analyticsMode,turnstileSiteKey:result.site.turnstileSiteKey,turnstileSecretKey:result.site.turnstileSecretKey}:result.analytics
    return {company,site:policySite,form,binding,scope}
  }
  return {inspect,provision,publishability,publicContext}
}
