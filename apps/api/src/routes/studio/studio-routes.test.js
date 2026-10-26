import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStudioRouter } from './index.js'
import { StudioError } from '../../../../shared/studio/document.js'
import { createStudioTemplatesService } from './studio-templates-service.js'

test('routes enforce action permissions before invoking the service', async () => {
  let calls = 0
  const service = { list: async () => { calls++; return [] }, create: async () => { calls++; return {} } }
  const requirePermission = key => async (c, next) => key === 'studio.view' ? next() : c.json({ error: 'Sin permiso' }, 403)
  const app = createStudioRouter({ service, requirePermission })
  assert.equal((await app.request('/studio/designs')).status, 200)
  assert.equal((await app.request('/studio/designs', { method: 'POST', body: '{}' })).status, 403)
  assert.equal(calls, 1)
})
test('malformed JSON and oversized bodies are rejected without service writes', async () => {
  let calls = 0
  const service = { create: async () => { calls++; return {} } }
  const app = createStudioRouter({ service, requirePermission: () => async (_, next) => next() })
  assert.equal((await app.request('/studio/designs', { method: 'POST', body: '{' })).status, 400)
  assert.equal((await app.request('/studio/designs', { method: 'POST', body: 'x'.repeat(1_100_001) })).status, 413)
  assert.equal(calls, 0)
})
test('template creation uses a fresh server scene and catalog failures authorize before any network work',async()=>{
  let denied=false,calls=0
  const prisma={$queryRaw:async(strings)=>{await service.access.member();return strings.join('').includes('AS manage')?[{manage:true,publish:false}]:strings.join('').includes('count(*)')?[{total:0}]:[]},$transaction:async fn=>fn(prisma),auditLog:{create:async()=>{}}}
  const service={access:{identity:()=>{},member:async()=>{if(denied)throw new StudioError('Denied',403)},lock:async()=>{},bindAssets:async()=>{},audit:async()=>{}}}
  const raw=prisma.$queryRaw
  prisma.$queryRaw=async(strings,...values)=>strings.join('').includes('INSERT INTO studio_design')?(calls++,[{id:'00000000-0000-4000-8000-000000000001',name:'Copia',revision:1,document:JSON.parse(values.at(-1))}]):raw(strings,...values)
  const templates=createStudioTemplatesService({prisma,designService:service})
  const app=createStudioRouter({prisma,service,templates,requirePermission:key=>async(c,next)=>key==='studio.edit'?c.json({error:'Denied'},403):next()})
  const first=await app.request('/studio/templates/quiet/designs',{method:'POST',body:'{}'});assert.equal(first.status,201)
  const listing=await(await app.request('/studio/templates?q=Un%20momento')).json()
  assert.ok(listing.data.data[0].preview.objects.length>0);assert.equal(calls,1)
  assert.equal((await app.request('/studio/templates/unknown/designs',{method:'POST',body:'{}'})).status,404)
  assert.equal((await app.request('/studio/catalog/iconify/tabler%3Astar/import',{method:'POST',body:'{}'})).status,403)
  denied=true
  assert.equal((await app.request('/studio/catalog/iconify/search?q=star')).status,403)
  assert.equal((await app.request('/studio/templates')).status,403)
})
test('live change batches require studio.edit and reach the service with the design id', async () => {
  const seen = []
  const service = { applyChanges: async (_company, _actor, id, input) => { seen.push([id, input.batchId]); return { revision: 2 } } }
  const deny = createStudioRouter({ service, requirePermission: key => async (c, next) => key === 'studio.edit' ? c.json({ error: 'Sin permiso' }, 403) : next() })
  assert.equal((await deny.request('/studio/designs/d1/changes', { method: 'POST', headers:{'X-Runly-Studio-Protocol':'2'}, body: '{"clientId":"abcdefgh","batchId":1,"ops":[]}' })).status, 403)
  const allow = createStudioRouter({ service, requirePermission: () => async (_, next) => next() })
  const response = await allow.request('/studio/designs/d1/changes', { method: 'POST', headers:{'X-Runly-Studio-Protocol':'2'}, body: '{"clientId":"abcdefgh","batchId":1,"ops":[]}' })
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, { revision: 2 }); assert.deepEqual(seen, [['d1', 1]])
})
test('obsolete writers get 426 before touching the document',async()=>{
  let called=0;const app=createStudioRouter({service:{applyChanges:async()=>{called++},update:async()=>{called++}},requirePermission:()=>async(_,next)=>next()})
  for(const [path,method]of [['/studio/designs/test/changes','POST'],['/studio/designs/test','PUT']])assert.equal((await app.request(path,{method,body:'{}'})).status,426)
  assert.equal(called,0)
})
test('print checks access and revision after expensive processing, including read-only viewers',async()=>{
  let revoked=false,revision=1,builds=0
  const service={access:{get:async()=>{if(revoked)throw new StudioError('revoked',404);return {revision,canEdit:false,document:{objects:[]}}}}}
  const form=()=>{const data=new FormData();data.set('file',new File(['synthetic'],'render.png'));data.set('revision','1');return data}
  const router=builder=>createStudioRouter({service,requirePermission:()=>async(_,next)=>next(),printBuilder:builder})
  const ok=router(async()=>{builds++;return Buffer.from('%PDF synthetic route test')})
  assert.equal((await ok.request('/studio/designs/test/export/print-pdf',{method:'POST',body:form()})).status,200)
  const revoke=router(async()=>{builds++;revoked=true;return Buffer.from('%PDF')})
  assert.equal((await revoke.request('/studio/designs/test/export/print-pdf',{method:'POST',body:form()})).status,404)
  revoked=false
  const changed=router(async()=>{revision++;return Buffer.from('%PDF')})
  assert.equal((await changed.request('/studio/designs/test/export/print-pdf',{method:'POST',body:form()})).status,409)
  assert.equal(builds,2)
})
