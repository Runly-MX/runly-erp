import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { FILE_ID, StudioError, validateDocument } from '../../../../../shared/studio/document.js'
import { ICON_COLLECTIONS, LOCAL_ICON_COLLECTION, iconSource } from '../../../../../shared/studio/licenses.js'
import { localIcon, searchLocalIcons } from './local-icons.js'
import { libraryIcon, libraryVersions, searchLibrary } from './icon-library.js'
import { createCatalogNetwork } from './network.js'
import { createCatalogCache } from './cache.js'
import { createProviderHealth } from './health.js'
import { iconGeometry } from './vector.js'
import { createLocalCatalogFixtureNetwork } from './test-network.js'
import { openverse } from './providers/openverse.js'
import { wikimedia } from './providers/wikimedia.js'
import { pixabay } from './providers/pixabay.js'
import { createPacksProvider } from './providers/packs.js'
import { text } from './providers/common.js'
import { isStudioRaster } from '../image-format.js'
import { AsyncLocalStorage } from 'node:async_hooks'

const MAX_BYTES=10*1024*1024, MIME={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}
const ICONIFY_PAGES=31
// Iconify publishes redundant API hosts; they are tried in order only when the previous one fails to answer.
const ICONIFY_HOSTS=['api.iconify.design','api.simplesvg.com','api.unisvg.com']
const unavailable=()=>{throw new StudioError('El proveedor devolvió un recurso no compatible.',502,'CATALOG_RESPONSE_INVALID')}
const LANES={api:{limit:100,concurrent:4},thumb:{limit:1200,concurrent:8}}

