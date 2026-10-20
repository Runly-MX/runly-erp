import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { capabilitiesFor, companyInitials, importAreaOptions, writableAreas } from '../guest-capabilities.js'
import { contrastRatio, portalThemeVars } from '../guest-theme.js'

const me = {
  capabilities: { canCreateModels: true, canImport: true },
  areas: [
    { id: 'a', name: 'Equipos', parentId: null, role: 'editor', canWrite: true, canCreateModels: true, canImport: true },
    { id: 'b', name: 'Cables', parentId: 'a', role: 'editor', canWrite: true, canCreateModels: false, canImport: false },
    { id: 'c', name: 'Lectura', parentId: null, role: 'viewer', canWrite: false, canCreateModels: true, canImport: true },
  ],
}

describe('guest capability resolution', () => {
  it('resolves per folder and overall', () => {
    assert.deepEqual(capabilitiesFor(me, 'a'), { canCreateModels: true, canImport: true })
    assert.deepEqual(capabilitiesFor(me, 'b'), { canCreateModels: false, canImport: false })
    assert.deepEqual(capabilitiesFor(me, 'c'), { canCreateModels: false, canImport: false })
    assert.deepEqual(capabilitiesFor(me), { canCreateModels: true, canImport: true })
    assert.deepEqual(capabilitiesFor(me, 'zzz'), { canCreateModels: false, canImport: false })
    assert.deepEqual(capabilitiesFor(null), { canCreateModels: false, canImport: false })
  })

  it('lists writable folders and importable destinations', () => {
    assert.deepEqual(writableAreas(me).map((a) => a.id), ['a', 'b'])
    assert.deepEqual(importAreaOptions(me), [{ value: 'a', label: 'Equipos' }])
    assert.deepEqual(importAreaOptions({ areas: [] }), [])
  })

  it('builds company initials', () => {
    assert.equal(companyInitials('Acme Corp'), 'AC')
    assert.equal(companyInitials('Acme'), 'AC')
    assert.equal(companyInitials(''), 'IN')
  })
})

describe('portal theming guard', () => {
  it('accepts a color with enough contrast and picks a readable foreground', () => {
    const vars = portalThemeVars('#2563eb')
    assert.equal(vars['--brand-primary'], '#2563eb')
    assert.equal(vars['--brand-primary-foreground'], '#ffffff')
    assert.ok(contrastRatio([37, 99, 235], [255, 255, 255]) >= 4.5)
  })

  it('ignores near-white, near-black and invalid colors', () => {
    assert.equal(portalThemeVars('#fafafa'), null)
    assert.equal(portalThemeVars('#0a0a0a'), null)
    assert.equal(portalThemeVars('red'), null)
    assert.equal(portalThemeVars(null), null)
  })
})
