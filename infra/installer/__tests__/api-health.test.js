import test from 'node:test'
import assert from 'node:assert/strict'
import { waitForApiHealth } from '../lib/api-health.mjs'

test('resolves once the API answers ok', async () => {
  let calls = 0
  await waitForApiHealth({ fetchImpl: async () => ({ ok: ++calls > 2, status: 502 }), sleep: async () => {} })
  assert.equal(calls, 3)
})

test('fails with an explicit message when the API never becomes healthy', async () => {
  let t = 0
  await assert.rejects(
    waitForApiHealth({ timeoutMs: 10, fetchImpl: async () => { throw new Error('ECONNREFUSED') }, sleep: async () => {}, now: () => (t += 6) }),
    /API_HEALTH_CHECK_FAILED.*NOT ready/s,
  )
})

test('probes the published address and port, not a fixed one', async () => {
  const { resolveApiHealthUrl } = await import('../lib/api-health.mjs')
  assert.equal(resolveApiHealthUrl({}), 'http://127.0.0.1:4010/health')
  assert.equal(resolveApiHealthUrl({ bindAddr: '0.0.0.0', port: '4123' }), 'http://127.0.0.1:4123/health')
  assert.equal(resolveApiHealthUrl({ bindAddr: '10.0.0.5', port: '4010' }), 'http://10.0.0.5:4010/health')
  assert.equal(resolveApiHealthUrl({ port: 'oops' }), 'http://127.0.0.1:4010/health')
})
