import assert from 'node:assert/strict'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
import {DEFAULT_GRADIENT} from '../../../apps/shared/studio/gradient.js'

export async function verifyStudioGradients(stack,{users,companies}) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const [owner,denied,peer,foreign]=users,[company,other]=companies,checks=[]
  const tokens=await Promise.all([owner,denied,peer,foreign].map(async user=>{
    const r=await fetch(`${stack.urls.api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})})
    assert.equal(r.status,200);return(await r.json()).data.access_token
  }))
  const api=(path,{user=0,companyId=company.id,data,method=data?'POST':'GET'}={})=>fetch(`${stack.urls.api}${path}`,{method,headers:{Authorization:`Bearer ${tokens[user]}`,'X-Runly-Company-Id':companyId,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined})
  const json=async r=>{const b=await r.json();assert.ok(r.ok,`${r.status}: ${JSON.stringify(b)}`);return b.data}
  let doc=appendObject(blankDocument(640,480),'rectangle',{x:20,y:20,width:300,height:200,rotation:20,opacity:0.6,fillPaint:DEFAULT_GRADIENT})
  doc.page.backgroundPaint={type:'gradient',gradientType:'radial',centerX:0.5,centerY:0.5,radius:1,stops:DEFAULT_GRADIENT.stops}
  doc=appendObject(doc,'text',{text:'Synthetic gradient',x:40,y:250,fill:'#ffffff',fontSize:24})
  const record=await json(await api('/studio/designs',{data:{name:'Synthetic v6 gradient',document:doc}})),root=`/studio/designs/${record.id}`
  assert.deepEqual(record.document,doc)
  const list=await json(await api('/studio/designs?q=Synthetic%20v6'))
  assert.deepEqual(list[0].preview.page,doc.page);assert.deepEqual(list[0].preview.objects[0].fillPaint,doc.objects[0].fillPaint)
  assert.equal((await api(root,{user:1})).status,403);assert.equal((await api(root,{user:3,companyId:other.id})).status,404)
  await json(await api(`${root}/collaborators`,{method:'PUT',data:{userId:peer.id,role:'EDITOR'}}))
  const edited={...doc,objects:doc.objects.map(o=>o.type==='rectangle'?{...o,fillPaint:{...DEFAULT_GRADIENT,angle:135}}:o)}
  const saved=await json(await api(root,{user:2,method:'PUT',data:{name:record.name,revision:record.revision,document:edited}}))
  assert.deepEqual(saved.document,edited)
  assert.equal((await api(root,{method:'PUT',data:{name:record.name,revision:record.revision,document:doc}})).status,409)
  await json(await api(`${root}/collaborators`,{method:'PUT',data:{userId:peer.id,role:null}}))
  assert.equal((await api(root,{user:2})).status,404)
  checks.push('v6 real HTTP/Postgres create/list/reopen, gradient projections, peer revision write, 409, RBAC/company isolation/revocation')
  let template=await json(await api('/studio/templates',{data:{name:'Synthetic gradient template',designId:record.id}}))
  assert.deepEqual(template.document,edited)
  const personal=await json(await api(`/studio/templates/${template.id}/use`,{data:{name:'Synthetic personal gradient copy'}}));assert.deepEqual(personal.document,edited)
  template=await json(await api(`/studio/templates/${template.id}/publish`,{data:{revision:template.revision}}))
  const companyCopy=await json(await api(`/studio/templates/${template.id}/use`,{user:2,data:{name:'Synthetic company gradient copy'}}))
  assert.deepEqual(companyCopy.document,edited)
  const templates=await json(await api('/studio/templates?scope=company&q=Synthetic%20gradient'))
  assert.deepEqual(templates.data.find(t=>t.id===template.id).preview.page,edited.page)
  checks.push('Personal/company templates and work copies preserve page/object paint; actual template SQL list projection')
  for(const version of [1,2,3,4,5]){
    const historical={...blankDocument(320,240),schemaVersion:version}
    const legacy=await json(await api('/studio/designs',{data:{name:`Synthetic legacy ${version}`,document:historical}}));assert.equal(legacy.document.schemaVersion,6)
  }
  const malformed={...doc,objects:doc.objects.map(o=>({...o,...(o.fillPaint?{fillPaint:{...o.fillPaint,stops:[o.fillPaint.stops[0],o.fillPaint.stops[0]]}}:{})}))}
  assert.equal((await api(root,{method:'PUT',data:{name:record.name,revision:saved.revision,document:malformed}})).status,400)
  assert.deepEqual((await json(await api(root))).document,edited)
  checks.push('v1-v5 real API upgrades; malformed stop rejection leaves persisted v6 untouched')
  return {checks}
}
