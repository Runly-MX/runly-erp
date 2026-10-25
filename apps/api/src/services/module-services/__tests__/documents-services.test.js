import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentsHandlers, parseValues } from '../documents-services.js'
import { createKindRegistry } from '../../../routes/documents/kinds/kind-registry.js'
import { validateServiceArgs } from '@runly/module-engine/contracts'

class ServiceError extends Error {
  constructor(message, status = 400, code = 'x') { super(message); this.status = status; this.code = code }
}

function setup({ templates = [], active = ['runly.fleet'] } = {}) {
  const kinds = createKindRegistry()
  kinds.register({ key: 'fleet.vehicle', label: 'Vehículo', moduleKey: 'runly.fleet', permissionKey: 'fleet.vehicles.read', schema: [], load: async () => ({}) })
  kinds.register({ key: 'general.manual', label: 'General', moduleKey: null, alwaysVisible: true, freeTags: true, permissionKey: 'documents.templates.read', schema: [], load: async () => ({}) })
  const calls = []
  const hub = {
    kinds,
    activeModules: async () => new Map(active.map((key) => [key, key])),
    engine: { generate: async (input) => { calls.push(input); return { fileAssetId: 'f1', fileName: 'Vehículo.docx', format: 'docx', buffer: Buffer.from('abc') } } },
    fileTemplates: { list: async ({ kind }) => templates.filter((t) => t.kind === kind) },
  }
  const prisma = { documentTemplate: { findFirst: async ({ where }) => templates.find((t) => t.id === where.id && t.kind === where.kind) ?? null } }
  return { handlers: createDocumentsHandlers({ prisma, ServiceError, hub }), calls }
}

const SYSTEM = { companyId: 'c1', system: true, actorId: null }
const USER = { companyId: 'c1', system: false, actorId: 'u1', permissionKeys: ['fleet.vehicles.read'], isAdmin: false }

test('generate returns a file id and runs trusted for automations', async () => {
  const { handlers, calls } = setup()
  const result = await handlers['runly.documents:documents.generate'](SYSTEM, { kind: 'fleet.vehicle', sourceId: 'v1', output: 'pdf' })
  assert.deepEqual(result, { id: 'f1', name: 'Vehículo.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 3, sourceEntityId: 'v1' })
  assert.equal(calls[0].trusted, true)
  assert.equal(calls[0].output, 'pdf')
})

test('generate checks the kind permission for users and hides inactive modules', async () => {
  const { handlers } = setup()
  await assert.rejects(handlers['runly.documents:documents.generate']({ ...USER, permissionKeys: [] }, { kind: 'fleet.vehicle', sourceId: 'v1' }), (e) => e.status === 403)
  await handlers['runly.documents:documents.generate'](USER, { kind: 'fleet.vehicle', sourceId: 'v1' })
  const off = setup({ active: [] })
  await assert.rejects(off.handlers['runly.documents:documents.generate'](USER, { kind: 'fleet.vehicle', sourceId: 'v1' }), (e) => e.code === 'kind_not_found')
})

test('personal templates are only usable by their owner', async () => {
  const templates = [{ id: 't1', kind: 'fleet.vehicle', name: 'Mía', visibility: 'personal', ownerUserId: 'u1', format: 'docx' }]
  const { handlers } = setup({ templates })
  await handlers['runly.documents:documents.generate'](USER, { kind: 'fleet.vehicle', sourceId: 'v1', templateId: 't1' })
  await assert.rejects(handlers['runly.documents:documents.generate']({ ...USER, actorId: 'u2' }, { kind: 'fleet.vehicle', sourceId: 'v1', templateId: 't1' }), (e) => e.code === 'template_not_found')
  await assert.rejects(handlers['runly.documents:documents.generate'](SYSTEM, { kind: 'fleet.vehicle', sourceId: 'v1', templateId: 't1' }), (e) => e.code === 'template_not_found')
})

test('generate needs a record or values, and values may be JSON text', async () => {
  const { handlers, calls } = setup()
  await assert.rejects(handlers['runly.documents:documents.generate'](SYSTEM, { kind: 'general.manual' }), (e) => e.code === 'source_required')
  await handlers['runly.documents:documents.generate'](SYSTEM, { kind: 'general.manual', values: '{"nombre":"Ana"}' })
  assert.deepEqual(calls[0].data, { nombre: 'Ana' })
  assert.throws(() => parseValues('[1]', ServiceError), /JSON/)
})

test('templates.list returns the visible templates of the kind', async () => {
  const templates = [
    { id: 't1', kind: 'fleet.vehicle', name: 'Empresa', visibility: 'company', format: 'docx', isDefault: true, publishedVersionId: 'v' },
    { id: 't2', kind: 'fleet.vehicle', name: 'Mía', visibility: 'personal', format: 'pdf', publishedVersionId: null },
  ]
  const { handlers } = setup({ templates })
  const user = await handlers['runly.documents:templates.list'](USER, { kind: 'fleet.vehicle' })
  assert.deepEqual(user.items.map((t) => t.id), ['t1', 't2'])
  const system = await handlers['runly.documents:templates.list'](SYSTEM, { kind: 'fleet.vehicle' })
  assert.deepEqual(system.items.map((t) => t.id), ['t1'])
  const all = await handlers['runly.documents:templates.list'](USER, {})
  assert.ok(all.items.every((t) => t.kind === 'fleet.vehicle'))
})

test('contract: values accept an object or JSON text and reject the rest', () => {
  assert.equal(validateServiceArgs('runly.documents:documents.generate', { kind: 'fleet.vehicle', values: { a: 1 } }).ok, true)
  assert.equal(validateServiceArgs('runly.documents:documents.generate', { kind: 'fleet.vehicle', values: '{"a":1}' }).ok, true)
  assert.equal(validateServiceArgs('runly.documents:documents.generate', { kind: 'fleet.vehicle', values: '[1]' }).ok, false)
  assert.equal(validateServiceArgs('runly.documents:documents.generate', {}).ok, false)
})
