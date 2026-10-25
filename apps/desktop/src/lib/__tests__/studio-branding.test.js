import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeRuntimeModules, getAvailableModules } from '../runtime-modules-core.js'
import { applyStudioBranding } from '../../../../shared/studio/identity.js'

const previous = () => ({ id: 'installed-id', key: 'runly.studio', name: 'Runly Studio', description: 'Diseños editables con texto...',
  status: 'INSTALLED', enabled: true, version: '0.1.0',
  manifest: { name: 'Runly Studio', summary: 'Descripción anterior', icon: 'Palette', color: '#2563eb',
    permissions: [{ key: 'studio.view' }], acl: { module: 'studio.view' },
    navigation: [{ label: 'Mis diseños', path: '/', icon: 'Palette', permissionKey: 'studio.view' }],
    pwa: { shortName: 'Studio', startPath: '/' } } })

test('cached installed Studio metadata shows current branding in runtime and catalog without mutating input', () => {
  const raw = previous(), before = structuredClone(raw)
  for (const options of [{ includeManifestFallback: false, preferApiNavigation: true }, {}]) {
    const [module] = mergeRuntimeModules({ data: [raw] }, options)
    assert.equal(module.name, 'Studio'); assert.equal(module.icon, 'PenTool'); assert.equal(module.color, '#D946EF')
    assert.equal(module.summary, 'Diseño gráfico y edición multimedia')
    assert.equal(module.manifest.icon, 'PenTool'); assert.equal(module.manifest.color, '#D946EF')
    assert.equal(module.navigation[0].icon, 'PenTool'); assert.equal(module.navigation[0].permissionKey, 'studio.view')
    assert.equal(module.id, raw.id); assert.equal(module.key, raw.key); assert.equal(module.version, raw.version)
    assert.deepEqual(module.manifest.acl, raw.manifest.acl); assert.deepEqual(module.manifest.permissions, raw.manifest.permissions)
  }
  assert.deepEqual(raw, before)
})

test('branding never adds a module or filtered navigation, enables a disabled module, or renames other modules', () => {
  assert.deepEqual(mergeRuntimeModules([], { includeManifestFallback: false }), [])
  const [disabled] = mergeRuntimeModules([{ ...previous(), enabled: false, status: 'DISABLED', manifest: { ...previous().manifest, navigation: [] } }], { preferApiNavigation: true })
  assert.equal(disabled.enabled, false); assert.equal(disabled.status, 'DISABLED')
  assert.deepEqual(disabled.navigation, []); assert.deepEqual(getAvailableModules([disabled]), [])
  for (const key of ['custom.studio', 'atlas.studio', 'runly.notes']) {
    const other = { ...previous(), key }
    assert.equal(applyStudioBranding(other), other)
  }
})
