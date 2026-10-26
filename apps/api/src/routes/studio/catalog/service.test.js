import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { createStudioCatalog } from './service.js'
import { StudioError } from '../../../../../shared/studio/document.js'
import { iconGeometry } from './vector.js'

const id='00000000-0000-4000-8000-000000000001',design='00000000-0000-4000-8000-000000000002'
const row={id,title:'Foto sintética',creator:'Autor de prueba',license:'by',license_version:'4.0',foreign_landing_url:'https://example.com/photo',url:'https://upload.wikimedia.org/fixture/photo.png',thumbnail:'https://upload.wikimedia.org/fixture/thumb.png',width:32,height:24}
function fixture(overrides={}) {
  const state={allowed:true,edit:true,uploads:0,requests:0,bytes:null,row:{...row},response:null}
  const access={member:async(company,actor,permission)=>{if(!state.allowed||company!=='company-a'||actor!=='actor-a'||permission===state.deniedPermission)throw new StudioError('Denied',403)},get:async(_c,_a,_d,_db,edit)=>{if(edit&&!state.edit)throw new StudioError('Viewer',404);return{}},assets:async()=>({ids:[]})}
  const network={get:async(url)=>{state.requests++;if(overrides.get)return overrides.get(url,state);if(url.includes('upload.wikimedia.org'))return{bytes:state.bytes,mime:'image/png'};return{mime:'application/json',bytes:Buffer.from(JSON.stringify(url.includes('/collections?')?{tabler:{license:{spdx:'MIT'}}}:state.response??(url.includes('/search?')?{icons:['tabler:star']}:url.includes('/tabler.json')?{prefix:'tabler',width:24,height:24,icons:{star:{body:'<path fill="none" stroke="currentColor" d="M2 2L22 22"/>'}}}:state.row)))}}}
  const filesService={upload:async({file,fields})=>{state.uploads++;assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),state.bytes);assert.equal(fields.visibility,'PRIVATE');assert.equal(fields.metadata.studioSource.license,'CC-BY-4.0');return{id,originalName:'fixture.png'}},getById:async()=>{if(state.candidate&&!state.fileDenied)return state.candidate;throw new StudioError('Inaccessible',403)}}
  const supabaseAdmin={storage:{from:()=>({download:async()=>({data:new Blob([state.storedBytes])})})}}
  return{state,service:createStudioCatalog({prisma:{$queryRaw:async()=>state.candidate?[{id}]:[]},access,network,filesService,supabaseAdmin})}
}
test('strict Iconify geometry accepts primitives, rejects executable/recursive/reference content and malformed path data',()=>{
  assert.equal(iconGeometry('<g fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8"/><rect x="2" y="2" width="8" height="8" rx="2"/></g>').paths.length,2)
  for(const body of ['<script/>','<foreignObject/>','<use href="#x"/>','<path style="fill:red" d="M1 1L2 2"/>','<path onload="alert(1)" d="M1 1L2 2"/>','<path fill="url(x)" d="M1 1L2 2"/>','<path d="M1 1L2"/>','<!DOCTYPE svg>','<path d="M1 1L2 2"/><g>'])assert.throws(()=>iconGeometry(body))
})
test('authorization precedes cache hits and scopes by company and actor; viewer cannot import',async()=>{
  const{state,service}=fixture()
  await service.search('company-a','actor-a','iconify',{q:'star'});await service.search('company-a','actor-a','iconify',{q:'star'})
  assert.equal(state.requests,2)
  for(const company of ['company-b','company-a']){state.allowed=company!=='company-a';await assert.rejects(service.search(company,'actor-a','iconify',{q:'star'}),{status:403})}
  state.allowed=true;state.edit=false;await assert.rejects(service.insert('company-a','actor-a','iconify','tabler:star',design,{}),{status:404})
  assert.equal(state.requests,2);assert.equal(state.uploads,0)
})
test('Iconify pages use limit as end index (start < limit) and stop at the API maximum',async()=>{
  const ranges=[]
  const{service}=fixture({get:async value=>{
    const url=new URL(value)
    if(url.pathname==='/collections')return{mime:'application/json',bytes:Buffer.from(JSON.stringify({tabler:{license:{spdx:'MIT'}}}))}
    ranges.push([Number(url.searchParams.get('start')),Number(url.searchParams.get('limit'))])
    return{mime:'application/json',bytes:Buffer.from(JSON.stringify({icons:Array.from({length:32},(_,i)=>`tabler:icon-${i}`)}))}
  }})
  assert.equal((await service.search('company-a','actor-a','iconify',{q:'star',page:2})).pagination.hasNext,true)
  assert.equal((await service.search('company-a','actor-a','iconify',{q:'star',page:31})).pagination.hasNext,false)
  assert.deepEqual(await service.search('company-a','actor-a','iconify',{q:'star',page:32}),{data:[],pagination:{page:32,hasNext:false},collections:(await service.search('company-a','actor-a','iconify',{q:'star',page:33})).collections})
  assert.deepEqual(ranges,[[32,64],[960,992]])
})
test('Openverse search respects anonymous page size and preserves filters and pagination',async()=>{
  const pages=[]
  const{state,service}=fixture({get:async value=>{
    const url=new URL(value)
    assert.equal(url.origin,'https://api.openverse.org')
    assert.equal(url.pathname,'/v1/images/')
    assert.equal(url.searchParams.get('q'),'perro')
    assert.equal(url.searchParams.get('page_size'),'20')
    assert.equal(url.searchParams.get('license'),'cc0,pdm,by')
    assert.equal(url.searchParams.get('license_type'),'commercial,modification')
    assert.equal(url.searchParams.get('mature'),'false')
    assert.equal(url.searchParams.has('collection'),false)
    pages.push(Number(url.searchParams.get('page')))
    return{mime:'application/json',bytes:Buffer.from(JSON.stringify({results:[row],page_count:2}))}
  }})
  for(const page of [1,2]){
    const result=await service.search('company-a','actor-a','openverse',{q:'perro',page,collection:'tabler'})
    assert.equal(result.data.length,1)
    assert.deepEqual(result.pagination,{page,hasNext:page===1})
  }
  assert.deepEqual(pages,[1,2]);assert.equal(state.uploads,0)
})

