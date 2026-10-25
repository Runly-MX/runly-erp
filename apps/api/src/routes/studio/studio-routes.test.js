import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStudioRouter } from './index.js'

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
