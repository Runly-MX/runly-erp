import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listOfficialModuleManifests, isOfficialCoreModuleKey } from '../../services/module-manifests-service.js'
import { CURRENT_ONLY_OFFICIAL_MODULE_KEYS, getModuleKeyAliases } from '@runly/core'
import { resolveScreen } from '../../../../desktop/src/app/module-screen-resolver.js'

test('Studio registers as a current-only official module with help and a built-in screen', () => {
  const manifest = listOfficialModuleManifests().find(m => m.key === 'runly.studio')
  assert.ok(manifest)
  assert.ok(isOfficialCoreModuleKey('runly.studio'))
  assert.ok(CURRENT_ONLY_OFFICIAL_MODULE_KEYS.includes(manifest.key))
  assert.deepEqual(getModuleKeyAliases(manifest.key), ['runly.studio'])
  assert.ok(manifest.blueprints.length > 0)
  const screen = () => null
  assert.equal(resolveScreen({ 'runly.studio:/': screen }, manifest.key, '/', null), screen)
})
