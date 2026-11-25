import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureModuleTrust, isQuarantinedCustomModule } from '../module-trust.js'
import { isSecureRuntimeEnabled, SECURE_RUNTIME_FLAG } from '../../secure-runtime/integration.js'
import { createSupervisorClient } from '../../secure-runtime/supervisor-client.js'

// Turning the experimental runtime (or the supervisor) on or off must never change whether untrusted module code is served.
test('an untrusted custom module stays quarantined whatever the secure-runtime flag says', async () => {
  const modulesDir = mkdtempSync(join(tmpdir(), 'runly-quarantine-flags-'))
  const saved = process.env[SECURE_RUNTIME_FLAG]
  try {
    mkdirSync(join(modulesDir, 'custom.sample'))
    writeFileSync(join(modulesDir, 'custom.sample', 'module.manifest.js'), 'export default {}\n')
    // No trust record for this module: nothing was ever approved.
    configureModuleTrust({ prisma: { instanceConfig: { findUnique: async () => null } }, modulesDir })
    for (const value of [undefined, '', 'off', 'false', 'experimental', 'EXPERIMENTAL', '1']) {
      if (value === undefined) delete process.env[SECURE_RUNTIME_FLAG]; else process.env[SECURE_RUNTIME_FLAG] = value
      assert.equal(await isQuarantinedCustomModule('custom.sample'), true, `flag ${JSON.stringify(value)} must not release the module`)
    }
  } finally {
    if (saved === undefined) delete process.env[SECURE_RUNTIME_FLAG]; else process.env[SECURE_RUNTIME_FLAG] = saved
    rmSync(modulesDir, { recursive: true, force: true })
  }
})

test('the experimental runtime is off unless the flag is exactly "experimental"; the supervisor needs a URL and a long secret', () => {
  for (const value of [undefined, '', 'off', 'false', 'true', '1', 'on', 'Experimental', 'experimental ']) assert.equal(isSecureRuntimeEnabled({ [SECURE_RUNTIME_FLAG]: value }), false, JSON.stringify(value))
  assert.equal(isSecureRuntimeEnabled({ [SECURE_RUNTIME_FLAG]: 'experimental' }), true)
  assert.equal(isSecureRuntimeEnabled({}), false)
  assert.equal(createSupervisorClient({ url: undefined, secret: undefined }), null)
  assert.equal(createSupervisorClient({ url: 'http://supervisor.example.test', secret: 'short' }), null)
  assert.notEqual(createSupervisorClient({ url: 'http://supervisor.example.test', secret: 'x'.repeat(32) }), null)
})
