import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { FILE_ID, StudioError, validateDocument } from '../../../../../shared/studio/document.js'
import { ICON_COLLECTIONS, iconSource, openverseLicense } from '../../../../../shared/studio/licenses.js'
import { catalogUrl, createCatalogNetwork } from './network.js'
import { createCatalogCache } from './cache.js'
import { iconGeometry } from './vector.js'
import { createLocalCatalogFixtureNetwork } from './test-network.js'
import { isStudioRaster } from '../image-format.js'

const MAX_BYTES=10*1024*1024, MIME={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}
const ICONIFY_PAGES=31
// Openverse anonymous searches allow at most 20 results per page.
const OPENVERSE_PAGE_SIZE=20
// Illustrations are a separate Openverse category; photos exclude them so each tab stays coherent.
const OPENVERSE_CATEGORIES=['photograph','illustration','digitized_artwork']
const text=(value,max=200)=>typeof value==='string'?value.slice(0,max):''
const sourceUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href.slice(0,2048):''}catch{return ''}}
const unavailable=()=>{throw new StudioError('El proveedor devolvió un recurso no compatible.',502)}
function photo(row) {
  const license=openverseLicense(row)
  if(!row||typeof row.id!=='string'||!FILE_ID.test(row.id)||!license||!sourceUrl(row.foreign_landing_url))return null
  try{catalogUrl(row.url);catalogUrl(row.thumbnail)}catch{return null}
  if(!Number.isFinite(row.width)||!Number.isFinite(row.height)||row.width<1||row.height<1||row.width*row.height>25_000_000)return null
  return {provider:'openverse',id:row.id,type:'image',title:text(row.title)||'Fotografía',author:text(row.creator)||'Autor no indicado',
    license:license.id,licenseUrl:license.url,sourceUrl:sourceUrl(row.foreign_landing_url),attributionRequired:license.attributionRequired,
    width:row.width,height:row.height,available:true}
}

