import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogState, isTerminal, marketplaceError, releaseRef, resourceBlock } from '../marketplace-import.js'

const sdkError = (status, code, details) => Object.assign(new Error('x'), { status, code, details: { error: 'x', code, ...(details ? { details } : {}) } })

test('security and compatibility verdicts are terminal; transient failures are retryable', () => {
  for (const code of ['RESOURCE_REVOKED', 'RESOURCE_WITHDRAWN', 'RESOURCE_KEY_UNTRUSTED', 'RESOURCE_PACKAGE_MISMATCH', 'RESOURCE_RUNLY_VERSION', 'STUDIO_PACKAGE_BLOCKED', 'AUTOMATION_IMPORT_BLOCKED', 'RESOURCE_FEED_NOT_CONFIGURED']) {
    const state = marketplaceError(sdkError(409, code))
    assert.equal(isTerminal(state), true, code); assert.equal(state.retryable, false, code)
  }
  assert.deepEqual(['RESOURCE_FEED_UNAVAILABLE', 'RESOURCE_FEED_EXPIRED', 'AUTOMATION_IMPORT_EXPIRED', 'AUTOMATION_KEY_TAKEN'].map((c) => marketplaceError(sdkError(409, c)).kind), ['unavailable', 'expired', 'prepare_expired', 'conflict'])
  assert.equal(marketplaceError(sdkError(503)).retryable, true)
  assert.equal(marketplaceError(Object.assign(new TypeError('Failed to fetch'))).kind, 'temporary')
  assert.equal(marketplaceError(sdkError(409, 'RESOURCE_ACKNOWLEDGEMENT_REQUIRED')).acknowledge, true)
  assert.deepEqual(marketplaceError(sdkError(422, 'STUDIO_PACKAGE_BLOCKED', { diagnostics: { ok: false } })).details, { diagnostics: { ok: false } })
})

test('catalog state: expired blocks, stale needs explicit acknowledgement, fresh is clear', () => {
  assert.equal(catalogState({ installable: false, reason: 'RESOURCE_FEED_EXPIRED' }).blocking, true)
  const stale = catalogState({ installable: false, reason: 'RESOURCE_ACKNOWLEDGEMENT_REQUIRED' })
  assert.equal(stale.blocking, false); assert.equal(stale.stale, true)
  assert.deepEqual(catalogState({ installable: true, requiresAcknowledgement: false }), { blocking: false, stale: false, acknowledged: false })
})

test('a listed release shows the server reason and the request names only the exact release', () => {
  assert.equal(resourceBlock({ eligible: true }), null)
  assert.equal(resourceBlock({ eligible: false, blockedBy: ['RESOURCE_ACKNOWLEDGEMENT_REQUIRED', 'RESOURCE_KEY_UNTRUSTED'] }).code, 'RESOURCE_KEY_UNTRUSTED')
  const item = { resourceKey: 'studio.menu', version: '1.0.0', releaseId: 'r', title: 'x', sha256: 'y', packageUrl: 'z' }
  assert.deepEqual(releaseRef(item), { resourceKey: 'studio.menu', version: '1.0.0', releaseId: 'r' })
  assert.deepEqual(releaseRef(item, true), { resourceKey: 'studio.menu', version: '1.0.0', releaseId: 'r', acknowledgeStale: true })
})
