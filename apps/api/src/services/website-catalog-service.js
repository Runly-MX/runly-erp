import {assertWebsiteAccess} from './website-authorization-service.js'
import {createWebsiteDraftService,normalizeWebsiteDocument} from './website-draft-service.js'
import {WebsiteServiceError,notFound} from '../routes/website/service-helpers.js'
import {createCatalogProductService} from '../routes/catalog/catalog-product-service.js'

export function createWebsiteCatalogService({prisma,supabaseAdmin}) {
  const drafts=createWebsiteDraftService({prisma})
  const images=createCatalogProductService({prisma,supabaseAdmin})
  const invalid=()=>new WebsiteServiceError('Datos inválidos.',422,'validation_failed')
  async function owner(a,db=prisma,write=false) {
    assertWebsiteAccess(a.access,a.companyId,'website.site.read')
    assertWebsiteAccess(a.access,a.companyId,'catalog.products.read')
    if(write)assertWebsiteAccess(a.access,a.companyId,'website.site.update')
    const site=await db.websiteSite.findFirst({where:{id:a.siteId,companyId:a.companyId,enabled:true}})
    if(!site)throw notFound('Recurso');return site
  }
  async function list(a) {
    const site=await owner(a),limit=Number(a.limit??24),offset=Number(a.offset??0)
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw invalid()
    const rows=await prisma.$queryRaw`
      SELECT p.id,p.name,p.slug,p.price,p.currency,p.published,p.stock,p.cover_asset_id,p.category_id,c.name AS category_name,
        COALESCE(l.included,${site.catalogMode==='legacy_all'}) AS included
      FROM catalog_product p LEFT JOIN catalog_category c ON c.id=p.category_id AND c.company_id=p.company_id
      LEFT JOIN website_catalog_product l ON l.company_id=p.company_id AND l.product_id=p.id AND l.site_id=${a.siteId}::uuid
      WHERE p.company_id=${a.companyId}::uuid AND p.enabled=true
        AND (${a.published===undefined?null:a.published==='true'}::boolean IS NULL OR p.published=${a.published==='true'})
        AND (${a.categoryId??null}::text IS NULL OR p.category_id::text=${a.categoryId??null})
        AND (${a.search??null}::text IS NULL OR p.name ILIKE ${'%'+(a.search??'')+'%'})
      ORDER BY p.id LIMIT ${limit+1} OFFSET ${offset}`
    const publicSite=site.status==='published'&&site.sourceType!=='none'&&(!site.releaseManaged||Boolean(site.activeReleaseId))
    const products=await images.resolveImageUrls(rows.slice(0,limit),{companyId:a.companyId})
    return {data:products.map(p=>({...p,eligibleForWeb:p.published,includedInSite:p.included,publiclyVisible:Boolean(publicSite&&p.published&&p.included)})),meta:{catalogMode:site.catalogMode,draftRevision:site.draftRevision,nextOffset:rows.length>limit?offset+limit:null}}
  }
  async function select(a) {
    await owner(a,prisma,true)
    if(typeof a.included!=='boolean'||!Number.isSafeInteger(a.expectedRevision))throw invalid()
    if(typeof a.idempotencyKey!=='string'||a.idempotencyKey.length<16)throw invalid()
    return prisma.$transaction(async tx=>{
      await drafts.lockSite(tx,a.companyId,a.siteId)
      return drafts.receipt(tx,{...a,actorId:a.access.actorId},`catalog.select:${a.siteId}:${a.productId}`,{included:a.included,expectedRevision:a.expectedRevision},async()=>{
        const site=await owner(a,tx,true);drafts.expected(site.draftRevision,a.expectedRevision)
        const [product]=await tx.$queryRaw`SELECT id FROM catalog_product WHERE company_id=${a.companyId}::uuid AND id=${a.productId}::uuid AND enabled=true FOR SHARE`
        if(!product)throw notFound('Recurso')
        await tx.$executeRaw`INSERT INTO website_catalog_product(company_id,site_id,product_id,included) VALUES(${a.companyId}::uuid,${a.siteId}::uuid,${a.productId}::uuid,${a.included}) ON CONFLICT(company_id,site_id,product_id) DO UPDATE SET included=EXCLUDED.included`
        const updated=await tx.websiteSite.update({where:{id:a.siteId},data:{draftRevision:{increment:1}}})
        await tx.auditLog.create({data:{actorId:a.access.actorId,moduleKey:'runly.website',entityType:'website.catalog',entityId:a.siteId,action:'catalog.select',metadata:{companyId:a.companyId,productId:a.productId,included:a.included}}})
        return {siteId:a.siteId,productId:a.productId,includedInSite:a.included,draftRevision:updated.draftRevision,operational:true}
      })
    })
  }
  async function usedBy(a) {
    await owner(a);assertWebsiteAccess(a.access,a.companyId,'website.pages.read')
    const limit=Number(a.limit??25);if(!Number.isInteger(limit)||limit<1||limit>100)throw invalid()
    const [product]=await prisma.$queryRaw`SELECT p.id,p.slug,p.published,p.category_id,c.slug AS category_slug FROM catalog_product p LEFT JOIN catalog_category c ON c.id=p.category_id AND c.company_id=p.company_id WHERE p.id=${a.productId}::uuid AND p.company_id=${a.companyId}::uuid AND p.enabled=true`
    if(!product)throw notFound('Recurso')
    let after='';try{if(a.cursor)after=Buffer.from(a.cursor,'base64url').toString('utf8')}catch{throw invalid()}
    if(after.length>500||a.cursor&&!/^[A-Za-z0-9_-]+$/.test(a.cursor))throw invalid()
    const found=[],warnings=[]
    function inspect(document,source,id,title) {
      let normalized;try{normalized=normalizeWebsiteDocument(document)}catch{if(warnings.length<100)warnings.push({source,id,code:'historical_document_unreadable'});return}
      if(normalized&&typeof normalized==='object'&&!normalized.blocks&&Object.keys(normalized).length){if(warnings.length<100)warnings.push({source,id,code:'historical_document_unreadable'});return}
      for(const block of Object.values(normalized?.blocks??{}).sort((a,b)=>String(a.id).localeCompare(String(b.id)))) {
        const props=block.props??{}
        const card=block.type==='ProductCardBlock'&&[a.productId,product.slug].includes(props.productId)
        const grid=block.type==='ProductsGridBlock'&&(!props.categorySlug||props.categorySlug===product.category_slug)
        if(card||grid){const key=`${source}:${id}:${block.id}`;if(key>after){found.push({key,source,id,title,blockId:block.id,kind:card?'card':'grid',visibilityConditional:grid});found.sort((x,y)=>x.key>y.key?1:x.key<y.key?-1:0);if(found.length>limit+1)found.pop()}}
      }
    }
    // Enumerate all matching documents server-side in keyset batches, including
    // posts and the active immutable snapshot. Never depend on UI's first pages.
    for(const [source,model]of [['draft-page','websitePage'],['draft-post','websiteBlogPost']]) {
      let cursor
      do {
        const rows=await prisma[model].findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true},orderBy:{id:'asc'},take:100,...(cursor&&{cursor:{id:cursor},skip:1})})
        for(const row of rows)inspect(row.draftBuilderData,source,row.id,row.title)
        if(rows.length<100)break;cursor=rows.at(-1).id
      }while(true)
    }
    const site=await owner(a)
    if(site.activeReleaseId){const release=await prisma.websiteRelease.findFirst({where:{id:site.activeReleaseId,companyId:a.companyId,siteId:a.siteId}});for(const route of release?.manifest?.routes??[])inspect(route.document,'published-'+route.sourceKind,route.sourceId,route.title)}
    else if(!site.releaseManaged)for(const model of ['websitePage','websiteBlogPost']) {
      let cursor
      do {const rows=await prisma[model].findMany({where:{companyId:a.companyId,siteId:a.siteId,enabled:true,status:'published'},orderBy:{id:'asc'},take:100,...(cursor&&{cursor:{id:cursor},skip:1})});for(const row of rows)inspect(row.publishedBuilderData,'legacy-'+model,row.id,row.title);if(rows.length<100)break;cursor=rows.at(-1).id}while(true)
    }
    const page=found.slice(0,limit)
    const [link]=await prisma.$queryRaw`SELECT included FROM website_catalog_product WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid AND product_id=${a.productId}::uuid`
    const included=link?.included??site.catalogMode==='legacy_all'
    const visible=Boolean(included&&product.published&&site.status==='published'&&site.sourceType!=='none'&&(!site.releaseManaged||site.activeReleaseId))
    return {data:page.map(({key,...row})=>row),meta:{nextCursor:found.length>limit?Buffer.from(page.at(-1).key).toString('base64url'):null,consistency:'live',warnings,operationalSurfaces:[{kind:'public_catalog',eligible:product.published,included,visible},...(site.stripeSecretKey?[{kind:'legacy_checkout',eligible:product.published,included,visible}]:[])]}}
  }
  async function replaceSelection(a) {
    await owner(a,prisma,true)
    if(!Array.isArray(a.productIds)||a.productIds.length>1000||new Set(a.productIds).size!==a.productIds.length||!Number.isSafeInteger(a.expectedRevision)||typeof a.idempotencyKey!=='string'||a.idempotencyKey.length<16)throw invalid()
    return prisma.$transaction(async tx=>{
      await drafts.lockSite(tx,a.companyId,a.siteId)
      return drafts.receipt(tx,{...a,actorId:a.access.actorId},`catalog.selection:${a.siteId}`,{productIds:[...a.productIds].sort(),expectedRevision:a.expectedRevision},async()=>{
        const site=await owner(a,tx,true);drafts.expected(site.draftRevision,a.expectedRevision)
        const products=await tx.$queryRaw`SELECT id FROM catalog_product WHERE company_id=${a.companyId}::uuid AND id=ANY(${a.productIds}::uuid[]) AND enabled=true FOR SHARE`
        if(products.length!==a.productIds.length)throw notFound('Recurso')
        // Retain existing associations; switch only their effective selection.
        await tx.$executeRaw`UPDATE website_catalog_product SET included=false WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid`
        await tx.$executeRaw`INSERT INTO website_catalog_product(company_id,site_id,product_id,included) SELECT ${a.companyId}::uuid,${a.siteId}::uuid,id,true FROM unnest(${a.productIds}::uuid[]) AS id ON CONFLICT(company_id,site_id,product_id) DO UPDATE SET included=true`
        const updated=await tx.websiteSite.update({where:{id:a.siteId},data:{catalogMode:'explicit',draftRevision:{increment:1}}})
        await tx.auditLog.create({data:{actorId:a.access.actorId,moduleKey:'runly.website',entityType:'website.catalog',entityId:a.siteId,action:'catalog.selection.explicit',metadata:{companyId:a.companyId,productIds:a.productIds}}})
        return {siteId:a.siteId,catalogMode:'explicit',draftRevision:updated.draftRevision,selectedCount:a.productIds.length,operational:true}
      })
    })
  }
  return {list,select,usedBy,replaceSelection}
}
