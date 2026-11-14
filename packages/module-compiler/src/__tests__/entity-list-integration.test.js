import test from 'node:test'
import assert from 'node:assert/strict'
import { compileModule, archiveModule, normalizeModuleDefinition, validateModuleDefinition } from '../index.js'
import { inspectModuleZip } from '../inspection/index.js'

const status = { key: 'estado', type: 'select', label: 'Estado', options: [{ value: 'abierto', label: 'Abierto', color: 'blue' }, { value: 'cerrado', label: 'Cerrado', color: 'green' }] }
const definitions = [
  {
    key: 'producto', label: 'Producto', pluralLabel: 'Productos',
    fields: [{ key: 'nombre', type: 'text' }, { key: 'sku', type: 'text' }, { key: 'precio', type: 'decimal' }, { key: 'existencias', type: 'number' }, status, { key: 'foto', type: 'file', accept: 'image' }],
    list: { primaryField: 'nombre', subtitleField: 'sku', imageField: 'foto', statusField: 'estado', defaultView: 'grid', columns: [{ field: 'nombre' }, { field: 'precio', format: 'currency' }, { field: 'existencias', format: 'number' }, { field: 'estado' }], filters: ['estado'], defaultSort: { field: 'nombre', direction: 'asc' } },
  },
  {
    key: 'factura', label: 'Factura', pluralLabel: 'Facturas',
    fields: [{ key: 'folio', type: 'text' }, { key: 'proveedor', type: 'text' }, { key: 'importe', type: 'decimal' }, { key: 'fecha', type: 'date' }, { key: 'vencimiento', type: 'date' }, status],
    list: { primaryField: 'folio', subtitleField: 'proveedor', statusField: 'estado', defaultView: 'table', columns: [{ field: 'folio' }, { field: 'proveedor' }, { field: 'importe', format: 'currency' }, { field: 'vencimiento', format: 'date' }, { field: 'estado' }], filters: ['estado'], defaultSort: { field: 'vencimiento', direction: 'asc' } },
  },
  {
    key: 'ticket', label: 'Ticket', pluralLabel: 'Tickets',
    fields: [{ key: 'asunto', type: 'text' }, { key: 'prioridad', type: 'select', options: ['alta', 'baja'] }, { key: 'responsable', type: 'text' }, status, { key: 'fecha', type: 'datetime' }],
    list: { primaryField: 'asunto', subtitleField: 'responsable', statusField: 'estado', defaultView: 'cards', columns: [{ field: 'asunto' }, { field: 'prioridad' }, { field: 'responsable' }, { field: 'fecha', format: 'datetime' }, { field: 'estado' }], filters: ['estado', 'prioridad'], defaultSort: { field: 'fecha', direction: 'desc' } },
  },
]
const moduleDefinition = (entities) => ({ schemaVersion: 1, key: 'custom.listados', name: 'Listados de prueba', version: '1.0.0', icon: 'Wrench', color: '#2563EB', pwa: { shortName: 'Listados', startPath: '/productos' }, entities: structuredClone(entities) })

test('three distinct list presentations survive normalized definition, compilation, ZIP and static inspection', async () => {
  const definition = normalizeModuleDefinition(moduleDefinition(definitions))
  assert.deepEqual(validateModuleDefinition(definition).errors, [])
  const compiled = compileModule(definition)
  const stored = JSON.parse(compiled.files.find(file => file.path === '.module-definition.json').content)
  const inspected = inspectModuleZip(await archiveModule(compiled))
  assert.equal(inspected.valid, true, JSON.stringify(inspected.diagnostics))
  const schemas = inspected.views.filter(view => view.kind === 'TABLE').map(view => view.schema)
  assert.equal(new Set(schemas.map(schema => schema.defaultViewMode)).size, 3)
  for (const entity of definition.entities) {
    assert.deepEqual(stored.entities.find(item => item.key === entity.key).list, entity.list)
    const schema = schemas.find(item => item.entity === entity.key)
    assert.equal(schema.primaryField, entity.list.primaryField)
    assert.equal(schema.subtitleField, entity.list.subtitleField)
    assert.equal(schema.statusField, 'estado')
    assert.equal(schema.defaultViewMode, entity.list.defaultView)
    assert.deepEqual(schema.filters.map(filter => filter.field), entity.list.filters)
    assert.deepEqual(schema.columns.filter(column => column.type !== 'image-asset').map(column => column.field), entity.list.columns.map(column => column.field))
    for (const column of entity.list.columns.filter(column => column.format)) assert.equal(schema.columns.find(item => item.field === column.field).type, column.format)
    assert.deepEqual(schema.columns.find(column => column.field === 'estado').options, status.options)
    assert.deepEqual(schema.filters.find(filter => filter.field === 'estado').options, status.options)
    assert.equal(schema.columns.find(column => column.field === entity.list.primaryField).primary, true)
    const service = compiled.files.find(file => file.path === `api/${entity.key}-service.js`).content
    assert.ok(service.includes(`t.${entity.list.defaultSort.field} ${entity.list.defaultSort.direction.toUpperCase()} NULLS LAST`))
  }
  const image = schemas.find(schema => schema.entity === 'producto').columns[0]
  assert.equal(image.field, 'foto')
  assert.equal(image.type, 'image-asset')
  assert.ok(image.signedUrlPath)
})

test('legacy entities retain automatic columns and omit list presentation extras', async () => {
  const entities = definitions.map(({ list, ...entity }) => entity)
  const inspected = inspectModuleZip(await archiveModule(compileModule(moduleDefinition(entities))))
  assert.equal(inspected.valid, true, JSON.stringify(inspected.diagnostics))
  for (const view of inspected.views.filter(view => view.kind === 'TABLE')) {
    const entity = entities.find(item => item.key === view.schema.entity)
    assert.deepEqual(view.schema.columns.map(column => column.field), entity.fields.slice(0, 5).map(field => field.key))
    for (const key of ['primaryField', 'subtitleField', 'statusField', 'defaultViewMode', 'filters']) assert.equal(key in view.schema, false)
  }
})
