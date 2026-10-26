import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunlyClient } from '../index.js'

test('Studio SDK carries active company and auth and encodes ids', async () => {
  const calls = []
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => 'company-a',
    fetch: async (url, options) => { calls.push({ url, options }); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }) } })
  await client.studio.listDesigns('test-token', { page: 2 })
  await client.studio.getDesign('design/one', 'test-token')
  await client.studio.createDesign({ name: 'Prueba' }, 'test-token')
  await client.studio.updateDesign('design/one', { revision: 1 }, 'test-token')
  assert.deepEqual(calls.map(c => c.options.method), ['GET', 'GET', 'POST', 'PUT'])
  assert.equal(calls[0].url, 'https://api.example.test/studio/designs?page=2')
  assert.equal(calls[1].url, 'https://api.example.test/studio/designs/design%2Fone')
  for (const { options } of calls) {
    assert.equal(options.headers['X-Runly-Company-Id'], 'company-a')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
  }
  assert.deepEqual(JSON.parse(calls[3].options.body), { revision: 1 })
})

test('Studio never queues stale revisions for offline replay', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
  let queued = 0, attempted = 0
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', fetch: async () => { attempted++; throw new Error('Sin conexión') } })
  client.setOfflineTransport({ queue: async () => { queued++; return { queued: true } } })
  try {
    await assert.rejects(client.studio.createDesign({}, 'test-only'), /Sin conexión/)
    await assert.rejects(client.studio.updateDesign('one', { revision: 1 }, 'test-only'), /Sin conexión/)
    assert.equal(queued, 0); assert.equal(attempted, 2)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete globalThis.navigator
  }
})

test('Studio batch receipt lookup is scoped, encoded and carries no mutation body',async()=>{
  const client=createRunlyClient({baseUrl:'https://api.example.test',getActiveCompanyId:()=> 'company-a',fetch:async(url,options)=>{
    assert.equal(url,'https://api.example.test/studio/designs/design%2Fone/changes?clientId=client-one&batchId=2')
    assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer token');assert.equal(options.headers['X-Runly-Company-Id'],'company-a');assert.equal(options.body,undefined)
    return new Response('{}',{headers:{'Content-Type':'application/json'}})
  }})
  await client.studio.changeReceipt('design/one',{clientId:'client-one',batchId:2},'token')
})

test('Studio image copies use company-scoped multipart, cancellation and encoded asset ids',async()=>{
  const signal=new AbortController().signal
  const file=new File(['fixture'],'edited.png',{type:'image/png'})
  const client=createRunlyClient({baseUrl:'https://api.example.test',getActiveCompanyId:()=> 'company-a',fetch:async(url,options)=>{
    assert.equal(url,'https://api.example.test/studio/designs/design%2Fone/assets/file%2Fone/edited-copy')
    assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer token');assert.equal(options.headers['X-Runly-Company-Id'],'company-a')
    assert.ok(options.body instanceof FormData);assert.equal(options.body.get('file').name,'edited.png')
    assert.ok(!options.headers['Content-Type']);assert.ok(options.signal)
    return new Response('{}',{headers:{'Content-Type':'application/json'}})
  }})
  await client.studio.saveImageCopy('design/one','file/one',file,'token',signal)
})

test('Studio collaboration uses authenticated company-scoped online endpoints', async () => {
  const calls = []
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => 'company-a',
    fetch: async (url, options) => { calls.push({ url, options }); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }) } })
  await client.studio.collaborators('design/one','token')
  await client.studio.candidates('design/one','token','Persona')
  await client.studio.share('design/one',{userId:'user',role:'VIEWER'},'token')
  await client.studio.live('design/one',{sessionId:'local-session',cursor:{x:12,y:34}},'token')
  await client.studio.assetUrl('design/one','file/one','token')
  assert.deepEqual(calls.map(call=>call.options.method),['GET','GET','PUT','POST','GET'])
  assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer token' && call.options.headers['X-Runly-Company-Id']==='company-a'))
  assert.ok(calls[4].url.endsWith('/studio/designs/design%2Fone/assets/file%2Fone/signed-url'))
  assert.deepEqual(JSON.parse(calls[2].options.body),{userId:'user',role:'VIEWER'})
})

test('Studio thumbnails reject a response when active company changes during download', async () => {
  let company = 'company-a'
  const controller = new AbortController()
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => company,
    fetch: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer token')
      assert.equal(options.headers['X-Runly-Company-Id'], 'company-a')
      assert.equal(options.signal, controller.signal)
      assert.ok(url.endsWith('/studio/resources/file%2Fone/thumbnail'))
      company = 'company-b'
      return new Response('synthetic-image', { headers: { 'Content-Type': 'image/png' } })
    } })
  await assert.rejects(client.studio.thumbnail('file/one', 'token', controller.signal), { code: 'company_changed', status: 409 })
})

test('Studio template operations send revisions and encoded ids', async () => {
  const calls = []
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', fetch: async (url, options) => { calls.push({ url, options }); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }) } })
  await client.studio.templateDetail('runly:square', 'test-token')
  await client.studio.saveTemplate({ name: 'A', document: { page: {} }, scope: 'personal' }, 'test-token')
  await client.studio.updateTemplate('t/1', { revision: 2, name: 'B' }, 'test-token')
  await client.studio.publishTemplate('t/1', 3, 'test-token')
  await client.studio.retireTemplate('t/1', 4, 'test-token')
  assert.deepEqual(calls.map(c => c.options.method), ['GET', 'POST', 'PUT', 'POST', 'DELETE'])
  assert.equal(calls[0].url, 'https://api.example.test/studio/templates/runly%3Asquare')
  assert.equal(calls[3].url, 'https://api.example.test/studio/templates/t%2F1/publish')
  assert.deepEqual(JSON.parse(calls[3].options.body), { revision: 3 })
  assert.deepEqual(JSON.parse(calls[4].options.body), { revision: 4 })
})
