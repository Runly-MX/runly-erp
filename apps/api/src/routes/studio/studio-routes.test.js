import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStudioRouter } from './index.js'
import { StudioError } from '../../../../shared/studio/document.js'

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
  const service={access:{member:async()=>{if(denied)throw new StudioError('Denied',403)}},create:async(_company,_actor,input)=>{calls++;input.document.objects[0].fill='#000000';return input}}
  const app=createStudioRouter({service,requirePermission:key=>async(c,next)=>key==='studio.edit'?c.json({error:'Denied'},403):next()})
  const first=await app.request('/studio/templates/quiet/designs',{method:'POST',body:'{}'});assert.equal(first.status,201)
  const listing=await(await app.request('/studio/templates?q=Un%20momento')).json()
  assert.notEqual(listing.data.data[0].document.objects[0].fill,'#000000');assert.equal(calls,1)
  assert.equal((await app.request('/studio/templates/unknown/designs',{method:'POST',body:'{}'})).status,404)
  assert.equal((await app.request('/studio/catalog/iconify/tabler%3Astar/import',{method:'POST',body:'{}'})).status,403)
  denied=true
  assert.equal((await app.request('/studio/catalog/iconify/search?q=star')).status,403)
  assert.equal((await app.request('/studio/templates')).status,403)
})
