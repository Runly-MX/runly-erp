import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { exportWebsiteTemplate } from '@runly/studio-interchange/website-write'
import { createWebsiteTemplatePreparationService } from '../website-template-preparation-service.js'
import { createWebsiteAccess } from '../website-authorization-service.js'

const require = createRequire(new URL('../../../../../packages/studio-interchange/package.json', import.meta.url))
const sharp = require('sharp')
const companyId='00000000-0000-4000-8000-000000000001',siteId='00000000-0000-4000-8000-000000000002',fileId='00000000-0000-4000-8000-000000000003',actorId='00000000-0000-4000-8000-000000000004'
const catalog=JSON.parse(readFileSync(new URL('../../routes/website/block-catalog.json',import.meta.url),'utf8'))
async function fixture(background = false) {
  const data=await sharp({create:{width:10,height:10,channels:3,background:'#17243c'}}).png().toBuffer()
  const hash=createHash('sha256').update(data).digest('hex')
  const sections=background?[{type:'HeroBlock',props:{background:{kind:'image',url:`asset:${hash}`}}}]:[{type:'ImageBlock',props:{src:`asset:${hash}`,alt:'Imagen original'}}]
  const {bytes}=await exportWebsiteTemplate({title:'Preparación',catalog,pages:[{path:'/',title:'Inicio',isHome:true,sections}],assets:[{data,mime:'image/png',license:'original'}],licenses:[{id:'original',redistribution:'allowed',notice:'Imagen sintética original de la prueba.'}]})
  const file={id:fileId,entityId:siteId,moduleKey:'runly.website',mimeType:'image/png',sizeBytes:data.length,checksum:hash,contentRevision:1,objectKey:'private-original',visibility:'PRIVATE',enabled:true}
  let reads=0
  const prisma={websiteSite:{findFirst:async ({where})=>where.companyId===companyId&&where.id===siteId?{id:siteId,draftRevision:7}:null},fileAsset:{findFirst:async ({where})=>where.id===fileId&&where.entityId===file.entityId?{...file}:null}}
  const access=createWebsiteAccess({companyId,actorId,can:p=>p==='website.pages.create'})
  const service=createWebsiteTemplatePreparationService({prisma,files:{assertAccess:async()=>{}},readFile:async()=>{reads++;return data},builderCatalogs:{'0.3.5':catalog}})
  return {bytes,hash,file,data,prisma,access,service,get reads(){return reads}}
}

test('W1 preparation preserves unbound assets and only emits verified file IDs, never private URLs',async()=>{
  const f=await fixture(),args={bytes:f.bytes,companyId,siteId,access:f.access}
  const pending=await f.service.prepare(args)
  assert.equal(pending.readyForDraft,false)
  assert.deepEqual(pending.missingAssets,[f.hash])
  assert.equal(pending.pages[0].document.blocks['block-1'].props.src,`asset:${f.hash}`)
  const bound=await f.service.prepare({...args,bindings:{[f.hash]:fileId}})
  assert.equal(bound.readyForDraft,true)
  assert.equal(bound.expectedRevision,7)
  assert.equal(bound.pages[0].document.blocks['block-1'].props.src,`file:${fileId}`)
  assert.equal(f.reads,1)
  assert.equal(JSON.stringify(bound).includes('private-original'),false)
  assert.deepEqual(bound.assetBindings,[{sha256:f.hash,fileId,contentRevision:1}])
})

test('W1 preparation names unsupported background materialization instead of claiming runtime readiness',async()=>{
  const f=await fixture(true)
  const r=await f.service.prepare({bytes:f.bytes,companyId,siteId,access:f.access,bindings:{[f.hash]:fileId}})
  assert.equal(r.validation.ok,true)
  assert.equal(r.readyForDraft,false)
  assert.deepEqual(r.requiredCapabilities,['background-file-binding'])
})

test('W1 preparation rejects forged access, foreign sites/assets, changed bytes and stale content',async()=>{
  const f=await fixture(),args={bytes:f.bytes,companyId,siteId,access:f.access,bindings:{[f.hash]:fileId}}
  await assert.rejects(f.service.prepare({...args,access:{...f.access}}),e=>e.status===401)
  await assert.rejects(f.service.prepare({...args,siteId:actorId}),e=>e.status===404)
  f.file.entityId=actorId
  await assert.rejects(f.service.prepare(args),e=>e.status===404)
  f.file.entityId=siteId
  f.file.checksum='a'.repeat(64)
  await assert.rejects(f.service.prepare(args),e=>e.code==='asset_checksum_mismatch')
  f.file.checksum=f.hash
  const changed=createWebsiteTemplatePreparationService({prisma:f.prisma,files:{assertAccess:async()=>{}},readFile:async()=>Buffer.from('tampered'),builderCatalogs:{'0.3.5':catalog}})
  await assert.rejects(changed.prepare(args),e=>e.code==='asset_changed')
  const raced=createWebsiteTemplatePreparationService({prisma:f.prisma,files:{assertAccess:async()=>{}},readFile:async()=>{f.file.contentRevision++;return f.data},builderCatalogs:{'0.3.5':catalog}})
  await assert.rejects(raced.prepare(args),e=>e.code==='asset_changed')
})
