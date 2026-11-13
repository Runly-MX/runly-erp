import test from 'node:test'
import assert from 'node:assert/strict'
import { compileModule, validateModuleDefinition } from '../index.js'
import { normalizeModuleDefinition } from '../definition.js'

const BASE = {
  schemaVersion: 1, key: 'custom.taller', name: 'Taller', version: '1.0.0', icon: 'Wrench', color: '#2563EB',
  pwa: { shortName: 'Taller', startPath: '/ordenes' },
  entities: [{
    key: 'orden', label: 'Orden', pluralLabel: 'Ordenes',
    fields: [
      { key: 'nombre', type: 'text', label: 'Nombre', required: true },
      { key: 'monto', type: 'decimal', label: 'Monto' },
      { key: 'foto', type: 'file', label: 'Foto', accept: 'image' },
      { key: 'estado', type: 'select', label: 'Estado', options: [{ value: 'NEW', label: 'Nuevo', color: 'blue' }, { value: 'DONE', label: 'Hecho' }] },
      { key: 'entrega', type: 'date', label: 'Entrega' },
      { key: 'notas', type: 'textarea', label: 'Notas' },
      { key: 'extra', type: 'json', label: 'Extra' },
    ],
  }],
}
const LIST = {
  primaryField: 'nombre', imageField: 'foto', statusField: 'estado', subtitleField: 'notas', defaultView: 'cards',
  columns: [{ field: 'monto', format: 'number' }, { field: 'estado' }, { field: 'entrega', format: 'datetime' }],
  filters: ['estado'], defaultSort: { field: 'entrega', direction: 'asc' },
}
const withList = (list) => normalizeModuleDefinition({ ...structuredClone(BASE), entities: [{ ...structuredClone(BASE.entities[0]), list }] })
const codes = (list) => validateModuleDefinition(withList(list)).errors.map((error) => error.code)
const file = (list, name) => compileModule(withList(list)).files.find((item) => item.path.endsWith(name))?.content ?? ''

test('entity.list survives normalization and a valid list passes', () => {
  assert.deepEqual(withList(LIST).entities[0].list, LIST)
  assert.deepEqual(codes(LIST), [])
})

test('invalid presentation is rejected with specific codes', () => {
  assert.deepEqual(codes({ columns: [{ field: 'nope' }] }), ['LIST_UNKNOWN_FIELD'])
  assert.deepEqual(codes({ columns: [{ field: 'nombre', format: 'currency' }] }), ['LIST_INVALID_FORMAT'])
  assert.deepEqual(codes({ columns: [{ field: 'nombre' }, { field: 'nombre' }] }), ['LIST_DUPLICATE_COLUMN'])
  assert.deepEqual(codes({ filters: ['nombre'] }), ['LIST_FIELD_TYPE'])
  assert.deepEqual(codes({ statusField: 'nombre' }), ['LIST_FIELD_TYPE'])
  assert.deepEqual(codes({ defaultSort: { field: 'foto', direction: 'asc' } }), ['LIST_FIELD_TYPE'])
  assert.deepEqual(codes({ defaultSort: { field: 'monto', direction: 'up' } }), ['LIST_INVALID_SORT'])
  assert.deepEqual(codes({ defaultView: 'kanban' }), ['LIST_INVALID_VIEW'])
})

test('the generated table and list query follow entity.list', () => {
  const table = file(LIST, 'orden.table.js')
  assert.match(table, /primaryField: "nombre"/)
  assert.match(table, /defaultViewMode: "cards"/)
  assert.match(table, /filters: \[\{"field":"estado"/)
  assert.ok(table.indexOf("field: 'foto'") < table.indexOf("field: 'nombre'") && table.indexOf("field: 'nombre'") < table.indexOf("field: 'monto'"))
  assert.match(table, /field: 'estado'.*type: 'select', options: \[\{"value":"NEW","label":"Nuevo","color":"blue"\}/)
  assert.match(table, /field: 'entrega'.*type: 'datetime'/)
  assert.match(file(LIST, 'orden-service.js'), /ORDER BY t\.entrega ASC NULLS LAST, t\.created_at DESC/)
})

test('without entity.list the table keeps its legacy shape', () => {
  const table = file(undefined, 'orden.table.js')
  assert.doesNotMatch(table, /primaryField|defaultViewMode|filters:/)
  assert.match(file(undefined, 'orden-service.js'), /ORDER BY t\.created_at DESC\n/)
})