test('photo import preserves original bytes and server provenance; searches never upload',async()=>{
  const{state,service}=fixture();state.bytes=await sharp({create:{width:32,height:24,channels:3,background:'#d946ef'}}).png().toBuffer()
  state.response={results:[row,{...row,license:'by-nc'}],page_count:2}
  const results=await service.search('company-a','actor-a','openverse',{q:'synthetic'});assert.equal(results.data.length,1);assert.equal(state.uploads,0)
  state.response=null;const before=state.requests
  await service.thumbnail('company-a','actor-a','openverse',id);assert.equal(state.requests,before+1) // No redundant metadata request for each thumbnail.
  state.response=null;const result=await service.insert('company-a','actor-a','openverse',id,design,{})
  assert.equal(result.file.id,id);assert.equal(result.resource.author,'Autor de prueba');assert.equal(state.uploads,1)
})
test('unknown licenses, private URLs, malformed responses, missing resources and huge images fail closed',async()=>{
  for(const patch of [{license:'by-nd'},{url:'https://127.0.0.1/image.png'},{width:100000},{license_version:'999'}]){
    const{state,service}=fixture();state.row={...row,...patch};await assert.rejects(service.insert('company-a','actor-a','openverse',id,design,{}));assert.equal(state.uploads,0)
  }
  const{state,service}=fixture();state.bytes=Buffer.alloc(10*1024*1024+1)
  await assert.rejects(service.insert('company-a','actor-a','openverse',id,design,{}),{status:413});assert.equal(state.uploads,0)
  state.response={icons:'malformed'};await assert.rejects(service.search('company-a','actor-a','iconify',{q:'bad'}),{status:502})
  const missing=fixture({get:async()=>{throw new StudioError('Removed',404)}});await assert.rejects(missing.service.details('company-a','actor-a','openverse',id),{status:404})
})
test('SVG disguised as an allowed raster MIME is rejected before image decoding or Files upload',async()=>{
  const{state,service}=fixture();state.bytes=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/><image href="file:///etc/passwd"/></svg>')
  await assert.rejects(service.insert('company-a','actor-a','openverse',id,design,{}),{status:400});assert.equal(state.uploads,0)
})
test('revocation while downloading blocks upload and insertion; provider failures preserve no persistent state',async()=>{
  const bytes=await sharp({create:{width:32,height:24,channels:3,background:'#ffffff'}}).png().toBuffer()
  const{state,service}=fixture({get:async(url,state)=>{if(url.includes('upload.wikimedia.org')){state.edit=false;return{bytes,mime:'image/png'}}return{bytes:Buffer.from(JSON.stringify(row)),mime:'application/json'}}})
  await assert.rejects(service.insert('company-a','actor-a','openverse',id,design,{}),{status:404});assert.equal(state.uploads,0)
  for(const status of [429,502,504]){const failed=fixture({get:async()=>{throw new StudioError('Unavailable',status)}});await assert.rejects(failed.service.search('company-a','actor-a','openverse',{q:'photo'}),{status});assert.equal(failed.state.uploads,0)}
})
test('dedup never trusts client-editable metadata without checking actual Storage bytes and Files access',async()=>{
  const{state,service}=fixture();state.bytes=await sharp({create:{width:32,height:24,channels:3,background:'#ffffff'}}).png().toBuffer()
  const source=await service.details('company-a','actor-a','openverse',id)
  state.candidate={id,enabled:true,entityId:'company-a',mimeType:'image/png',sizeBytes:state.bytes.length,metadata:{studioSource:source},bucket:'fixture',objectKey:'fixture.png'}
  state.storedBytes=Buffer.from(state.bytes)
  await service.insert('company-a','actor-a','openverse',id,design,{});assert.equal(state.uploads,0)
  state.storedBytes[0]=0
  await service.insert('company-a','actor-a','openverse',id,design,{});assert.equal(state.uploads,1)
  state.storedBytes=Buffer.from(state.bytes);state.fileDenied=true
  await service.insert('company-a','actor-a','openverse',id,design,{});assert.equal(state.uploads,2)
  state.deniedPermission='files.assets.create'
  await assert.rejects(service.insert('company-a','actor-a','openverse',id,design,{}),{status:403});assert.equal(state.uploads,2)
})
test('image decoding concurrency is bounded separately from metadata requests',async()=>{
  const{state,service}=fixture({get:async(url,state)=>url.includes('upload.wikimedia.org')?{mime:'image/png',bytes:state.bytes}:
    {mime:'application/json',bytes:Buffer.from(JSON.stringify({...row,id:url.split('/').filter(Boolean).at(-1)}))}})
  state.bytes=await sharp({create:{width:32,height:24,channels:3,background:'#ffffff'}}).png().toBuffer()
  const results=await Promise.allSettled(['00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013'].map(id=>service.insert('company-a','actor-a','openverse',id,design,{})))
  assert.equal(results.filter(row=>row.status==='fulfilled').length,2)
  assert.equal(results.find(row=>row.status==='rejected').reason.status,429)
})
