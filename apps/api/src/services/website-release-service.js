import {createWebsiteAdminContractService} from './website-admin-contract-service.js'
import { WebsiteServiceError,notFound } from '../routes/website/service-helpers.js'
import { assertWebsiteAccess } from './website-authorization-service.js'
import { createWebsiteDraftService,normalizeWebsiteDocument,websiteDocumentHash as hash } from './website-draft-service.js'
import {createWebsiteFormScopeService} from './website-form-scope-service.js'
import {conformTemplateDocument} from './website-template-conform.js'
import {isEffectProp,isValidEffect} from './website-block-effects.js'
import { BLOCK_CATALOG } from '../routes/website/page-document.js'
import { releaseBytesHash } from './website-release-storage.js'
import { createFileAccess } from './files/access.js'
import { z } from 'zod'

const failure=(code,status=409)=>new WebsiteServiceError('No se pudo completar la publicación.',status,code)
const known=new Set(BLOCK_CATALOG.blocks.map(b=>b.type))
const definitions=new Map(BLOCK_CATALOG.blocks.map(b=>[b.type,b]))
const changesSchema=z.object({publishPageIds:z.array(z.string().uuid()).max(100),publishPostIds:z.array(z.string().uuid()).max(100).default([]),unpublishPageIds:z.array(z.string().uuid()).max(100).default([]),unpublishPostIds:z.array(z.string().uuid()).max(100).default([]),includeThemeAndMenus:z.boolean().default(true)}).strict()
const revision=value=>{
  if(typeof value==='string'&&!/^\d+$/.test(value))throw failure('validation_failed',422)
  if(!['string','number'].includes(typeof value)||!Number.isSafeInteger(Number(value))||Number(value)<0)throw failure('validation_failed',422)
  return Number(value)
}
export function websiteReleasePath(path) {
  if(typeof path!=='string'||Buffer.byteLength(path)>512||!path.startsWith('/')||/[\\%?#\x00-\x20]/.test(path)||path.includes('//')||path.split('/').length>33||path.split('/').some(p=>p==='.'||p==='..')||/^\/(?:app|api|public|auth|p|mcp|__runly|\.well-known)(?:\/|$)/i.test(path)) throw failure('route_conflict',422)
  return path
}
export function createWebsiteReleaseService({prisma,storage,runtime,readFile,afterPrepare=async()=>{},beforeCommit=async()=>{},imports,isolation}) {
  const contractDTO=createWebsiteAdminContractService({prisma,isolation})
  const drafts=createWebsiteDraftService({prisma}), files=createFileAccess({prisma})
  const legacyCalls=new WeakSet(), previewCalls=new WeakSet(), readOnlyCalls=new WeakSet(), formScopes=createWebsiteFormScopeService({prisma})
  function authorize(a,permission='website.pages.publish') {
    assertWebsiteAccess(a.access,a.companyId,permission)
    if(!a.siteId)throw notFound('Recurso')
    return {...a,actorId:a.access.actorId}
  }
  async function site(tx,a) {
    const row=await tx.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}})
    if(!row)throw notFound('Recurso');return row
  }
  function key(a) { if(typeof a.idempotencyKey!=='string'||a.idempotencyKey.length<16||a.idempotencyKey.length>200)throw failure('validation_failed',422) }
  async function release(tx,a,id) {
    if(!id)throw notFound('Recurso')
    const row=await tx.websiteRelease.findFirst({where:{id,companyId:a.companyId,siteId:a.siteId}})
    if(!row)throw notFound('Recurso');return row
  }
  function verify(row) {
    if(row.state!=='ready'||!row.manifest||hash(row.manifest)!==row.manifestHash)throw failure('release_not_ready')
  }
  async function storeObject(a,bytes,mime,sharedRuntime=false) {
    if(!storage)throw failure('dependency_unavailable',503)
    const digest=releaseBytesHash(bytes), objectKey=sharedRuntime?`runtime/${digest}`:`company/${a.companyId}/site/${a.siteId}/objects/${digest}`
    if(a.readOnly)return {hash:digest,objectKey,size:bytes.length,mime}
    await storage.put(objectKey,bytes,mime)
    const check=await storage.get(objectKey)
    if(check.length!==bytes.length||releaseBytesHash(check)!==digest)throw failure('integrity_failed',422)
    return {hash:digest,objectKey,size:bytes.length,mime}
  }
  async function preparePreview(input) {
    const request={...input};previewCalls.add(request);return prepare(request)
  }
  async function prepareDist(input) {
    const a=authorize(input,previewCalls.has(input)?'website.pages.update':'website.pages.publish');assertWebsiteAccess(a.access,a.companyId,'website.site.read');assertWebsiteAccess(a.access,a.companyId,'website.dist.upload');key(a)
    a.expectedDraftRevision=revision(a.expectedDraftRevision);a.expectedPublicationRevision=revision(a.expectedPublicationRevision)
    if(!imports)throw failure('dependency_unavailable',503)
    const imported=await imports.get({...a,importId:a.importId});if(imported.phase!=='ready')throw failure('import_not_ready')
    const manifest={schemaVersion:1,kind:'dist',integrityMode:'sealed',previewOnly:previewCalls.has(input),companyId:a.companyId,siteId:a.siteId,importId:imported.id,routingMode:imported.manifest.routingMode,files:imported.manifest.files,routes:[],assets:Object.fromEntries(imported.manifest.files.map(f=>[f.hash,f])),runtime:{assets:{}},identity:{},theme:null,menus:[],dynamic:[]}
    for(const ref of Object.values(manifest.assets)){const bytes=await storage.get(ref.objectKey);if(bytes.length!==ref.size||releaseBytesHash(bytes)!==ref.hash)throw failure('integrity_failed',422)}
    return prisma.$transaction(async tx=>{
      await drafts.lockSite(tx,a.companyId,a.siteId)
      const current=await site(tx,a)
      return drafts.receipt(tx,a,`release.dist:${a.siteId}`,{importId:imported.id,expectedDraftRevision:a.expectedDraftRevision,expectedPublicationRevision:a.expectedPublicationRevision,baseReleaseId:a.baseReleaseId??null,previewOnly:manifest.previewOnly},async()=>{
        if(current.draftRevision!==a.expectedDraftRevision)throw failure('draft_changed')
        if(current.publicationRevision!==a.expectedPublicationRevision||current.activeReleaseId!==(a.baseReleaseId??null))throw failure('publication_conflict')
        return tx.websiteRelease.create({data:{companyId:a.companyId,siteId:a.siteId,actorId:a.actorId,baseReleaseId:current.activeReleaseId,draftRevision:current.draftRevision,publicationRevision:current.publicationRevision,state:'ready',manifest,manifestHash:hash(manifest)}})
      })
    })
  }
  async function prepare(input) {
    if(input?.kind==='dist')return prepareDist(input)
    for(let attempt=0;attempt<3;attempt++) {
      try{return await prepareAttempt(input)}catch(e){if(!['P2002','P2034'].includes(e.code)||attempt===2)throw e}
    }
  }
  async function prepareAttempt(input) {
    const a={...authorize(input,previewCalls.has(input)?'website.pages.update':'website.pages.publish'),readOnly:readOnlyCalls.has(input)};if(!legacyCalls.has(input))assertWebsiteAccess(a.access,a.companyId,'website.site.read');key(a)
    a.expectedDraftRevision=revision(a.expectedDraftRevision);a.expectedPublicationRevision=revision(a.expectedPublicationRevision)
    const parsed=changesSchema.safeParse(a.changes);if(!parsed.success)throw failure('validation_failed',422);a.changes=parsed.data
    // Preserve the canonical receipt hash of requests made before this field existed.
    if(!a.changes.unpublishPostIds.length)delete a.changes.unpublishPostIds
    if(a.changes.publishPostIds.some(id=>a.changes.unpublishPostIds?.includes(id)))throw failure('scope_conflict',422)
    if(a.changes.publishPageIds.some(id=>a.changes.unpublishPageIds.includes(id)))throw failure('scope_conflict',422)
    if(a.kind && a.kind!=='builder')throw failure('isolation_required')
    if(!Array.isArray(a.changes?.publishPageIds)||(!a.changes.publishPageIds.length&&!a.changes.publishPostIds?.length&&!a.changes.unpublishPageIds?.length&&!a.changes.unpublishPostIds?.length)||a.changes.publishPageIds.length>100)throw failure('validation_failed',422)
    // Capture with MVCC rather than locks: old SQL writers use page -> site.
    // Activation verifies the captured aggregate revision and manifest base.
    const captured=await prisma.$transaction(async tx=>{
      const current=await site(tx,a)
      if(!a.readOnly)await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${a.companyId}:${a.actorId}:${a.idempotencyKey}`}::text,1))::text`
      const capture=async()=>{
        if(current.draftRevision!==Number(a.expectedDraftRevision))throw failure('draft_changed')
        if(current.publicationRevision!==Number(a.expectedPublicationRevision)||current.activeReleaseId!==(a.baseReleaseId??null))throw failure('publication_conflict')
        const base=current.activeReleaseId?await release(tx,a,current.activeReleaseId):null
        if(base)verify(base)
        const pages=await tx.websitePage.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
        const posts=await tx.websiteBlogPost.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
        const identity={...(current.draftIdentity??current),analyticsMode:current.analyticsMode,turnstileSiteKey:current.turnstileSiteKey}
        const theme=identity.themeId?await tx.websiteTheme.findFirst({where:{id:identity.themeId,companyId:a.companyId,siteId:a.siteId,enabled:true}}):null
        if(identity.themeId&&!theme)throw notFound('Recurso')
        const menus=await tx.websiteMenu.findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true}})
        const items=await tx.websiteMenuItem.findMany({where:{companyId:a.companyId,menuId:{in:menus.map(m=>m.id)},enabled:true},orderBy:{sortOrder:'asc'}})
        if(pages.length>1000||items.length>5000||Buffer.byteLength(JSON.stringify({pages,posts,theme,menus,items}))>16*1024*1024)throw failure('snapshot_too_large',422)
        const pending=a.readOnly?{id:current.activeReleaseId??'00000000-0000-0000-0000-000000000000'}:await tx.websiteRelease.create({data:{companyId:a.companyId,siteId:a.siteId,baseReleaseId:current.activeReleaseId,draftRevision:current.draftRevision,publicationRevision:current.publicationRevision,actorId:a.actorId}})
        // Capture is persisted in the receipt so a crash cannot select new drafts.
        return {releaseId:pending.id,current,base:base?.manifest??null,pages,posts,theme,menus,items,identity}
      };
      return a.readOnly?capture():drafts.receipt(tx,a,`release.prepare:${a.siteId}`,{...a,readOnly:undefined,access:undefined,actorId:undefined,idempotencyKey:undefined},capture)
    },{isolationLevel:'RepeatableRead'})
    const existing=a.readOnly?{id:captured.releaseId,state:'preparing'}:await release(prisma,a,captured.releaseId)
    if(existing.state!=='preparing')return existing
    try {
      const issues=[];let location={}
      const issue=e=>({severity:'blocking',code:e.code??'dependency_unavailable',...location,resource:e.publicationResource??(location.blockType==='BookingFormBlock'?{kind:'calendar',id:null}:null),remediation:[{action:e.code==='form_scope_unresolved'||e.code==='ambiguous_site_identifier'?'resolve_owner':e.code==='dynamic_binding_unavailable'?'wait':'replace_resource'},{action:'exclude_page'}]})
      const selected=new Set(a.changes.publishPageIds), removed=new Set(a.changes.unpublishPageIds??[]), removedPosts=new Set(a.changes.unpublishPostIds??[])
      if([...removedPosts].some(id=>!captured.posts.some(p=>p.id===id)&&!captured.base?.routes.some(r=>r.sourceKind==='blog'&&r.sourceId===id)))throw notFound('Recurso')
      if([...removed].some(id=>selected.has(id)))throw failure('validation_failed',422)
      if([...removed].some(id=>!captured.pages.some(p=>p.id===id)&&!captured.base?.routes.some(r=>r.sourceId===id)))throw notFound('Recurso')
      let routes=structuredClone(captured.base?.routes)??captured.pages.filter(p=>p.status==='published'&&p.visibility==='public'&&!selected.has(p.id)).map(p=>({path:p.routePath,sourceKind:'page',sourceId:p.id,document:p.publishedBuilderData,seo:p.seo??{},title:p.title,slug:p.slug,visibility:p.visibility}))
      routes=routes.filter(r=>!(r.sourceKind==='page'&&(selected.has(r.sourceId)||removed.has(r.sourceId)||!captured.pages.some(p=>p.id===r.sourceId)))&&!(r.sourceKind==='blog'&&removedPosts.has(r.sourceId)))
      for(const id of selected) {
        const p=captured.pages.find(p=>p.id===id);if(!p)throw notFound('Recurso')
        const meta=p.draftMetadata??p
        if(meta.visibility!=='public')throw failure('page_not_public',422)
        routes.push({path:meta.routePath,sourceKind:'page',sourceId:p.id,revision:p.revision,document:normalizeWebsiteDocument(p.draftBuilderData,{strict:true}),seo:p.draftSeo??p.seo??{},title:meta.title,slug:meta.slug,visibility:meta.visibility})
      }
      for(const p of captured.posts.filter(p=>!removedPosts.has(p.id)&&((a.changes.publishPostIds??[]).includes(p.id)||(!captured.base&&p.status==='published')))) {
        routes=routes.filter(r=>r.sourceId!==p.id)
        const chosen=(a.changes.publishPostIds??[]).includes(p.id)
        routes.push({path:`/blog/${p.slug}`,sourceKind:'blog',sourceId:p.id,document:chosen?p.draftBuilderData:p.publishedBuilderData,seo:chosen?(p.draftSeo??p.seo??{}):(p.seo??{}),title:p.title,slug:p.slug,visibility:'public'})
      }
      if((a.changes.publishPostIds??[]).some(id=>!captured.posts.some(p=>p.id===id)))throw notFound('Recurso')
      // A source switch must not relabel executable ZIP assets as trusted builder
      // resources. Historical ZIP aliases retain their isolated-origin gate.
      const paths=new Set(), assets={...(captured.base?.kind==='builder'?captured.base.assets:{})}, dynamic=[]
      async function visit(value,field='') {
        if(Array.isArray(value))return Promise.all(value.map(v=>visit(v,field)))
        if(value&&typeof value==='object') {
          const result={};for(const [k,v]of Object.entries(value))result[k]=await visit(v,k);return result
        }
        if(typeof value!=='string')return value
        if(/<\s*\/?\s*(?:script|iframe|object|embed|style|link|meta|form|base|svg|math)\b|\bon[a-z]+\s*=/i.test(value)||/javascript:|vbscript:|data:text\/html|expression\(/i.test(value.replace(/[\x00-\x20]/g,'')))throw failure('unsafe_content',422)
        if(field==='siteId'&&value&&value!==a.siteId)throw notFound('Recurso')
        if(field==='calendarId'&&value)throw failure('dynamic_binding_unavailable',422)
        if((/^(?:fileId|imageFileId|logoFileId|coverAssetId)$/i.test(field)||(/image|src|poster|avatar|logo/i.test(field)&&value.startsWith('file:')))&&value) {
          const fileId=value.startsWith('file:')?value.slice(5):value
          const file=await prisma.fileAsset.findFirst({where:{id:fileId,entityId:{in:[a.companyId,a.siteId]},enabled:true}})
          if(!file)throw notFound('Recurso')
          try{await files.assertAccess(file,{profileId:a.actorId,admin:a.access.isAdmin})}catch{throw notFound('Recurso')}
          if(file.visibility!=='PUBLIC'&&file.uploadedById!==a.actorId&&!a.access.isAdmin)throw failure('asset_not_publishable',422)
          if(!readFile||!/^image\/(?:png|jpeg|webp|gif|avif)$/.test(file.mimeType??''))throw failure('asset_not_publishable',422)
          const bytes=await readFile(file);if(bytes.length>8*1024*1024)throw failure('asset_too_large',422)
          const latest=await prisma.fileAsset.findFirst({where:{id:file.id,entityId:file.entityId,enabled:true}})
          if(!latest||latest.contentRevision!==file.contentRevision||latest.objectKey!==file.objectKey||latest.checksum!==file.checksum)throw failure('asset_changed')
          if(file.checksum&&(!/^(?:sha256:)?[0-9a-f]{64}$/i.test(file.checksum)||file.checksum.replace(/^sha256:/i,'').toLowerCase()!==releaseBytesHash(bytes)))throw failure('asset_checksum_mismatch',422)
          const valid=(file.mimeType==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
            (file.mimeType==='image/jpeg'&&bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) ||
            (file.mimeType==='image/gif'&&bytes.subarray(0,4).toString()==='GIF8') ||
            (file.mimeType==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP') ||
            (file.mimeType==='image/avif'&&bytes.subarray(4,12).toString()==='ftypavif')
          if(!valid)throw failure('asset_type_mismatch',422)
          const ref=await storeObject(a,bytes,file.mimeType);assets[ref.hash]=ref
          // IDs remain stable, URLs are explicit immutable bindings.
          dynamic.push({kind:'file',fileId,hash:ref.hash,contentRevision:file.contentRevision});return value.startsWith('file:')?`/public/website/releases/${existing.id}/assets/${ref.hash}`:value
        }
        if(field==='formId'&&value) {
          const status=await formScopes.publishability({companyId:a.companyId,siteId:a.siteId,formId:value})
          if(status.state!=='publishable')throw Object.assign(failure(status.reason?.code??'form_scope_unresolved',422),{publicationResource:{kind:'form',id:status.state==='not_found'?null:value}})
          const state=await formScopes.inspect({companyId:a.companyId,formId:value})
          dynamic.push({kind:'form',formId:value,ownerKind:'website',websiteSiteId:a.siteId,analyticsPropertyId:state.scope.analyticsPropertyId});return value
        }
        if(field==='productId'&&value) {
          const selector=/^[0-9a-f-]{36}$/i.test(value)?{id:value}:{slug:value}
          const [product]=await prisma.$queryRaw`SELECT id FROM catalog_product WHERE company_id=${a.companyId}::uuid AND enabled=true AND published=true AND (id::text=${selector.id??''} OR slug=${selector.slug??''})`
          if(!product)throw notFound('Recurso');dynamic.push({kind:'catalog',productId:product.id});return value
        }
        if(/^(?:javascript|vbscript|data):/i.test(value)&&/url|href|link/i.test(field))throw failure('unsafe_link',422)
        if(value.startsWith('/public/website/releases/')&&Object.keys(assets).some(h=>value.endsWith('/'+h)))return value
        if((/image|src|poster|avatar|logo|background.*url/i.test(field)&&/^(?:https?:|\/|data:)/i.test(value))||/@import|url\s*\(|<(?:img|script|iframe|video|audio|source|link)\b/i.test(value))throw failure('asset_requires_pinning',422)
        return value
      }
      for(const r of routes) {
        location={pageId:r.sourceId,blockId:null,blockType:null}
        try {
          if(r.visibility!=='public')throw failure('page_not_public',422)
          websiteReleasePath(r.path);if(paths.has(r.path))throw failure('route_conflict',422);paths.add(r.path)
          r.document=conformTemplateDocument(normalizeWebsiteDocument(r.document,{strict:true})) /* sealed copy only: the draft is never rewritten */
          for(const block of Object.values(r.document.blocks)) {
            location={pageId:r.sourceId,blockId:block.id,blockType:block.type}
            try {
              const definition=definitions.get(block.type)
              if(!definition)throw failure('unknown_block_type',422)
              // BookingFormBlock has no executable public booking contract, even with an empty ID.
              if(block.type==='ContactFormBlock'&&!block.props?.formId)throw failure('form_not_found',422)
              if(block.type==='BookingFormBlock')throw failure('dynamic_binding_unavailable',422)
              for(const [name,value]of Object.entries(block.props??{})) {
                const field=definition.fields[name]
                if(isEffectProp(name)){if(!isValidEffect(name,value))throw failure('invalid_block_property',422);continue}
                if(!field)throw failure('unknown_block_property',422)
                if(value==null||JSON.stringify(value)===JSON.stringify(definition.defaultProps?.[name]))continue
                if((['text','textarea','link','image','color'].includes(field.type)&&typeof value!=='string')||
                  (field.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)))||
                  (field.type==='toggle'&&typeof value!=='boolean')||
                  (field.type==='select'&&!field.options?.includes(value)))throw failure('invalid_block_property',422)
              }
              block.props=await visit(block.props)
            }catch(e){if(!a.readOnly)throw e;issues.push(issue(e))}
          }
          location={pageId:r.sourceId,blockId:null,blockType:null}
          const {blocks,...metadata}=r.document;r.document={...await visit(metadata),blocks}
          r.seo=await visit(r.seo);r.documentHash=hash(r.document)
        }catch(e){if(!a.readOnly)throw e;issues.push(issue(e))}
      }
      location={pageId:null,blockId:null,blockType:null}
      const include=a.changes.includeThemeAndMenus!==false
      if(!captured.base&&!include)throw failure('theme_snapshot_required',422)
      const sourceMenus=include?captured.menus.map(m=>({id:m.id,name:m.name,location:m.location,items:captured.items.filter(i=>i.menuId===m.id).map(i=>({id:i.id,label:i.label,url:i.url,pageId:i.pageId,parentId:i.parentId,target:i.target,sortOrder:i.sortOrder}))})):captured.base.menus
      // Links to pages left out of this version (unpublished, private, deleted) leave its menus with their children.
      const menus=sourceMenus.map(m=>{
        const out=new Set(m.items.filter(i=>(i.pageId&&!routes.some(r=>r.sourceId===i.pageId))||(i.url?.startsWith('/')&&!routes.some(r=>r.path===i.url))).map(i=>i.id))
        for(let grew=true;grew;){grew=false;for(const i of m.items)if(i.parentId&&out.has(i.parentId)&&!out.has(i.id)){out.add(i.id);grew=true}}
        return out.size?{...m,items:m.items.filter(i=>!out.has(i.id))}:m
      })
      for(const m of menus)for(const i of m.items) {
        let parent=i.parentId;const seen=new Set([i.id])
        while(parent){if(seen.has(parent))throw failure('menu_reference_invalid',422);seen.add(parent);parent=m.items.find(other=>other.id===parent)?.parentId}
        if(i.pageId&&!routes.some(r=>r.sourceId===i.pageId))throw failure('menu_reference_invalid',422)
        if(i.parentId&&!m.items.some(other=>other.id===i.parentId))throw failure('menu_reference_invalid',422)
        if(i.url?.startsWith('/')&&!routes.some(r=>r.path===i.url))throw failure('menu_reference_invalid',422)
        if(i.url&&!/^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(i.url))throw failure('unsafe_link',422)
      }
      if(!runtime)throw failure('runtime_unavailable',503)
      const runtimeFiles=await runtime()
      if(!runtimeFiles['entry.js']?.bytes?.length)throw failure('runtime_unavailable',503)
      const runtimeAssets={};for(const [name,file]of Object.entries(runtimeFiles)) {
        if(!['entry.js','style.css'].includes(name)||file.mime!==(name==='entry.js'?'text/javascript':'text/css'))throw failure('runtime_unavailable',503)
        runtimeAssets[name]=await storeObject(a,file.bytes,file.mime,true)
      }
      const identity=captured.identity
      const publicSettings=new Set(['logoFileId','faviconFileId','businessName','address','contactEmail','contactPhone','whatsapp','socialLinks','brandColor'])
      if(Object.keys(identity.settings??{}).some(k=>!publicSettings.has(k)))throw failure('settings_not_publishable',422)
      const manifest={schemaVersion:1,kind:'builder',previewOnly:previewCalls.has(input),integrityMode:'sealed',companyId:a.companyId,siteId:a.siteId,routes,assets,dynamic,
        identity:await visit({name:identity.name,siteType:identity.siteType,settings:identity.settings??{},seoDefaults:identity.seoDefaults??{}}),
        theme:include?await visit(captured.theme?{tokens:captured.theme.tokens,typography:captured.theme.typography,layout:captured.theme.layout,customCss:captured.theme.customCss}:null):captured.base.theme,
        menus,runtime:{rendererVersion:runtimeFiles['entry.js'].rendererVersion??'0.2.0',blockRegistryVersion:'runly-s3',assets:runtimeAssets}}
      if(a.readOnly)return {canPublish:issues.length===0,issues,expectedDraftRevision:captured.current.draftRevision,expectedPublicationRevision:captured.current.publicationRevision,baseReleaseId:captured.current.activeReleaseId}
      await afterPrepare(manifest)
      return await prisma.websiteRelease.update({where:{id:existing.id,state:'preparing'},data:{state:'ready',manifest,manifestHash:hash(manifest)}})
    } catch(e) {
      if(a.readOnly)return {canPublish:false,issues:[{severity:'blocking',code:e.code??'dependency_unavailable',pageId:null,blockId:null,blockType:null,resource:null,remediation:[{action:'wait'}]}]}
      if(e.code==='P2025') {
        const ready=await release(prisma,a,captured.releaseId)
        if(ready.state==='ready') {verify(ready);return ready}
      }
      await prisma.websiteRelease.updateMany({where:{id:existing.id,state:'preparing'},data:{state:'failed',failureCode:e.code??'preparation_failed'}})
      throw e instanceof WebsiteServiceError?e:failure('preparation_failed',503)
    }
  }
  async function preflight(input) {
    assertWebsiteAccess(input.access,input.companyId,'website.pages.publish')
    assertWebsiteAccess(input.access,input.companyId,'website.site.read')
    const current=await site(prisma,input)
    if(input.kind==='dist'){
      assertWebsiteAccess(input.access,input.companyId,'website.dist.upload')
      const issues=[]
      try{
        if(input.expectedDraftRevision!==undefined&&revision(input.expectedDraftRevision)!==current.draftRevision)throw failure('draft_changed')
        if(input.expectedPublicationRevision!==undefined&&revision(input.expectedPublicationRevision)!==current.publicationRevision||input.baseReleaseId!==undefined&&input.baseReleaseId!==current.activeReleaseId)throw failure('publication_conflict')
        const imported=await imports.get({...input,importId:input.importId})
        if(imported.phase!=='ready')throw failure('import_not_ready')
        const hosts=await prisma.websiteDomain.findMany({where:{companyId:input.companyId,siteId:input.siteId,state:'assigned',ready:true}})
        if(!hosts.length||!isolation)throw failure('isolation_required')
        for(const host of hosts)isolation.publicHost(host.hostname)
        for(const file of imported.manifest.files){
          const bytes=await storage.get(file.objectKey)
          if(bytes.length!==file.size||releaseBytesHash(bytes)!==file.hash)throw failure('integrity_failed',503)
          if(file.mime!=='text/html'){
            const bound=await prisma.websitePublicAssetBinding.findFirst({where:{companyId:input.companyId,siteId:input.siteId,path:file.path}})
            if(bound&&bound.hash!==file.hash)throw failure('asset_path_conflict',422)
          }
        }
      }catch(e){issues.push({severity:'blocking',code:e.code??'dependency_unavailable',pageId:null,blockId:null,blockType:null,resource:{kind:'asset',id:null},remediation:[{action:'wait'}]})}
      return {canPublish:issues.length===0,issues,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:current.publicationRevision,baseReleaseId:current.activeReleaseId}
    }
    if(input.kind&&input.kind!=='builder')throw failure('validation_failed',422)
    const request={...input,kind:'builder',idempotencyKey:'read-only-preflight',expectedDraftRevision:input.expectedDraftRevision??current.draftRevision,expectedPublicationRevision:input.expectedPublicationRevision??current.publicationRevision,baseReleaseId:input.baseReleaseId===undefined?current.activeReleaseId:input.baseReleaseId}
    readOnlyCalls.add(request)
    return prepare(request)
  }
  async function change(input,action='activate') {
    const a=authorize(input);key(a)
    a.expectedPublicationRevision=revision(a.expectedPublicationRevision)
    if(action==='activate') {
      a.expectedDraftRevision=revision(a.expectedDraftRevision)
      if(!/^[0-9a-f]{64}$/.test(a.manifestHash??''))throw failure('validation_failed',422)
    }
    if(action!=='unpublish') {
      const candidate=await release(prisma,a,a.releaseId);verify(candidate)
      if(candidate.manifest.previewOnly)throw failure('preview_not_publishable')
      if(candidate.manifest.kind==='dist'){assertWebsiteAccess(a.access,a.companyId,'website.dist.upload');const domains=await prisma.websiteDomain.findMany({where:{companyId:a.companyId,siteId:a.siteId,state:'assigned',ready:true}});if(!domains.length||!isolation)throw failure('isolation_required');for(const domain of domains)isolation.publicHost(domain.hostname)}
      for(const ref of [...Object.values(candidate.manifest.assets),...Object.values(candidate.manifest.runtime.assets)]) {
        const bytes=await storage.get(ref.objectKey);if(releaseBytesHash(bytes)!==ref.hash)throw failure('integrity_failed',422)
      }
    }
    return prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM website_page WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid ORDER BY id FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM website_blog_post WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid ORDER BY id FOR UPDATE`
      await drafts.lockSite(tx,a.companyId,a.siteId)
      const current=await site(tx,a)
      const result=await drafts.receipt(tx,a,`publication.${action}:${a.siteId}`,{releaseId:a.releaseId,expectedPublicationRevision:a.expectedPublicationRevision,expectedDraftRevision:a.expectedDraftRevision,manifestHash:a.manifestHash},async()=>{
        if(current.publicationRevision!==Number(a.expectedPublicationRevision))throw failure('publication_conflict')
        let target=null
        if(action!=='unpublish') {
          target=await release(tx,a,a.releaseId);verify(target)
          for(const ref of target.manifest.dynamic??[])if(ref.kind==='form'){
            await tx.$queryRaw`SELECT id FROM website_form WHERE id=${ref.formId}::uuid AND company_id=${a.companyId}::uuid FOR SHARE`
            const status=await formScopes.publishability({companyId:a.companyId,siteId:a.siteId,formId:ref.formId,db:tx})
            if(status.state!=='publishable')throw failure(status.reason?.code??'form_scope_unresolved',422)
          }
          if(current.sourceType!==target.manifest.kind)assertWebsiteAccess(a.access,a.companyId,'website.site.update')
          if(target.manifest.kind==='dist')for(const file of target.manifest.files.filter(f=>f.mime!=='text/html')){
            const prior=await tx.websitePublicAssetBinding.findUnique({where:{siteId_path:{siteId:a.siteId,path:file.path}}})
            if(prior&&prior.hash!==file.hash)throw failure('asset_path_conflict',422)
            if(!prior)await tx.websitePublicAssetBinding.create({data:{companyId:a.companyId,siteId:a.siteId,path:file.path,hash:file.hash,releaseId:target.id}})
          }
          if(action==='activate'&&(current.draftRevision!==Number(a.expectedDraftRevision)||target.draftRevision!==current.draftRevision))throw failure('draft_changed')
          if(action==='activate'&&(target.baseReleaseId!==current.activeReleaseId||target.publicationRevision!==current.publicationRevision))throw failure('publication_conflict')
          if(a.manifestHash&&target.manifestHash!==a.manifestHash)throw failure('integrity_failed',422)
          if(action==='rollback'&&!await tx.websitePublicationEvent.findFirst({where:{companyId:a.companyId,siteId:a.siteId,releaseId:target.id}}))throw failure('rollback_not_published')

        }
        // No storage/network calls after this point. The transaction commits pointer,
        // event, outbox, audit and idempotent receipt together.
        const updated=await tx.websiteSite.update({where:{id:a.siteId,companyId:a.companyId,publicationRevision:current.publicationRevision},data:{activeReleaseId:target?.id??null,lastPublishedReleaseId:target?.id??current.lastPublishedReleaseId,publicationRevision:{increment:1},lifecycle:target?'published':'unpublished',status:target?'published':'draft',releaseManaged:true,...(target&&{sourceType:target.manifest.kind}),...(target?.manifest.kind==='dist'&&{distUploadedAt:target.createdAt,distFileCount:target.manifest.files.length,distHasPrerender:target.manifest.files.some(f=>f.mime==='text/html'&&f.path!=='index.html')})}})
        // Keep historical status projections consistent without erasing their
        // published payloads or touching the editable document/revision.
        for(const model of ['websitePage','websiteBlogPost'])await tx[model].updateMany({where:{companyId:a.companyId,siteId:a.siteId,status:'published'},data:{status:'draft'}})
        if(target)for(const route of target.manifest.routes) {
          const model=route.sourceKind==='page'?'websitePage':'websiteBlogPost'
          await tx[model].updateMany({where:{id:route.sourceId,companyId:a.companyId,siteId:a.siteId},data:{publishedBuilderData:route.document,status:'published',publishedAt:new Date()}})
          if(route.sourceKind==='page') {
            const version=await tx.websitePageVersion.aggregate({where:{companyId:a.companyId,pageId:route.sourceId},_max:{versionNumber:true}})
            await tx.websitePageVersion.create({data:{companyId:a.companyId,pageId:route.sourceId,versionNumber:(version._max.versionNumber??0)+1,builderData:route.document,seo:route.seo,status:'published',createdById:a.actorId}})
          }
        }
        const event=await tx.websitePublicationEvent.create({data:{companyId:a.companyId,siteId:a.siteId,releaseId:target?.id??null,fromReleaseId:current.activeReleaseId,publicationRevision:updated.publicationRevision,action,actorId:a.actorId}})
        await tx.websitePublicationOutbox.create({data:{eventId:event.id,companyId:a.companyId,siteId:a.siteId,publicationRevision:updated.publicationRevision}})
        await tx.auditLog.create({data:{actorId:a.actorId,moduleKey:'runly.website',entityType:'website.site',entityId:a.siteId,action:`site.publication.${action}`,metadata:{companyId:a.companyId,releaseId:target?.id,publicationRevision:updated.publicationRevision}}})
        await beforeCommit();return {siteId:a.siteId,activeReleaseId:updated.activeReleaseId,publicationRevision:updated.publicationRevision,lifecycle:updated.lifecycle}
      })
      const latest=await site(tx,a)
      return {...result,current:{activeReleaseId:latest.activeReleaseId,publicationRevision:latest.publicationRevision,lifecycle:latest.lifecycle}}
    })
  }
  async function publishLegacy(input,kind='page') {
    assertWebsiteAccess(input?.access,input?.companyId,'website.pages.publish')
    const id=kind==='page'?input.pageId:input.postId
    if(!id)throw notFound('Recurso')
    const model=kind==='page'?'websitePage':'websiteBlogPost'
    const row=await prisma[model].findFirst({where:{id,companyId:input.companyId,enabled:true}})
    if(!row)throw notFound('Recurso')
    const a=authorize({...input,siteId:row.siteId})
    // Payload is saved first, under CAS, and never ignored. A later concurrent
    // edit makes preparation/activation fail instead of publishing older content.
    if(a.builderData!==undefined) {
      assertWebsiteAccess(a.access,a.companyId,'website.pages.update')
      await drafts.save({...a,idempotencyKey:`legacy-save-${hash({id,body:a.builderData,seo:a.seo})}`},kind)
    }
    const saved=await prisma[model].findFirst({where:{id,companyId:a.companyId,siteId:a.siteId}})
    const attempt=a.idempotencyKey??`legacy-publish-${hash({id,document:saved.draftBuilderData,metadata:saved.draftMetadata,seo:saved.draftSeo})}`
    const prior=await prisma.websiteDraftCommand.findFirst({where:{companyId:a.companyId,actorId:a.actorId,operation:`release.prepare:${a.siteId}`,keyHash:hash(attempt)}})
    const current=prior?.result?.current??await site(prisma,a)
    const legacyInput={...a,idempotencyKey:attempt,kind:'builder',builderData:undefined,seo:undefined,expectedRevision:undefined,
      expectedDraftRevision:current.draftRevision,expectedPublicationRevision:current.publicationRevision,baseReleaseId:current.activeReleaseId,
      changes:{publishPageIds:kind==='page'?[id]:[],publishPostIds:kind==='post'?[id]:[],includeThemeAndMenus:true}}
    legacyCalls.add(legacyInput)
    const candidate=await prepare(legacyInput)
    if(candidate.state!=='ready')throw failure(candidate.failureCode??'release_not_ready')
    await change({...a,idempotencyKey:attempt,releaseId:candidate.id,manifestHash:candidate.manifestHash,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:current.publicationRevision})
    return prisma[model].findFirst({where:{id,companyId:a.companyId,siteId:a.siteId}})
  }
  async function list(input) {
    const a=authorize(input,'website.pages.read');await site(prisma,a)
    const limit=a.limit===undefined?25:Number(a.limit)
    if(!Number.isInteger(limit)||limit<1||limit>100)throw failure('validation_failed',422)
    if(a.cursor)await release(prisma,a,a.cursor)
    const rows=await prisma.websiteRelease.findMany({where:{companyId:a.companyId,siteId:a.siteId},orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit+1,...(a.cursor&&{cursor:{id:a.cursor},skip:1})})
    const data=rows.slice(0,limit).map(contractDTO.releaseDTO);return {data,meta:{nextCursor:rows.length>limit?data.at(-1).id:null}}
  }
  async function get(input) {const a=authorize(input,'website.pages.read');await site(prisma,a);return contractDTO.releaseDTO(await release(prisma,a,a.releaseId))}
  return {prepare,preflight,preparePreview,publishLegacy,activate:a=>change(a),rollback:a=>change(a,'rollback'),unpublish:a=>change(a,'unpublish'),list,get}
}
