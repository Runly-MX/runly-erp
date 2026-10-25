import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listOfficialModuleManifests, isOfficialCoreModuleKey } from '../../services/module-manifests-service.js'
import { CURRENT_ONLY_OFFICIAL_MODULE_KEYS, getModuleKeyAliases } from '@runly/core'
import { resolveScreen } from '../../../../desktop/src/app/module-screen-resolver.js'
import { validateModulePwaIdentity, isModuleIconName } from '@runly/module-engine'

test('Studio registers as a current-only official module with help and a built-in screen', () => {
  const manifest = listOfficialModuleManifests().find(m => m.key === 'runly.studio')
  assert.ok(manifest)
  assert.equal(manifest.name, 'Studio')
  assert.equal(manifest.description, 'Diseño gráfico y edición multimedia')
  assert.equal(manifest.icon, 'PenTool')
  assert.equal(manifest.color, '#D946EF')
  assert.ok(isModuleIconName(manifest.icon))
  assert.ok(validateModulePwaIdentity(manifest).valid)
  assert.equal(manifest.navigation[0].icon, 'PenTool')
  assert.deepEqual(manifest.fullscreenPaths, ['/'])
  assert.ok(isOfficialCoreModuleKey('runly.studio'))
  assert.ok(CURRENT_ONLY_OFFICIAL_MODULE_KEYS.includes(manifest.key))
  assert.deepEqual(getModuleKeyAliases(manifest.key), ['runly.studio'])
  assert.ok(manifest.blueprints.length > 0)
  const screen = () => null
  assert.equal(resolveScreen({ 'runly.studio:/': screen }, manifest.key, '/', null), screen)
})