// Provider operations share authentication, quotas and bounded metadata caching.
// Browser input is an ID/query, never a URL. Originals only enter Files on import.
export function createStudioCatalog({prisma,access,filesService,supabaseAdmin,network=createCatalogNetwork(),clock=Date.now}) {
  if(process.env.STUDIO_CATALOG_TEST_PROJECT)network=createLocalCatalogFixtureNetwork(prisma,process.env.STUDIO_CATALOG_TEST_PROJECT)
  const cache=createCatalogCache({clock,ttl:5*60000,maxEntries:400}),rates=new Map(),imports=new Set();let decoding=0
  // Public thumbnails are cached as base64 (PNG, ~256px) so re-renders and other users do not hit the provider again.
  const thumbs=createCatalogCache({clock,ttl:15*60000,maxEntries:300,maxBytes:24*1024*1024})
  async function decode(task) {
    if(decoding>=2)throw new StudioError('Hay imágenes procesándose. Espera antes de reintentar.',429)
    decoding++
    try{return await task()}finally{decoding--}
  }
  async function authorize(companyId,actorId,editId,upload=false) {
    await access.member(companyId,actorId,editId?'studio.edit':'studio.view')
    if(editId)await access.get(companyId,actorId,editId,prisma,true)
    if(upload){await access.member(companyId,actorId,'files.assets.read');await access.member(companyId,actorId,'files.assets.create')}
  }
  // Thumbnails use their own lane: a page of results fires ~20 of them and must not exhaust the search quota.
  const lanes={api:{limit:100,concurrent:4,running:0},thumb:{limit:1200,concurrent:8,running:0}}
  async function work(companyId,actorId,action,laneName='api') {
    await authorize(companyId,actorId)
    const lane=lanes[laneName],now=clock(),key=`${companyId}:${actorId}:${laneName}`
    for(const[k,v]of rates)if(v.until<=now)rates.delete(k)
    if(!rates.has(key)){if(rates.size>=512)throw new StudioError('Catálogo ocupado. Reintenta más tarde.',429);rates.set(key,{count:0,until:now+60000})}
    if(++rates.get(key).count>lane.limit||lane.running>=lane.concurrent)throw new StudioError('Demasiadas consultas. Espera antes de reintentar.',429)
    lane.running++
    try{const result=await action(`${companyId}:${actorId}`);await authorize(companyId,actorId);return result}finally{lane.running--}
  }
  // Openverse and its thumbnail proxy intermittently answer 502/504; one retry clears most of them.
  async function fetchRetry(url,options) {
    try{return await network.get(url,options)}
    catch(error){
      if(![502,504].includes(error?.status))throw error
      return network.get(url,options)
    }
  }
  async function json(url) {
    const response=await fetchRetry(url,{maxBytes:262144})
    if(response.mime!=='application/json')unavailable()
    try{return JSON.parse(response.bytes.toString('utf8'))}catch{unavailable()}
  }
  function provider(value){if(!['iconify','openverse'].includes(value))throw new StudioError('Proveedor no disponible.',404);return value}
  function checkedId(p,id){provider(p);if(p==='iconify'?!iconSource(id):!FILE_ID.test(id))throw new StudioError('Recurso no encontrado.',404);return id}
  async function approvedCollection(prefix,fresh=false) {
    const key=`license:${prefix}`
    if(!fresh&&cache.get(key))return
    const metadata=await json(`https://api.iconify.design/collections?prefix=${prefix}`)
    if(metadata?.[prefix]?.license?.spdx!==(prefix==='tabler'?'MIT':'ISC'))throw new StudioError('La licencia actual de esta colección necesita revisión.',403)
    cache.set(key,{approved:true})
  }
  async function original(p,id,freshLicense=false,scope) {
    checkedId(p,id)
    if(p==='iconify') {
      const[prefix,name]=id.split(':')
      await approvedCollection(prefix,freshLicense)
      const row=await json(`https://api.iconify.design/${prefix}.json?icons=${encodeURIComponent(name)}`)
      if(row?.prefix!==prefix||!row.icons||Object.keys(row.icons).length>1||!row.icons[name])throw new StudioError('El icono ya no está disponible.',404)
      const icon=row.icons[name]
      // Aliases, transforms and additional SVG features are intentionally excluded.
      if(icon.rotate||icon.hFlip||icon.vFlip||icon.left||icon.top)unavailable()
      let geometry
      try{geometry=iconGeometry(icon.body,icon.width??row.width??16,icon.height??row.height??16)}catch{unavailable()}
      return {resource:{...iconSource(id),width:geometry.width,height:geometry.height},geometry}
    }
    const key=scope?`${scope}:original:openverse:${id}`:null
    if(key&&!freshLicense){const hit=cache.get(key);if(hit)return hit}
    const raw=await json(`https://api.openverse.org/v1/images/${encodeURIComponent(id)}/`),resource=photo(raw)
    if(!resource||resource.id!==id)throw new StudioError('La licencia o el origen de esta fotografía no están admitidos.',403)
    const result={resource,originalUrl:raw.url,thumbnailUrl:raw.thumbnail}
    if(key)cache.set(key,result)
    return result
  }
  async function search(companyId,actorId,p,query={}) {
    provider(p)
    const q=text(query.q,80).trim(),page=Math.max(1,Math.min(100,Number.parseInt(query.page,10)||1)),collection=query.collection??'tabler'
    const category=OPENVERSE_CATEGORIES.includes(query.category)?query.category:''
    if(p==='iconify'&&!ICON_COLLECTIONS.some(row=>row.id===collection))throw new StudioError('Colección no disponible.',400)
    return work(companyId,actorId,async scope=>{
      const key=JSON.stringify([scope,p,q,page,collection,category]),hit=cache.get(key);if(hit)return hit
      let data,hasNext
      if(!q) return {data:[],pagination:{page,hasNext:false},collections:p==='iconify'?ICON_COLLECTIONS:[],requiresQuery:true}
      if(p==='iconify') {
        await approvedCollection(collection)
        // Iconify's limit is the end index (start must stay below it, max 999), not a page size.
        if(page>ICONIFY_PAGES)return {data:[],pagination:{page,hasNext:false},collections:ICON_COLLECTIONS}
        const response=await json(`https://api.iconify.design/search?${new URLSearchParams({query:q,prefix:collection,limit:String(page*32),start:String((page-1)*32)})}`)
        if(!Array.isArray(response?.icons)||response.icons.length>32)unavailable()
        data=response.icons.map(iconSource).filter(row=>row&&row.id.startsWith(`${collection}:`));hasNext=response.icons.length===32&&page<ICONIFY_PAGES
      }else{
        // Only raster formats can be imported; skipping SVG/GIF avoids results that fail at insert time.
        const params={q,page:String(page),page_size:String(OPENVERSE_PAGE_SIZE),license:'cc0,pdm,by',license_type:'commercial,modification',mature:'false',extension:'jpg,jpeg,png,webp'}
        if(category)params.category=category
        const response=await json(`https://api.openverse.org/v1/images/?${new URLSearchParams(params)}`)
        if(!Array.isArray(response?.results)||response.results.length>OPENVERSE_PAGE_SIZE)unavailable()
        data=response.results.flatMap(raw=>{
          const resource=photo(raw);if(!resource)return[]
          cache.set(`${scope}:original:openverse:${resource.id}`,{resource,originalUrl:raw.url,thumbnailUrl:raw.thumbnail})
          return[resource]
        });hasNext=Number.isInteger(response.page_count)&&page<response.page_count
      }
      const result={data,pagination:{page,hasNext},collections:p==='iconify'?ICON_COLLECTIONS:[]};cache.set(key,result);return result
    })
  }
  async function details(companyId,actorId,p,id) {
    checkedId(p,id)
    return work(companyId,actorId,async scope=>{
      const key=`${scope}:${p}:${id}`,hit=cache.get(key);if(hit)return hit
      const row=await original(p,id,false,scope),result={...row.resource,...(row.geometry?{geometry:row.geometry}:{})};cache.set(key,result);return result
    })
  }
  async function thumbnail(companyId,actorId,p,id) {
    checkedId(p,id)
    return work(companyId,actorId,async scope=>{
      const cached=thumbs.get(`${p}:${id}`)
      if(cached)return Buffer.from(cached,'base64')
      const row=await original(p,id,false,scope)
      if(row.geometry) {
        const{width,height,paths}=row.geometry
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.map(path=>`<path d="${path.d}" fill="${path.fill==='color'?'#262626':'none'}" stroke="${path.stroke==='color'?'#262626':'none'}" stroke-width="${path.strokeWidth}" stroke-linecap="${path.cap}" stroke-linejoin="${path.join}"/>`).join('')}</svg>`
        return sharp(Buffer.from(svg)).resize(128,128,{fit:'inside'}).png().toBuffer()
      }
      let response
      try{response=await fetchRetry(row.thumbnailUrl,{maxBytes:MAX_BYTES})}
      catch(error){
        // The provider's thumbnail proxy is the flaky part; fall back to the (larger) original and shrink it here.
        if(![502,504].includes(error?.status))throw error
        response=await network.get(row.originalUrl,{maxBytes:MAX_BYTES,timeoutMs:25000})
      }
      const png=await decode(async()=> (await checkedImage(response)).processor.rotate().resize(256,256,{fit:'inside',withoutEnlargement:true}).png().toBuffer())
      thumbs.set(`${p}:${id}`,png.toString('base64'))
      return png
    },'thumb')
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
  async function insert(companyId,actorId,p,id,designId,context) {
    checkedId(p,id);if(typeof designId!=='string'||!FILE_ID.test(designId))throw new StudioError('Diseño no encontrado.',404)
    await authorize(companyId,actorId,designId,p==='openverse')
    return work(companyId,actorId,async scope=>{
      const key=`${scope}:${p}:${id}`
      if(imports.has(key))throw new StudioError('Este recurso se está importando. Espera un momento.',429)
      imports.add(key)
      try {
        const row=await original(p,id,true,scope) // Never trust a cached or client supplied license on import.
        if(p==='iconify'){await authorize(companyId,actorId,designId);return {resource:row.resource,object:{type:'vector',iconId:id,geometry:row.geometry,width:160,height:160*row.geometry.height/row.geometry.width}}}
        const response=await fetchRetry(row.originalUrl,{maxBytes:MAX_BYTES,timeoutMs:30000}),{metadata}=await decode(()=>checkedImage(response))
        await authorize(companyId,actorId,designId,true)
        const hash=createHash('sha256').update(response.bytes).digest('hex')
        const [existing]=await prisma.$queryRaw`SELECT id FROM file_asset WHERE entity_id=${companyId}::uuid AND uploaded_by_id=${actorId}::uuid AND enabled
          AND metadata->'studioSource'->>'provider'='openverse' AND metadata->'studioSource'->>'id'=${id} AND metadata->>'studioSha256'=${hash} LIMIT 1`
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
          file=await filesService.upload({...context,file:new File([response.bytes],`studio-${id}.${metadata.format==='jpeg'?'jpg':metadata.format}`,{type:response.mime}),
            fields:{moduleKey:'runly.files',entityType:'AtlasFile',visibility:'PRIVATE',metadata:{studioSource:row.resource,studioSha256:hash}}})
        }
        await authorize(companyId,actorId,designId,true)
        return {resource:row.resource,file:{id:file.id,name:file.originalName,width:metadata.width,height:metadata.height}}
      }finally{imports.delete(key)}
    })
  }
  async function credits(companyId,actorId,designId,input,context) {
    const document=validateDocument(input)
    await authorize(companyId,actorId);await access.get(companyId,actorId,designId)
    const {ids}=await access.assets(prisma,companyId,actorId,document,designId,context)
    const rows=ids.length?await prisma.$queryRaw`SELECT metadata->'studioSource' AS source FROM file_asset WHERE id=ANY(${ids}::uuid[]) AND entity_id=${companyId}::uuid AND enabled`:[]
    await access.get(companyId,actorId,designId)
    return [...document.objects.filter(o=>o.type==='vector').map(o=>o.svgName?{provider:'local-svg',id:o.id,title:o.svgName,license:'Licencia no declarada',licenseUrl:null,sourceUrl:null,attributionRequired:true}:iconSource(o.iconId)),...rows.map(row=>row.source).filter(row=>row?.provider==='openverse'&&typeof row.id==='string'&&FILE_ID.test(row.id))]
  }
  return {search,details,thumbnail,insert,credits}
}
