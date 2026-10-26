import {test} from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {createStudioImageCopies} from './studio-image-copies.js'
import {StudioError} from '../../../../shared/studio/document.js'
const fileId='00000000-0000-4000-8000-000000000001'
function fixture() {
  const state={allowed:true,uploads:[],failure:false,source:{id:fileId,enabled:true,mimeType:'image/png',metadata:{studioSource:{provider:'openverse',license:'CC-BY-4.0'}}}}
  const access={member:async()=>{if(!state.allowed)throw new StudioError('Denied',403)},get:async(_c,_a,_id,_db,edit)=>{
    assert.equal(edit,true);if(!state.allowed)throw new StudioError('Denied',403)
    return {document:{objects:state.removed?[]:[{type:'image',fileAssetId:fileId}]}}
  }}
  const prisma={fileAsset:{findFirst:async({where})=>{assert.equal(where.entityId,'company');assert.equal(where.enabled,true);return state.source}}}
  const filesService={upload:async input=>{if(state.failure)throw Error('Storage unavailable');state.uploads.push(input);if(state.revoke)state.allowed=false;return {id:'copy',originalName:'copy.png'}}}
  return {state,service:createStudioImageCopies({prisma,access,filesService})}
}
const image=async()=>new File([await sharp({create:{width:32,height:24,channels:4,background:'#d946ef'}}).png().toBuffer()],'copy.png',{type:'image/png'})
test('private copy preserves source/provenance; edits require current membership, Files and design rights',async()=>{
  const {state,service}=fixture(), original=structuredClone(state.source)
  const copy=await service.create('company','editor','design',fileId,await image(),{})
  assert.equal(copy.width,32);assert.equal(copy.height,24);assert.deepEqual(state.source,original)
  assert.equal(state.uploads[0].fields.visibility,'PRIVATE');assert.equal(state.uploads[0].fields.entityType,'AtlasFile')
  assert.deepEqual(state.uploads[0].fields.metadata,{studioEditedFrom:fileId,studioSource:original.metadata.studioSource})
  state.allowed=false;await assert.rejects(service.create('company','viewer','design',fileId,await image(),{}),{status:403})
  assert.equal(state.uploads.length,1)
})
test('removed source, malformed raster, huge files, Storage failure and revocation fail without mutating a design',async()=>{
  const {state,service}=fixture()
  state.removed=true;await assert.rejects(service.create('company','editor','design',fileId,await image(),{}),{status:409});state.removed=false
  await assert.rejects(service.create('company','editor','design',fileId,new File(['<svg/>'],'x.png',{type:'image/png'}),{}),{status:400})
  await assert.rejects(service.create('company','editor','design',fileId,{size:11*1024*1024,type:'image/png',arrayBuffer(){}},{}),{status:413})
  state.failure=true;await assert.rejects(service.create('company','editor','design',fileId,await image(),{}),/Storage/)
  state.failure=false;state.revoke=true;await assert.rejects(service.create('company','editor','design',fileId,await image(),{}),{status:403})
  assert.equal(state.uploads.length,1)
})
