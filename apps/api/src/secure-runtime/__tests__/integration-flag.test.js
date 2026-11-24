// The experimental runtime is opt-in: with the flag off nothing exists, so
// turning it off can never re-enable code blocked by the Stage 1 trust gate.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSecureRuntimeIntegration, isSecureRuntimeEnabled } from '../integration.js'

test('flag off (default, empty, any other value): integration is not created', () => {
  for (const env of [{}, { RUNLY_SECURE_RUNTIME: '' }, { RUNLY_SECURE_RUNTIME: 'true' }, { RUNLY_SECURE_RUNTIME: 'enabled' }, { RUNLY_SECURE_RUNTIME: '1' }]) {
    assert.equal(isSecureRuntimeEnabled(env), false)
    assert.deepEqual(createSecureRuntimeIntegration({ prisma: null, pool: null, filesService: null, env }), { enabled: false })
  }
})

test('only the explicit experimental value turns it on', () => {
  const rt = createSecureRuntimeIntegration({ prisma: {}, pool: {}, filesService: {}, env: { RUNLY_SECURE_RUNTIME: 'experimental' } })
  assert.equal(rt.enabled, true)
  assert.equal(typeof rt.createRouter, 'function')
})
