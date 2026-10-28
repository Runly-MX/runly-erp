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
