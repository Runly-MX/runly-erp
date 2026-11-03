import {assertWebsiteAccess} from './website-authorization-service.js'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'
import {normalizeWebsiteDocument,websiteDocumentHash as hash} from './website-draft-service.js'
import {createWebsiteFormScopeService} from './website-form-scope-service.js'
import {releaseBytesHash} from './website-release-storage.js'

export function createWebsiteAdminContractService({prisma,isolation,namespaceRoot,readFile}) {
  const scopes=createWebsiteFormScopeService({prisma})
  const permissions={
    'site.edit':'website.site.update','pages.create':'website.pages.create','pages.update':'website.pages.update',
    'pages.delete':'website.pages.delete','pages.publish':'website.pages.publish','release.rollback':'website.pages.publish',
    'site.unpublish':'website.pages.publish','site.archive':'website.site.update','domains.reserve':'website.domains.manage',
    'domains.custom':'website.domains.manage','forms.manage':'website.forms.update','forms.publish':'website.pages.publish',
    'submissions.read':'website.submissions.read','submissions.export':'website.submissions.export','submissions.delete':'website.submissions.delete',
    'import.zip':'website.dist.upload','preview.site':'website.pages.read','catalog.link':'website.site.update',
    'catalog.read':'catalog.products.read','catalog.select':'website.site.update',
    'settings.operational':'website.site.update','payments.configure':'website.site.update','templates.apply':'website.pages.create',
    'forms.resolveAmbiguous':'website.forms.update','templates.applyTheme':'website.theme.update',
  }
  async function owned(a,db=prisma) {
    assertWebsiteAccess(a.access,a.companyId,'website.site.read')
    const site=await db.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}})
    if(!site)throw new WebsiteServiceError('Recurso no encontrado.',404,'resource_not_found')
    return site
  }
  function capabilities(a,site) {
    const effectivePermissions=[...new Set(['website.site.read','website.pages.read','website.theme.read','website.theme.update','website.menus.read','website.menus.update',...Object.values(permissions),'website.forms.read','website.forms.create','website.forms.delete'].filter(p=>a.access.can(p)))].sort()
    const result={}
    for(const [key,p]of Object.entries(permissions)) {
      let reason=!a.access.can(p)?{code:'permission_denied',requiredPermission:p}:null
      const additional={'site.archive':'website.pages.publish','domains.reserve':'website.site.update','catalog.select':'catalog.products.read','forms.resolveAmbiguous':'growth.forms.update','templates.applyTheme':'website.site.update'}[key]
      if(!reason&&additional&&!a.access.can(additional))reason={code:'permission_denied',requiredPermission:additional}
      if(!reason&&['domains.custom','submissions.export','submissions.delete'].includes(key))reason={code:'feature_unavailable'}
      if(!reason&&key==='domains.reserve'&&!namespaceRoot)reason={code:'namespace_unavailable'}
      if(!reason&&site.lifecycle==='archived')reason={code:'lifecycle_state'}
      if(!reason&&['preview.site','import.zip'].includes(key))try{key==='preview.site'?isolation.previewHost('capability'):isolation.assertContentRoot()}catch{reason={code:'isolation_required'}}
      result[key]=reason?{allowed:false,reason}:{allowed:true}
    }
    result['calendar.publish']={allowed:false,reason:{code:'dynamic_binding_unavailable'}}
    const sections={overview:['website.site.read'],pages:['website.pages.read'],blog:['website.pages.read'],catalog:['catalog.products.read'],forms:['website.forms.read'],appearance:['website.theme.read'],publishing:['website.pages.read'],domains:['website.site.read'],import:['website.dist.upload'],settings:['website.site.update'],advanced:['website.site.update'],payments:['website.site.update']}
    const sectionCapabilities=Object.fromEntries(Object.entries(sections).map(([key,required])=>{
      const missing=required.find(p=>!a.access.can(p));return [key,missing?{allowed:false,reason:{code:'permission_denied',requiredPermission:missing}}:{allowed:true}]
    }))
    return {capabilities:result,effectivePermissions,sectionCapabilities}
  }
  function document(value,manifest) {
    const normalized=normalizeWebsiteDocument(value)
    // Reverse immutable image URLs to their stable file identity for comparison.
    const bindings=new Map((manifest?.dynamic??[]).filter(d=>d.kind==='file').map(d=>[d.hash,d.fileId]))
    const walk=v=>Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):typeof v==='string'&&v.startsWith('/public/website/releases/')&&bindings.has(v.split('/').at(-1))?'file:'+bindings.get(v.split('/').at(-1)):v
    const result=walk(normalized)
    if(result&&typeof result==='object')delete result.updatedAt
    return result
  }
  function pageProjection(row,manifest,published=false) {
    const meta=published?row:row.draftMetadata??row
    return {document:document(published?row.document:row.draftBuilderData,manifest),seo:published?row.seo??{}:row.draftSeo??row.seo??{},title:meta.title,slug:meta.slug,path:published?row.path:meta.routePath,visibility:meta.visibility}
  }
  async function state(a) {
    await owned(a)
    return prisma.$transaction(async db=>{
      const site=await owned(a,db)
      const release=site.activeReleaseId?await db.websiteRelease.findFirst({where:{id:site.activeReleaseId,companyId:a.companyId,siteId:a.siteId}}):null
      const manifest=release&&releaseDTO(release).integrityMode==='sealed'?release.manifest:null
      const rows=await db.websitePage.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
      const pages=rows.map(row=>{
        const published=manifest?.routes?.find(r=>r.sourceKind==='page'&&r.sourceId===row.id)
        let changed=true,documentHash=null
        try{const draft=pageProjection(row,manifest);documentHash=hash(draft.document);changed=!published||hash(draft)!==hash(pageProjection(published,manifest,true))}catch{/* Invalid historical drafts stay visible as changed, without repair. */}
        return {id:row.id,revision:row.revision,hasUnpublishedChanges:changed,publicState:published?(changed?'changed':'published'):'unpublished',publicReleaseId:published?release.id:null,documentHash}
      })
      const identity=site.draftIdentity??site
      const theme=identity.themeId?await db.websiteTheme.findFirst({where:{id:identity.themeId,companyId:a.companyId,siteId:a.siteId,enabled:true}}):null
      const menus=await db.websiteMenu.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
      const items=await db.websiteMenuItem.findMany({where:{companyId:a.companyId,menuId:{in:menus.map(m=>m.id)},enabled:true},orderBy:{sortOrder:'asc'}})
      const themeProjection=theme?{tokens:theme.tokens,typography:theme.typography,layout:theme.layout,customCss:theme.customCss}:null
      const menuProjection=menus.map(m=>({id:m.id,name:m.name,location:m.location,items:items.filter(i=>i.menuId===m.id).map(i=>({id:i.id,label:i.label,url:i.url,pageId:i.pageId,parentId:i.parentId,target:i.target,sortOrder:i.sortOrder}))})).sort((a,b)=>a.id.localeCompare(b.id))
      const identityProjection={name:identity.name,siteType:identity.siteType,settings:identity.settings??{},seoDefaults:identity.seoDefaults??{}}
      const posts=await db.websiteBlogPost.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
      const changedPosts=posts.some(p=>{const r=manifest?.routes?.find(r=>r.sourceKind==='blog'&&r.sourceId===p.id);try{return !r||hash({document:document(p.draftBuilderData,manifest),seo:p.draftSeo??p.seo??{},title:p.title,slug:p.slug})!==hash({document:document(r.document,manifest),seo:r.seo??{},title:r.title,slug:r.slug})}catch{return true}})
      const missingPosts=manifest?.routes?.some(r=>r.sourceKind==='blog'&&!posts.some(p=>p.id===r.sourceId))??false
      let changedFiles=false
      for(const ref of manifest?.dynamic??[])if(ref.kind==='file'){
        const current=await db.fileAsset.findFirst({where:{id:ref.fileId,enabled:true,entityId:{in:[a.companyId,a.siteId]}}})
        if(!current){changedFiles=true;continue}
        const checksum=current.checksum?.replace(/^sha256:/i,'').toLowerCase()
        if(checksum&&/^[0-9a-f]{64}$/.test(checksum)){if(checksum!==ref.hash)changedFiles=true;continue}
        if(ref.contentRevision!==undefined&&current.contentRevision===ref.contentRevision)continue
        if(!readFile)throw new WebsiteServiceError('No se pudo verificar el archivo.',503,'dependency_unavailable')
        if(current.sizeBytes>8*1024*1024)throw new WebsiteServiceError('No se pudo verificar el archivo.',503,'dependency_unavailable')
        let bytes
        try{bytes=await readFile(current)}catch{throw new WebsiteServiceError('No se pudo verificar el archivo.',503,'dependency_unavailable')}
        if(bytes.length>8*1024*1024)throw new WebsiteServiceError('No se pudo verificar el archivo.',503,'dependency_unavailable')
        if(releaseBytesHash(bytes)!==ref.hash)changedFiles=true
      }
      const publicIdentity={...manifest?.identity};delete publicIdentity.analyticsMode;delete publicIdentity.turnstileSiteKey
      const changedGlobals=!manifest||hash(identityProjection)!==hash(publicIdentity)||hash(themeProjection)!==hash(manifest.theme)||hash(menuProjection)!==hash([...(manifest.menus??[])].sort((a,b)=>a.id.localeCompare(b.id)))
      const missingPublished=manifest?.routes?.some(r=>r.sourceKind==='page'&&!rows.some(p=>p.id===r.sourceId))??false
      return {id:site.id,companyId:a.companyId,draftRevision:site.draftRevision,publicationRevision:site.publicationRevision,activeReleaseId:site.activeReleaseId,lifecycle:site.lifecycle,
        hasUnpublishedChanges:manifest?.kind==='dist'?false:changedGlobals||changedPosts||missingPosts||changedFiles||missingPublished||pages.some(p=>p.hasUnpublishedChanges),pages:a.access.can('website.pages.read')?pages:[],...capabilities(a,site)}
    },{isolationLevel:'RepeatableRead',timeout:30000})
  }
  function releaseDTO(row) {
    const sealed=row.state==='ready'&&row.manifest?.integrityMode==='sealed'&&hash(row.manifest)===row.manifestHash
    return {...row,integrityMode:sealed?'sealed':'unknown',integrityWarnings:sealed?[]:[{code:row.state==='ready'?'integrity_unverified':'release_not_ready'}]}
  }
  async function integrity(a) {
    const site=await owned(a)
    if(!site.releaseManaged)return {releaseId:null,integrityMode:'legacy-reference',integrityWarnings:[{code:'historical_references_unverified'}]}
    const row=site.activeReleaseId?await prisma.websiteRelease.findFirst({where:{id:site.activeReleaseId,companyId:a.companyId,siteId:a.siteId}}):null
    return row?{releaseId:row.id,integrityMode:releaseDTO(row).integrityMode,integrityWarnings:releaseDTO(row).integrityWarnings}:{releaseId:null,integrityMode:'unknown',integrityWarnings:[{code:'no_active_release'}]}
  }
  async function form(a) {
    await owned(a)
    assertWebsiteAccess(a.access,a.companyId,'website.forms.read')
    const result=await scopes.publishability(a)
    if(!a.access.can('website.pages.read'))return result
    const pages=await prisma.websitePage.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
    result.usedBy=pages.flatMap(p=>{try{return Object.values(normalizeWebsiteDocument(p.draftBuilderData).blocks??{}).filter(b=>b.props?.formId===a.formId).map(b=>({pageId:p.id,blockId:b.id}))}catch{return []}})
    const posts=await prisma.websiteBlogPost.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
    result.usedBy.push(...posts.flatMap(p=>{try{return Object.values(normalizeWebsiteDocument(p.draftBuilderData).blocks??{}).filter(b=>b.props?.formId===a.formId).map(b=>({pageId:null,blogPostId:p.id,blockId:b.id}))}catch{return []}}))
    return result
  }
  return {state,integrity,releaseDTO,form}
}
