import test from 'node:test'
import assert from 'node:assert/strict'
import { getModuleOrigin, listOfficialModuleManifests, isOfficialModuleKey } from '../module-manifests-service.js'

const manifests = listOfficialModuleManifests()
const byKey = new Map(manifests.map((m) => [m.key, m]))

test('origin separates required official, optional official and custom', () => {
  assert.equal(getModuleOrigin('runly.identity'), 'official-required')
  assert.equal(getModuleOrigin('runly.ticketing'), 'official-optional')
  assert.equal(getModuleOrigin('custom.fleet'), 'custom')
  assert.equal(getModuleOrigin('custom.anything', { core: true }), 'official-required')
})

test('every official non-core manifest is official-optional, never custom', () => {
  for (const m of manifests.filter((x) => x.core !== true)) {
    assert.equal(getModuleOrigin(m.key), 'official-optional', m.key)
  }
})

test('runly.ticketing stays installable with consistent permissions and dependencies', () => {
  const m = byKey.get('runly.ticketing')
  assert.equal(m.core, false)
  assert.notEqual(m.uninstallable, false)
  assert.equal(m.lifecycle.installable, true)
  for (const d of m.dependencies) assert.ok(isOfficialModuleKey(d.key), `dependency ${d.key} must be official`)
  const keys = new Set(m.permissions.map((p) => p.key))
  for (const n of m.navigation) assert.ok(keys.has(n.permissionKey), n.permissionKey)
  for (const k of [m.acl.module, ...Object.values(m.acl.actions)]) assert.ok(keys.has(k), k)
})
