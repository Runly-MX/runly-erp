import test from 'node:test'
import assert from 'node:assert/strict'
import { validateManifest } from '@runly/module-engine'
import { compileModule, validateModuleDefinition } from '../index.js'
import { manifestHomeWidgets } from '../home-widgets.js'

const BASE = {
  schemaVersion: 1, key: 'custom.ordenes', name: 'Órdenes', version: '1.0.0', icon: 'Wrench', color: '#2563EB',
  pwa: { shortName: 'Órdenes', startPath: '/ordenes' },
  entities: [{ key: 'orden', label: 'Orden', pluralLabel: 'Órdenes', fields: [
    { key: 'folio', type: 'text', label: 'Folio', required: true },
    { key: 'cliente', type: 'text', label: 'Cliente' },
    { key: 'estado', type: 'select', label: 'Estado', options: [{ value: 'abierta', label: 'Abierta' }, { value: 'cerrada', label: 'Cerrada' }] },
    { key: 'monto', type: 'decimal', label: 'Monto' },
    { key: 'nota', type: 'textarea', label: 'Nota' },
  ] }],
  homeWidgets: [
    { key: 'abiertas', label: 'Órdenes abiertas', entity: 'orden', kind: 'count', when: { field: 'estado', op: 'not_equals', value: 'cerrada' } },
    { key: 'recientes', label: 'Últimas órdenes', entity: 'orden', kind: 'list', titleField: 'folio', detailField: 'cliente', sort: { field: 'monto', dir: 'desc' }, limit: 3 },
  ],
}
const codes = (definition) => validateModuleDefinition(definition).errors.map((error) => error.code)

test('home widgets compile to the manifest with the read permission and column names', () => {
  assert.deepEqual(codes(structuredClone(BASE)), [])
  const [count, list] = manifestHomeWidgets(BASE)
  assert.deepEqual(count, { key: 'abiertas', label: 'Órdenes abiertas', kind: 'count', model: 'orden', permission: 'ordenes.orden.read', where: [{ field: 'estado', op: 'not_equals', value: 'cerrada' }] })
  assert.deepEqual([list.titleField, list.detailField, list.sortField, list.sortDir, list.limit], ['folio', 'cliente', 'monto', 'desc', 3])
  const manifest = compileModule(structuredClone(BASE)).files.find((file) => file.path === 'module.manifest.js').content
  assert.match(manifest, /homeWidgets: \[/)
  const emitted = { key: 'custom.ordenes', name: 'Órdenes', version: '1.0.0', kind: 'FEATURE', icon: 'Wrench', color: '#2563EB', pwa: { shortName: 'Órdenes', startPath: '/ordenes' }, homeWidgets: manifestHomeWidgets(BASE) }
  assert.equal(validateManifest(emitted).valid, true)
  assert.equal(validateManifest({ ...emitted, homeWidgets: [{ ...emitted.homeWidgets[0], where: [{ field: 'x; drop', op: 'equals', value: 1 }] }] }).valid, false)
})

test('home widget diagnostics', () => {
  const bad = structuredClone(BASE)
  bad.homeWidgets = [
    { key: 'Mala', label: '', entity: 'nada', kind: 'count' },
    { key: 'otra', label: 'Otra', entity: 'orden', kind: 'list', titleField: 'fantasma', sort: { field: 'nota', dir: 'up' }, limit: 99, when: [{ field: 'folio', op: 'gt', value: 1 }, { field: 'estado', op: 'equals' }] },
    { key: 'otra', label: 'Duplicada', entity: 'orden', kind: 'grafica' },
  ]
  const found = codes(bad)
  for (const code of ['HOME_WIDGET_KEY_INVALID', 'REQUIRED', 'HOME_WIDGET_ENTITY_NOT_FOUND', 'HOME_WIDGET_FIELD_NOT_FOUND', 'HOME_WIDGET_FIELD_TYPE_UNSUPPORTED', 'HOME_WIDGET_SORT_INVALID', 'HOME_WIDGET_LIMIT_INVALID', 'HOME_WIDGET_CONDITION_INVALID', 'HOME_WIDGET_DUPLICATE', 'HOME_WIDGET_KIND_INVALID']) {
    assert.ok(found.includes(code), `missing ${code}: ${found}`)
  }
  const many = structuredClone(BASE)
  many.homeWidgets = Array.from({ length: 6 }, (_, i) => ({ key: `w${i}x`, label: 'W', entity: 'orden', kind: 'count' }))
  assert.ok(codes(many).includes('HOME_WIDGETS_TOO_MANY'))
})
