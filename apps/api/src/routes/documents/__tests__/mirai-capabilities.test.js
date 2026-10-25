import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentsMiraiCapabilities } from '../mirai-capabilities.js'
import { createKindRegistry } from '../kinds/kind-registry.js'

function setup(templates = []) {
  const kinds = createKindRegistry()
  kinds.register({ key: 'fleet.vehicle', label: 'Vehículo', moduleKey: 'runly.fleet', permissionKey: 'fleet.vehicles.read', schema: [{ tag: 'plate', label: 'Placas', type: 'text' }], load: async () => ({}) })
  kinds.register({ key: 'general.manual', label: 'Documento general', moduleKey: null, alwaysVisible: true, freeTags: true, permissionKey: 'documents.templates.read', schema: [], load: async () => ({}) })
  const generated = []
  const hub = {
    kinds,
    activeModules: async () => new Map([['runly.fleet', 'Flota']]),
    engine: { generate: async (input) => { generated.push(input); return { fileAssetId: 'file-1', fileName: 'Vehículo.pdf', format: 'pdf', buffer: Buffer.from('x') } } },
    fileTemplates: { list: async ({ kind }) => templates.filter((t) => t.kind === kind) },
  }
  const prisma = { documentTemplate: { findFirst: async ({ where }) => templates.find((t) => t.id === where.id) ?? null } }
  const capability = createDocumentsMiraiCapabilities({ prisma, hub })
  return { capability, generated, tool: (name) => capability.tools.find((t) => t.name === name), action: capability.actions[0] }
}

const actx = (permissions) => ({ companyId: 'c1', actorProfileId: 'u1', isAdmin: false, permissionSet: new Set(permissions) })
const TEMPLATES = [{ id: 't1', kind: 'fleet.vehicle', name: 'Ficha', format: 'docx', visibility: 'company', isDefault: true, publishedVersionId: 'v1', published: true }]

test('documents_kinds only lists kinds the person can use', async () => {
  const { tool } = setup()
  const some = await tool('documents_kinds').run({}, actx(['documents.templates.read', 'fleet.vehicles.read']))
  assert.deepEqual(some.tipos.map((t) => t.key).sort(), ['fleet.vehicle', 'general.manual'])
  const few = await tool('documents_kinds').run({}, actx(['documents.templates.read']))
  assert.deepEqual(few.tipos.map((t) => t.key), ['general.manual'])
})

test('generate: prepare checks kind, template and source; execute stores the file and links it', async () => {
  const { action, generated } = setup(TEMPLATES)
  const person = actx(['documents.templates.read', 'fleet.vehicles.read'])
  assert.match((await action.prepare({ kind: 'fleet.vehicle' }, person)).error, /sourceId/)
  assert.match((await action.prepare({ kind: 'fleet.vehicle', sourceId: 'v1', templateId: 'otra' }, person)).error, /plantilla/)
  assert.match((await action.prepare({ kind: 'fleet.vehicle', sourceId: 'v1' }, actx(['documents.templates.read']))).error, /permiso/)
  const prepared = await action.prepare({ kind: 'fleet.vehicle', sourceId: 'v1', output: 'pdf' }, person)
  assert.equal(prepared.input.templateId, 't1')
  assert.equal(prepared.preview.fields[1].value, 'Ficha (Word)')
  const done = await action.execute(prepared.input, person)
  assert.deepEqual(done, { id: 'file-1', summary: 'Documento generado: Vehículo.pdf', link: '/app/m/runly.files?fileId=file-1' })
  assert.equal(generated[0].trusted, false)
  assert.equal(generated[0].output, 'pdf')
})

test('generate: free-tag kinds take values as tag/value pairs', async () => {
  const { action, generated } = setup()
  const person = actx(['documents.templates.read'])
  const prepared = await action.prepare({ kind: 'general.manual', values: [{ tag: 'nombre', value: 'Ana' }] }, person)
  assert.deepEqual(prepared.input.values, { nombre: 'Ana' })
  await action.execute(prepared.input, person)
  assert.deepEqual(generated[0].data, { nombre: 'Ana' })
})
