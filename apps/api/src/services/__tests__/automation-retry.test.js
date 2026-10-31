import test from 'node:test'
import assert from 'node:assert/strict'
import { isTransient, planRetry, MAX_RETRIES } from '../automation-retry.js'

const NOW = new Date('2026-10-31T12:00:00Z')
const stoppedWith = (status) => ({ stoppedAt: 1, steps: [{ index: 0, ok: true }, { index: 1, ok: false, status }] })

test('only errors that can heal by themselves are retried', () => {
  assert.equal(isTransient({ status: null }), true)
  assert.equal(isTransient({ status: 502 }), true)
  assert.equal(isTransient({ status: 429 }), true)
  assert.equal(isTransient({ status: 403 }), false)
  assert.equal(isTransient({ status: 422 }), false)
})

test('retries back off and then give up; a permanent error or the switch off fails at once', () => {
  assert.deepEqual(planRetry({ result: stoppedWith(503), now: NOW }), { status: 'retrying', attempt: 1, at: new Date(NOW.getTime() + 60_000) })
  assert.equal(planRetry({ result: stoppedWith(503), attempt: 2, now: NOW }).at.getTime(), NOW.getTime() + 15 * 60_000)
  assert.equal(planRetry({ result: stoppedWith(503), attempt: MAX_RETRIES, now: NOW }).status, 'failed')
  assert.equal(planRetry({ result: stoppedWith(400), now: NOW }).status, 'failed')
  assert.equal(planRetry({ result: stoppedWith(503), enabled: false, now: NOW }).status, 'failed')
})
