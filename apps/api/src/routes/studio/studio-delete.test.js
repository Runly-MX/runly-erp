import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioService } from './studio-service.js'
import { blankDocument } from '../../../../shared/studio/document.js'
const company='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003'
function fixture({foreign=false,enabled=true}={}) {
  const state={row:{id,name:'Documento privado',ownerId:foreign?'00000000-0000-4000-8000-000000000004':owner,revision:3,enabled,document:blankDocument()},audit:[],queries:[]}
  const prisma={$transaction:async work=>work(prisma),auditLog:{create:async({data})=>state.audit.push(data)},$queryRaw:async(strings)=>{
    const sql=strings.join('?');state.queries.push(sql)
    if(sql.includes('FROM studio_design d JOIN user_profile'))return state.row.enabled?[structuredClone(state.row)]:[]
    if(sql.includes('UPDATE studio_design SET enabled=false')){if(!state.row.enabled)return[];state.row.enabled=false;state.row.revision++;return[structuredClone(state.row)]}
    return[]
  }}
  return {state,service:createStudioService({prisma})}
}
test('owner retirement keeps the row/document and audits the resulting revision exactly once',async()=>{
  const{state,service}=fixture(),document=structuredClone(state.row.document)
  const result=await service.remove(company,owner,id,{revision:3})
  assert.equal(result.enabled,false);assert.equal(result.revision,4);assert.deepEqual(state.row.document,document)
  assert.equal(state.audit.length,1);assert.equal(state.audit[0].action,'studio.design.delete');assert.equal(state.audit[0].metadata.revision,4)
  assert.equal(state.queries.some(query=>/DELETE FROM (file_asset|studio_design_asset|studio_collaborator|studio_template)/.test(query)),false)
  await assert.rejects(service.remove(company,owner,id,{revision:4}),{status:404});assert.equal(state.audit.length,1)
})
test('a collaborator and a stale revision cannot retire or audit a design',async()=>{
  const foreign=fixture({foreign:true});await assert.rejects(foreign.service.remove(company,owner,id,{revision:3}),{status:403})
  const stale=fixture();await assert.rejects(stale.service.remove(company,owner,id,{revision:2}),{status:409,code:'STUDIO_REVISION_CONFLICT'})
  for(const f of [foreign,stale]){assert.equal(f.state.row.enabled,true);assert.equal(f.state.audit.length,0)}
})
