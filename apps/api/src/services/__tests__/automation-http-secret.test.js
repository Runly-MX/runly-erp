import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createAutomationHttpService } from '../automation-http-service.js'

function memoryPrisma() {
  const rows = new Map()
  return { instanceConfig: { findUnique: async ({ where }) => (rows.has(where.key) ? { value: rows.get(where.key) } : null), upsert: async ({ where, create }) => { rows.set(where.key, create.value) } } }
}

test('the signing key is created once, stays stable and can be regenerated', async () => {
  const service = createAutomationHttpService({ prisma: memoryPrisma() })
  const first = await service.getSecret()
  assert.equal(first.length, 64)
  assert.equal(await service.getSecret(), first)
  const next = await service.regenerateSecret()
  assert.notEqual(next, first)
  assert.equal(await service.getSecret(), next)
})

test('what Runly sends can be verified with that key (exact body, HMAC-SHA256)', async () => {
  const sent = []
  const service = createAutomationHttpService({
    prisma: { instanceConfig: { findUnique: async ({ where }) => ({ value: where.key === 'automation_http_hosts' ? JSON.stringify(['hooks.example.com']) : 'k'.repeat(64) }), upsert: async () => {} } },
    transport: async (req) => { sent.push(req); return { status: 200, text: '' } },
  })
  await service.send({ companyId: 'c', moduleKey: 'runly.chat', request: { url: 'https://hooks.example.com/x', method: 'POST', automationKey: 'a', idempotencyKey: 'i', body: { v: 1 } } })
  const expected = 'sha256=' + crypto.createHmac('sha256', 'k'.repeat(64)).update(sent[0].body).digest('hex')
  assert.equal(sent[0].headers['X-Runly-Signature'], expected)
})
