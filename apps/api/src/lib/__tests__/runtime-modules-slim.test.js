import test from 'node:test'
import assert from 'node:assert/strict'
import { isSlimRuntimeQuery, slimRuntimeModules, SLIM_MANIFEST_OMIT } from '../runtime-modules-slim.js'

const mods = [{ key: 'a', compatibility: [], manifest: { name: 'A', navigation: [{ path: '/x' }], authorizedRoutes: ['/x'], lifecycle: { supportsDataPurge: true }, blueprints: [1], permissions: [2], acl: {}, views: [], models: [], connections: [] } }, { key: 'b', manifest: null }]

test('slim removes only the heavy manifest keys and never mutates the input', () => {
  const out = slimRuntimeModules(mods)
  assert.deepEqual(Object.keys(out[0].manifest).sort(), ['authorizedRoutes', 'lifecycle', 'name', 'navigation'])
  assert.deepEqual(out[0].compatibility, [])
  for (const k of SLIM_MANIFEST_OMIT) assert.ok(k in mods[0].manifest)
  assert.equal(out[1], mods[1])
})

test('only slim=1|true activates it', () => {
  assert.ok(isSlimRuntimeQuery({ slim: '1' }) && isSlimRuntimeQuery({ slim: 'true' }))
  assert.ok(!isSlimRuntimeQuery({}) && !isSlimRuntimeQuery({ slim: '0' }))
})
