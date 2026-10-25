import test from 'node:test'
import assert from 'node:assert/strict'
import { searchableColumns, buildCustomProvider, customListPath, createCustomProviders } from '../search/custom-module-providers.js'
import { SEARCH_PROVIDERS } from '../search/index.js'

test('marked text fields win; otherwise the first two text fields; unsafe or non-text fields never', () => {
  const fields = [
    { name: 'folio', type: 'text' }, { name: 'nota', type: 'textarea', searchable: true }, { name: 'monto', type: 'currency', searchable: true },
    { name: 'bad name', type: 'text', searchable: true }, { name: 'otro', type: 'text' },
  ]
  assert.deepEqual(searchableColumns({ fields }), ['nota'])
  assert.deepEqual(searchableColumns({ fields: fields.map(({ searchable, ...f }) => f) }), ['folio', 'nota'])
  assert.deepEqual(searchableColumns({ fields: [{ name: 'monto', type: 'currency' }] }), [])
})

test('a custom provider is gated by the model read permission and lists at the generated path', () => {
  const provider = buildCustomProvider({ name: 'calibraciones.calibracion', moduleKey: 'custom.calibraciones', tableName: 'calibraciones_calibracion', label: 'Calibración', pluralLabel: 'Calibraciones', schema: { fields: [{ name: 'folio', type: 'text' }] } })
  assert.equal(provider.permission, 'calibraciones.calibracion.read')
  assert.equal(provider.source, 'custom:calibraciones.calibracion')
  assert.equal(provider.target('x'), customListPath('custom.calibraciones', 'calibraciones.calibracion'))
  assert.equal(provider.target('x'), '/app/m/custom.calibraciones/calibraciones-calibracions')
  assert.equal(buildCustomProvider({ name: 'a.b', moduleKey: 'custom.a', tableName: 'bad table;', label: 'x', schema: { fields: [{ name: 'f', type: 'text' }] } }), null)
})

test('providers are resolved per company, skip modules disabled for it and are cached', async () => {
  let calls = 0
  const prisma = {
    runlyModule: { findMany: async () => { calls += 1; return [{ id: 'm1', key: 'custom.a', name: 'A' }, { id: 'm2', key: 'custom.b', name: 'B' }] } },
    runlyModel: { findMany: async () => [
      { name: 'a.x', moduleKey: 'custom.a', tableName: 'a_x', label: 'X', pluralLabel: null, schema: { fields: [{ name: 'n', type: 'text' }] } },
      { name: 'b.y', moduleKey: 'custom.b', tableName: 'b_y', label: 'Y', pluralLabel: null, schema: { fields: [{ name: 'n', type: 'text' }] } },
    ] },
    companyModule: { findMany: async ({ where }) => (where.companyId === 'c2' ? [{ moduleId: 'm2' }] : []) },
  }
  const providersFor = createCustomProviders({ prisma })
  assert.equal((await providersFor('c1')).length, 2)
  assert.deepEqual((await providersFor('c2')).map((p) => p.moduleKey), ['custom.a'])
  await providersFor('c1')
  assert.equal(calls, 1)
})

test('the registry includes chat messages, courses, vehicles and automations with permissions', () => {
  const by = Object.fromEntries(SEARCH_PROVIDERS.map((p) => [p.source, p]))
  assert.equal(by.chat_messages.permission, 'chat.conversations.read')
  assert.equal(by.lms_courses.permission, 'lms.course.manage')
  assert.equal(by.fleet_vehicles.permission, 'fleet.vehicles.read')
  assert.equal(by.automations.permission, 'automations.read')
})
