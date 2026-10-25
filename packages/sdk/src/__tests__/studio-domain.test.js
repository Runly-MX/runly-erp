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