// Provider operations share authentication, quotas and bounded metadata caching.
// Browser input is an ID/query, never a URL. Originals only enter Files on import.
// Every provider has its own request lanes and circuit breaker: a stalled provider cannot block the others.
export function createStudioCatalog({prisma,access,filesService,supabaseAdmin,network=createCatalogNetwork(),clock=Date.now,onDiagnostic,env=process.env,packs=createPacksProvider(),health=createProviderHealth({clock})}) {
  if(process.env.STUDIO_CATALOG_TEST_PROJECT)network=createLocalCatalogFixtureNetwork(prisma,process.env.STUDIO_CATALOG_TEST_PROJECT)
  const adapters={openverse,wikimedia,pixabay,packs}
  const cache=createCatalogCache({clock,ttl:5*60000,maxEntries:400}),rates=new Map(),imports=new Set();let decoding=0
  // Provider-level search cache holds no tenant data; Pixabay requires keeping API responses for 24 hours.
  const upstream=new Map()
  const upstreamCache=adapter=>{if(!upstream.has(adapter.id))upstream.set(adapter.id,createCatalogCache({clock,ttl:adapter.ttl,maxEntries:150,maxBytes:6*1024*1024}));return upstream.get(adapter.id)}
  const operations=new AsyncLocalStorage();let lastDiagnostic=-Infinity
  const record=event=>{const context=operations.getStore();if(context&&context.events.length<32)context.events.push(event)}
  const check=()=>{const context=operations.getStore();if(context?.signal?.aborted)throw new StudioError(context.expired?'El catálogo agotó el tiempo de espera.':'Solicitud cancelada.',context.expired?504:499,context.expired?'CATALOG_TOTAL_TIMEOUT':'CATALOG_CANCELLED')}
  // Public thumbnails are cached as base64 (PNG, ~256px) so re-renders and other users do not hit the provider again.
  const thumbs=createCatalogCache({clock,ttl:15*60000,maxEntries:300,maxBytes:24*1024*1024})
  const longThumbs=createCatalogCache({clock,ttl:24*3600000,maxEntries:300,maxBytes:24*1024*1024})
  const thumbCache=p=>adapters[p]?.ttl>=24*3600000?longThumbs:thumbs
  async function decode(task) {
    check();record({stage:'PROCESSING_START'})
    if(decoding>=2)throw new StudioError('Hay imágenes procesándose. Espera antes de reintentar.',429)
    decoding++
    try{return await task()}finally{decoding--;record({stage:'PROCESSING_END'})}
  }
  async function authorize(companyId,actorId,editId,upload=false) {
    check()
    await access.member(companyId,actorId,editId?'studio.edit':'studio.view')
    if(editId)await access.get(companyId,actorId,editId,prisma,true)
    if(upload){await access.member(companyId,actorId,'files.assets.read');await access.member(companyId,actorId,'files.assets.create')}
  }
  // Thumbnails use their own lane: a page of results fires ~20 of them and must not exhaust the search quota.
  const lanes=new Map()
  const laneFor=name=>{if(!lanes.has(name))lanes.set(name,{...LANES[name.split(':')[0]],running:0});return lanes.get(name)}
  async function work(companyId,actorId,action,laneName='api',options={}) {
    const controller=new AbortController(),context={signal:controller.signal,deadline:Date.now()+(options.operation==='import'?30000:15000),events:[],expired:false,status:200},started=Date.now()
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort()
    const timer=setTimeout(()=>{context.expired=true;controller.abort()},Math.max(1,context.deadline-Date.now()))
    return operations.run(context,async()=>{try{
    record({stage:'API_ENTRY',elapsedMs:0});record({stage:'ROUTE_AUTHORIZED',elapsedMs:options.entryElapsedMs??0});record({stage:'AUTHORIZATION_START'});await authorize(companyId,actorId);record({stage:'AUTHORIZATION_END'})
    const lane=laneFor(laneName),now=clock(),key=`${companyId}:${actorId}:${laneName}`
    for(const[k,v]of rates)if(v.until<=now)rates.delete(k)
    if(!rates.has(key)){if(rates.size>=1024)throw new StudioError('Catálogo ocupado. Reintenta más tarde.',429);rates.set(key,{count:0,until:now+60000})}
    if(++rates.get(key).count>lane.limit||lane.running>=lane.concurrent)throw new StudioError('Demasiadas consultas. Espera antes de reintentar.',429)
    lane.running++
    try{record({stage:'OPERATION_START'});const result=await action(`${companyId}:${actorId}`);await authorize(companyId,actorId);check();return result}finally{lane.running--}
    }catch(error){context.status=context.expired?504:error.status??500;context.code=context.expired?'CATALOG_TOTAL_TIMEOUT':error.code;check();throw error}finally{
      clearTimeout(timer);options.signal?.removeEventListener('abort',abort)
      context.events[ Math.min(context.events.length,31) ]={stage:'API_EXIT',status:context.status,elapsedMs:Date.now()-started}
      const report={requestId:options.requestId,operation:options.operation,provider:options.provider,status:context.status,code:context.code,durationMs:Date.now()-started,events:context.events}
      try{if(onDiagnostic)onDiagnostic(report)
      else if(process.env.RUNLY_STUDIO_CATALOG_DIAGNOSTICS==='1'&&clock()-lastDiagnostic>=60000){lastDiagnostic=clock();console.info('[studio.catalog]',JSON.stringify(report))}}catch{/* diagnostic sinks cannot fail a request */}
    }})
  }
  // The single upstream gate: circuit breaker, provider quota, per-provider host allowlist and at most one retry
  // for 502/503/504. Cached results never reach it, so they keep being served while a provider is cooling down.
  async function fetchRetry(p,url,options={}) {
    const context=operations.getStore(),adapter=adapters[p]
    const attempt=async()=>{
      check();health.check(p);if(adapter?.quota)health.quota(p,adapter.quota)
      try{
        const response=await network.get(url,{...options,provider:p,userAgent:adapter?.userAgent,signal:context?.signal,timeoutMs:Math.min(options.timeoutMs??15000,Math.max(1,(context?.deadline??Date.now()+15000)-Date.now())),onTiming:record})
        health.success(p);return response
      }catch(error){health.failure(p,error);throw error}
    }
    try{return await attempt()}
    catch(error){
      if(options.retry===false||!/^CATALOG_UPSTREAM_(502|503|504)$/.test(error?.code??'')||context&&context.deadline-Date.now()<1000)throw error
      await new Promise(resolve=>setTimeout(resolve,100+Math.floor(Math.random()*150)))
      return attempt()
    }
  }
  const jsonFor=p=>async(url,options)=>{
    const response=await fetchRetry(p,url,{maxBytes:262144,...options})
    check();record({stage:'VALIDATION'})
    if(response.mime!=='application/json')unavailable()
    try{return JSON.parse(response.bytes.toString('utf8'))}catch{unavailable()}
  }
  // Iconify path with redundant hosts: a transport failure moves on to the next official host.
  async function iconifyJson(path) {
    let last
    for(const [index,host] of ICONIFY_HOSTS.entries()){
      try{return await jsonFor('iconify')(`https://${host}${path}`,{retry:index===ICONIFY_HOSTS.length-1?undefined:false})}
      catch(error){
        last=error
        if(!/^CATALOG_(DNS|CONNECT|TLS|HEADERS|DOWNLOAD)_|^CATALOG_UPSTREAM_5/.test(error?.code??'')||error.code==='CATALOG_PROVIDER_UNAVAILABLE')throw error
        check()
      }
    }
    throw last
  }
  const isRaster=p=>Boolean(adapters[p])
  function provider(value){
    if(value!=='iconify'&&!Object.hasOwn(adapters,value))throw new StudioError('Proveedor no disponible.',404)
    return value
  }
  function checkedId(p,id){provider(p);if(p==='iconify'?!iconSource(id):!adapters[p].idPattern.test(id))throw new StudioError('Recurso no encontrado.',404);return id}
  // A provider that needs an API key stays disabled when its key is missing or the provider rejects it
  // (until the process restarts with a valid one); nothing is retried against a key known to be invalid.
  const rejectedKey=new Set()
  const enabled=p=>adapters[p].enabled(env)&&!rejectedKey.has(p)
  const disabledReason=p=>rejectedKey.has(p)?'Clave de API rechazada por el proveedor':adapters[p].disabledReason??'No disponible'
  const requireEnabled=p=>{if(isRaster(p)&&!enabled(p))throw new StudioError('Este proveedor no está configurado.',404,'CATALOG_PROVIDER_DISABLED')}
  async function approvedCollection(prefix,fresh=false) {
    const key=`license:${prefix}`
    if(!fresh&&cache.get(key))return
    const metadata=await iconifyJson(`/collections?prefix=${prefix}`)
    if(metadata?.[prefix]?.license?.spdx!==(prefix==='tabler'?'MIT':'ISC'))throw new StudioError('La licencia actual de esta colección necesita revisión.',403,'CATALOG_LICENSE_DENIED')
    cache.set(key,{approved:true})
  }
  function packedIcon(id) {
    try{return libraryIcon(id)}catch{return null}
  }
  async function original(p,id,freshLicense=false,scope) {
    checkedId(p,id)
    if(p==='iconify') {
      const included=localIcon(id)??packedIcon(id);if(included)return included
      const[prefix,name]=id.split(':')
      await approvedCollection(prefix,freshLicense)
      const row=await iconifyJson(`/${prefix}.json?icons=${encodeURIComponent(name)}`)
      if(row?.prefix!==prefix||!row.icons||Object.keys(row.icons).length>1||!row.icons[name])throw new StudioError('El icono ya no está disponible.',404)
      const icon=row.icons[name]
      // Aliases, transforms and additional SVG features are intentionally excluded.
      if(icon.rotate||icon.hFlip||icon.vFlip||icon.left||icon.top)unavailable()
      let geometry
      try{geometry=iconGeometry(icon.body,icon.width??row.width??16,icon.height??row.height??16)}catch{unavailable()}
      return {resource:{...iconSource(id),width:geometry.width,height:geometry.height},geometry}
    }
    requireEnabled(p)
    const key=scope?`${scope}:original:${p}:${id}`:null
    if(key&&!freshLicense){const hit=cache.get(key);if(hit)return hit}
    const result=await adapters[p].resolve({id,json:jsonFor(p),env})
    if(!result||result.resource.id!==id)throw new StudioError('La licencia o el origen de este recurso no están admitidos.',403,'CATALOG_LICENSE_DENIED')
    // Local bytes are re-read from disk on demand and never cached with the metadata.
    if(key&&!result.local)cache.set(key,result)
    return result
  }
  const base=(page,hasNext,extra={})=>({pagination:{page,hasNext},...extra})
  async function search(companyId,actorId,p,query={},options={}) {
    provider(p)
    const q=text(query.q,80).trim(),page=Math.max(1,Math.min(100,Number.parseInt(query.page,10)||1)),collection=query.collection??'tabler'
    const category=p!=='iconify'&&adapters[p].categories.includes(query.category)?query.category:''
    if(p==='iconify'&&collection!=='local'&&!ICON_COLLECTIONS.some(row=>row.id===collection))throw new StudioError('Colección no disponible.',400)
    return work(companyId,actorId,async scope=>{
      const key=JSON.stringify([scope,p,q,page,collection,category,query.source??'']),hit=cache.get(key);if(hit)return hit
      let data,hasNext,extra={}
      if(p==='iconify') {
        if(collection==='local')return {data:searchLocalIcons(q,page),...base(page,false),collections:[LOCAL_ICON_COLLECTION,...ICON_COLLECTIONS],local:true}
        // The pinned Tabler/Lucide packages answer first and need no internet; Iconify is used only on request or if the library cannot load.
        let library=null
        if(query.source!=='iconify'){try{library=searchLibrary(collection,q,page);extra={source:'library',library:libraryVersions()}}catch{library=null}}
        if(library){data=library.data;hasNext=library.hasNext}
        else{
          if(!q)return {data:[],...base(page,false),collections:ICON_COLLECTIONS,requiresQuery:true}
          await approvedCollection(collection)
          // Iconify's limit is the end index (start must stay below it, max 999), not a page size.
          if(page>ICONIFY_PAGES)return {data:[],...base(page,false),collections:ICON_COLLECTIONS}
          const response=await iconifyJson(`/search?${new URLSearchParams({query:q,prefix:collection,limit:String(page*32),start:String((page-1)*32)})}`)
          if(!Array.isArray(response?.icons)||response.icons.length>32)unavailable()
          data=response.icons.map(iconSource).filter(row=>row&&row.id.startsWith(`${collection}:`));hasNext=response.icons.length===32&&page<ICONIFY_PAGES
          extra={source:'iconify'}
        }
      }else{
        const adapter=adapters[p]
        if(!enabled(p))return {data:[],...base(page,false),collections:[],availability:{state:'disabled',reason:disabledReason(p)}}
        if(!q&&!adapter.local)return {data:[],...base(page,false),collections:[],requiresQuery:true}
        const shared=adapter.ttl?upstreamCache(adapter):null,sharedKey=JSON.stringify([q,page,category])
        let found=shared?.get(sharedKey)
        if(!found){
          try{found=await adapter.search({q,page,category,json:jsonFor(p),env})}
          catch(error){
            // Page 1 of a valid query never fails with 400, so it means the key; later pages can be out of range.
            if(adapter.credentialed&&(/^CATALOG_UPSTREAM_(401|403)$/.test(error?.code??'')||error?.code==='CATALOG_UPSTREAM_400'&&page===1))rejectedKey.add(p)
            throw error
          }
          if(!found)unavailable()
          shared?.set(sharedKey,found)
        }
        for(const[id,row]of Object.entries(found.originals))cache.set(`${scope}:original:${p}:${id}`,row)
        data=found.data;hasNext=found.hasNext
      }
      const result={data,...base(page,hasNext),collections:p==='iconify'?ICON_COLLECTIONS:[],...extra};cache.set(key,result);return result
    },`api:${p}`,{...options,operation:'search',provider:p})
  }
  async function details(companyId,actorId,p,id,options={}) {
    checkedId(p,id)
    return work(companyId,actorId,async scope=>{
      const key=`${scope}:${p}:${id}`,hit=cache.get(key);if(hit)return hit
      const row=await original(p,id,false,scope),result={...row.resource,...(row.geometry?{geometry:row.geometry}:{})};cache.set(key,result);return result
    },`api:${p}`,{...options,operation:'details',provider:p})
  }
  async function thumbnail(companyId,actorId,p,id,options={}) {
    checkedId(p,id)
    return work(companyId,actorId,async scope=>{
      const store=isRaster(p)?thumbCache(p):thumbs
      const cached=store.get(`${p}:${id}`)
      if(cached)return Buffer.from(cached,'base64')
      const row=await original(p,id,false,scope)
      if(row.geometry) {
        const{width,height,paths}=row.geometry
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.map(path=>`<path d="${path.d}" fill="${path.fill==='color'?'#262626':'none'}" stroke="${path.stroke==='color'?'#262626':'none'}" stroke-width="${path.strokeWidth}" stroke-linecap="${path.cap}" stroke-linejoin="${path.join}"/>`).join('')}</svg>`
        return sharp(Buffer.from(svg)).resize(128,128,{fit:'inside'}).png().toBuffer()
      }
      let response=row.local
      if(!response){
        try{response=await fetchRetry(p,row.thumbnailUrl,{maxBytes:MAX_BYTES})}
        catch(error){
          // The provider's thumbnail proxy is the flaky part; fall back to the (larger) original and shrink it here.
          if(![502,504].includes(error?.status)||error.code==='CATALOG_PROVIDER_UNAVAILABLE')throw error
          response=await fetchRetry(p,row.originalUrl,{maxBytes:MAX_BYTES})
        }
      }
      const png=await decode(async()=> (await checkedImage(response)).processor.rotate().resize(256,256,{fit:'inside',withoutEnlargement:true}).png().toBuffer())
      store.set(`${p}:${id}`,png.toString('base64'))
      return png
    },`thumb:${p}`,{...options,operation:'thumbnail',provider:p})
  }
  async function checkedImage(response) {
    if(!Object.values(MIME).includes(response.mime)||!response.bytes.length||response.bytes.length>MAX_BYTES)throw new StudioError('Formato o tamaño de imagen no admitido.',413)
    if(!isStudioRaster(response.bytes,response.mime))throw new StudioError('El archivo no coincide con el formato de imagen declarado.',400)
    try {
      const processor=sharp(response.bytes,{limitInputPixels:25_000_000,animated:false}),metadata=await processor.metadata()
      if(MIME[metadata.format]!==response.mime||!metadata.width||!metadata.height||metadata.width*metadata.height>25_000_000||(metadata.pages??1)>1)throw Error('invalid')
      // Decode all pixels before persisting; truncated data is not a valid original.
      await processor.clone().resize(1,1).raw().toBuffer()
      return {processor,metadata}
    }catch{throw new StudioError('El archivo no es una imagen válida de hasta 25 megapíxeles.',400)}
  }
  async function insert(companyId,actorId,p,id,designId,context,options={}) {
    checkedId(p,id);if(typeof designId!=='string'||!FILE_ID.test(designId))throw new StudioError('Diseño no encontrado.',404)
    await authorize(companyId,actorId,designId,isRaster(p))
    return work(companyId,actorId,async scope=>{
      const key=`${scope}:${p}:${id}`
      if(imports.has(key))throw new StudioError('Este recurso se está importando. Espera un momento.',429)
      imports.add(key)
      try {
        const row=await original(p,id,true,scope) // Never trust a cached or client supplied license on import.
        if(p==='iconify'){await authorize(companyId,actorId,designId);return {resource:row.resource,object:{type:'vector',iconId:id,geometry:row.geometry,width:160,height:160*row.geometry.height/row.geometry.width}}}
        const response=row.local??await fetchRetry(p,row.originalUrl,{maxBytes:MAX_BYTES,timeoutMs:30000}),{metadata}=await decode(()=>checkedImage(response))
        await authorize(companyId,actorId,designId,true)
        const hash=createHash('sha256').update(response.bytes).digest('hex')
        const [existing]=await prisma.$queryRaw`SELECT id FROM file_asset WHERE entity_id=${companyId}::uuid AND uploaded_by_id=${actorId}::uuid AND enabled
          AND metadata->'studioSource'->>'provider'=${p} AND metadata->'studioSource'->>'id'=${id} AND metadata->>'studioSha256'=${hash} LIMIT 1`
        let file
        if(existing&&supabaseAdmin){
          try{
            const candidate=await filesService.getById({...context,id:existing.id})
            if(candidate.enabled&&candidate.entityId===companyId&&candidate.mimeType===response.mime&&Number(candidate.sizeBytes)===response.bytes.length&&
              isDeepStrictEqual(candidate.metadata?.studioSource,row.resource)) {
              // Upload metadata is user-controlled. Verify actual stored bytes before deduplicating.
              const stored=await supabaseAdmin.storage.from(candidate.bucket).download(candidate.objectKey)
              if(!stored.error&&stored.data?.size===response.bytes.length&&createHash('sha256').update(Buffer.from(await stored.data.arrayBuffer())).digest('hex')===hash)file=candidate
            }
          }catch{/* no reusable authorized, byte-verified file */}
        }
        if(!file){
          await authorize(companyId,actorId,designId,true)
          file=await filesService.upload({...context,file:new File([response.bytes],`studio-${id.replace(/[^a-z0-9-]/gi,'-')}.${metadata.format==='jpeg'?'jpg':metadata.format}`,{type:response.mime}),
            fields:{moduleKey:'runly.files',entityType:'AtlasFile',visibility:'PRIVATE',metadata:{studioSource:row.resource,studioSha256:hash}}})
        }
        await authorize(companyId,actorId,designId,true)
        return {resource:row.resource,file:{id:file.id,name:file.originalName,width:metadata.width,height:metadata.height}}
      }finally{imports.delete(key)}
    },`api:${p}`,{...options,operation:'import',provider:p})
  }
  async function credits(companyId,actorId,designId,input,context) {
    const document=validateDocument(input)
    await authorize(companyId,actorId);await access.get(companyId,actorId,designId)
    const {ids}=await access.assets(prisma,companyId,actorId,document,designId,context)
    const rows=ids.length?await prisma.$queryRaw`SELECT metadata->'studioSource' AS source FROM file_asset WHERE id=ANY(${ids}::uuid[]) AND entity_id=${companyId}::uuid AND enabled`:[]
    await access.get(companyId,actorId,designId)
    return [...document.objects.filter(o=>o.type==='vector').map(o=>o.svgName?{provider:'local-svg',id:o.id,title:o.svgName,license:'Licencia no declarada',licenseUrl:null,sourceUrl:null,attributionRequired:true}:iconSource(o.iconId)),
      ...rows.map(row=>row.source).filter(row=>typeof row?.id==='string'&&Object.hasOwn(adapters,row.provider)&&adapters[row.provider].idPattern.test(row.id))]
  }
  // Availability for the UI: configuration and circuit state only. It never contacts a provider.
  async function status(companyId,actorId) {
    await authorize(companyId,actorId)
    const rejected=await packs.rejected().catch(()=>0)
    return [
      {id:'iconify',label:'Iconos (Tabler y Lucide)',type:'vector',state:'available',source:'library',library:libraryVersions(),remote:health.status('iconify')},
      ...Object.values(adapters).map(adapter=>enabled(adapter.id)
        ?{id:adapter.id,label:adapter.label,type:'image',categories:adapter.categories,...health.status(adapter.id),...(adapter.id==='packs'&&rejected?{rejectedPacks:rejected}:{})}
        :{id:adapter.id,label:adapter.label,type:'image',categories:adapter.categories,state:'disabled',reason:disabledReason(adapter.id)}),
    ]
  }
  return {search,details,thumbnail,insert,credits,status}
}
