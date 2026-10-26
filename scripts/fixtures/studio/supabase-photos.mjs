import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
const sharp=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('sharp')

// Real Auth, Studio router, Files and Storage on the disposable project only.
export async function verifyStudioPhotos(stack,{users,companies}) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const [owner,,peer,foreign]=users,[company,other]=companies,checks=[]
  const tokens=await Promise.all([owner,peer,foreign].map(async user=>{
    const response=await fetch(`${stack.urls.api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})})
    assert.equal(response.status,200);return(await response.json()).data.access_token
  }))
  const headers=(user=0,companyId=company.id)=>({Authorization:`Bearer ${tokens[user]}`,'X-Runly-Company-Id':companyId})
  const api=(path,{user=0,companyId=company.id,data,body,method=data?'POST':'GET'}={})=>fetch(`${stack.urls.api}${path}`,{
    method,headers:{...headers(user,companyId),...(data?{'Content-Type':'application/json'}:{})},body:body??(data?JSON.stringify(data):undefined)})
  const json=async response=>{const body=await response.json();assert.ok(response.ok,`${response.status}: ${JSON.stringify(body)}`);return body.data}
  const original=await sharp({create:{width:2400,height:1200,channels:4,background:'#14b8a6'}}).png().toBuffer()
  const upload=new FormData();upload.set('file',new File([original],'synthetic-photo.png',{type:'image/png'}));upload.set('moduleKey','runly.files');upload.set('entityType','AtlasFile')
  const source=await json(await api('/files/upload',{method:'POST',body:upload}))
  let doc=appendObject(blankDocument(800,600),'image',{fileAssetId:source.id,image:{mask:'star',offsetX:0.1,rotation:25,zoom:1.4,adjustments:{grayscale:true}},x:80,y:80,width:300,height:250})
  const record=await json(await api('/studio/designs',{data:{name:'Fotografía sintética',document:doc}})),path=`/studio/designs/${record.id}`
  assert.deepEqual(record.document,doc)
  await json(await api(`${path}/collaborators`,{method:'PUT',data:{userId:peer.id,role:'EDITOR'}}))
  const copyPath=`${path}/assets/${source.id}/edited-copy`
  const edited=await sharp(original).rotate(90).png().toBuffer()
  const form=()=>{const f=new FormData();f.set('file',new File([edited],'edited.png',{type:'image/png'}));return f}
  const result=await json(await api(copyPath,{user:1,method:'POST',body:form()}))
  assert.notEqual(result.id,source.id);assert.equal(result.width,1200);assert.equal(result.height,2400)
  const assets=(await stack.pool.query('SELECT id,uploaded_by_id,entity_id,visibility,access_scope,bucket,object_key FROM file_asset WHERE id=ANY($1::uuid[])',[[source.id,result.id]])).rows
  const originalAsset=assets.find(row=>row.id===source.id),copy=assets.find(row=>row.id===result.id)
  assert.equal(copy.uploaded_by_id,peer.id);assert.equal(copy.entity_id,company.id);assert.equal(copy.visibility,'PRIVATE');assert.equal(copy.access_scope,'RESTRICTED')
  const bytes=await stack.pool.query('SELECT id,object_key FROM file_asset WHERE id=$1',[source.id]);assert.equal(bytes.rows[0].object_key,originalAsset.object_key)
  const signed=await json(await api(`${path}/assets/${source.id}/signed-url`,{user:1}))
  assert.deepEqual(Buffer.from(await(await fetch(signed.signedUrl)).arrayBuffer()),original)
  checks.push('Real editor collaborator creates a new private restricted FileAsset; original bytes and ownership unchanged')
  doc={...doc,objects:doc.objects.map(o=>({...o,fileAssetId:result.id}))}
  const updated=await json(await api(path,{user:1,method:'PUT',data:{name:record.name,document:doc,revision:record.revision}}))
  const reopened=await json(await api(path,{user:1}));assert.deepEqual(reopened.document,doc);assert.equal(reopened.revision,updated.revision)
  const live=await json(await api(`${path}/live`,{data:{sessionId:'photo-owner-session-001',peek:true}}));assert.equal(live.revision,updated.revision)
  const freshCopy=await json(await api(`${path}/assets/${result.id}/signed-url`))
  assert.deepEqual(Buffer.from(await(await fetch(freshCopy.signedUrl)).arrayBuffer()),edited)
  checks.push('Save/reopen retains v4 masks and adjustments; owner and collaborator resolve new pixels; realtime revision agrees')
  assert.equal((await api(`${path}/assets/${result.id}/edited-copy`,{user:2,companyId:other.id,method:'POST',body:form()})).status,404)
  await json(await api(`${path}/collaborators`,{method:'PUT',data:{userId:peer.id,role:'VIEWER'}}))
  assert.equal((await api(`${path}/assets/${result.id}/edited-copy`,{user:1,method:'POST',body:form()})).status,404)
  await json(await api(`${path}/collaborators`,{method:'PUT',data:{userId:peer.id,role:'EDITOR'}}))
  await stack.pool.query("DELETE FROM role_permission WHERE role_id=$1 AND permission_id=(SELECT id FROM permission WHERE key='files.assets.create')",[company.roleId])
  assert.equal((await api(`${path}/assets/${result.id}/edited-copy`,{user:1,method:'POST',body:form()})).status,403)
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key='files.assets.create'",[company.roleId])
  const malformed=new FormData();malformed.set('file',new File(['<svg/>'],'bad.png',{type:'image/png'}))
  assert.equal((await api(`${path}/assets/${result.id}/edited-copy`,{user:1,method:'POST',body:malformed})).status,400)
  checks.push('Real cross-company, reader, revoked Files permission and MIME-spoof requests fail')
  return {checks}
}
