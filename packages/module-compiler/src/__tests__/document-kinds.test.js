import test from 'node:test'
import assert from 'node:assert/strict'
import { validateManifest } from '@runly/module-engine'
import { compileModule, validateModuleDefinition } from '../index.js'
import { manifestDocumentKinds } from '../document-kinds.js'

const BASE = {
  schemaVersion: 1,
  key: 'custom.facturas',
  name: 'Facturas',
  version: '1.0.0',
  icon: 'Wrench',
  color: '#2563EB',
  pwa: { shortName: 'Facturas', startPath: '/facturas' },
  entities: [
    { key: 'factura', label: 'Factura', pluralLabel: 'Facturas', fields: [
      { key: 'folio', type: 'text', label: 'Folio', required: true },
      { key: 'total', type: 'decimal', label: 'Total' },
      { key: 'emitida', type: 'date', label: 'Emitida' },
      { key: 'adjunto', type: 'file', label: 'Adjunto' },
    ] },
  ],
  documentKinds: [{ name: 'factura', label: 'Factura', entity: 'factura' }],
}

const codes = (definition) => validateModuleDefinition(definition).errors.map((error) => error.code)

test('a document kind derives its fields, types and read permission from the entity', () => {
  assert.deepEqual(codes(structuredClone(BASE)), [])
  const [kind] = manifestDocumentKinds(BASE)
  assert.equal(kind.model, 'factura')
  assert.equal(kind.permission, 'facturas.factura.read')
  assert.deepEqual(kind.fields.map((f) => [f.tag, f.type]), [['folio', 'text'], ['total', 'number'], ['emitida', 'date']])
  const manifest = compileModule(structuredClone(BASE)).files.find((file) => file.path === 'module.manifest.js').content
  assert.match(manifest, /documentKinds: \[/)
  assert.match(manifest, /"permission": "facturas.factura.read"/)
  const emitted = { key: 'custom.facturas', name: 'Facturas', version: '1.0.0', kind: 'FEATURE', icon: 'Wrench', color: '#2563EB', pwa: { shortName: 'Facturas', startPath: '/facturas' }, documentKinds: manifestDocumentKinds(BASE) }
  assert.equal(validateManifest(emitted).valid, true)
})

test('document kind diagnostics', () => {
  const bad = structuredClone(BASE)
  bad.documentKinds = [
    { name: 'Mala', label: '', entity: 'nada' },
    { name: 'otra', label: 'Otra', entity: 'factura', permission: 'x.y.z', fields: ['adjunto', 'fantasma'], formats: ['txt'] },
  ]
  const found = codes(bad)
  for (const code of ['DOCUMENT_KIND_NAME_INVALID', 'REQUIRED', 'DOCUMENT_KIND_ENTITY_NOT_FOUND', 'DOCUMENT_KIND_PERMISSION_NOT_FOUND', 'DOCUMENT_KIND_FIELD_TYPE_UNSUPPORTED', 'DOCUMENT_KIND_FIELD_NOT_FOUND', 'DOCUMENT_KIND_FORMATS_INVALID']) {
    assert.ok(found.includes(code), `missing ${code}: ${found}`)
  }
})
