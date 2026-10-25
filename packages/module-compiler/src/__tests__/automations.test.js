import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as acorn from 'acorn'
import { compileModule, validateModuleDefinition } from '../index.js'
import { archiveModule } from '../archive.js'
import { inspectModuleZip } from '../inspection/index.js'

const BASE = {
  schemaVersion: 1,
  key: 'custom.servicio',
  name: 'Servicio',
  version: '1.0.0',
  icon: 'Wrench',
  color: '#2563EB',
  pwa: { shortName: 'Servicio', startPath: '/ordens' },
  entities: [
    { key: 'orden', label: 'Orden', pluralLabel: 'Órdenes', fields: [
      { key: 'folio', type: 'text', label: 'Folio', required: true },
      { key: 'fecha', type: 'datetime', label: 'Fecha' },
      { key: 'estado', type: 'select', label: 'Estado', options: [{ value: 'abierta', label: 'Abierta' }, { value: 'cerrada', label: 'Cerrada' }] },
    ] },
  ],
  automations: [
    {
      key: 'agendar_visita', label: 'Agendar visita', enabled: true,
      trigger: { type: 'record', entity: 'orden', on: 'create' },
      action: { service: 'runly.calendar:events.create', args: {
        title: { from: 'template', template: 'Visita {{folio}}' },
        startAt: { from: 'field', field: 'fecha' },
        reminderMinutes: { from: 'value', value: [30] },
      } },
    },
    {
      key: 'avisar_cierre', label: 'Avisar cierre', enabled: true,
      trigger: { type: 'record', entity: 'orden', on: 'update', when: { field: 'estado', op: 'changed' } },
      action: { service: 'runly.notifications:notifications.send', args: {
        userIds: { from: 'actor' }, title: { from: 'template', template: 'Orden {{folio}}: {{estado}}' },
      } },
    },
    {
      key: 'taller', label: 'Contacto de taller', enabled: true,
      trigger: { type: 'event', event: 'fleet.vehicle.updated', when: { field: 'status', op: 'equals', value: 'maintenance' } },
      action: { service: 'runly.contacts:contacts.create', args: { name: { from: 'template', template: 'Taller {{plate}}' }, type: { from: 'value', value: 'company' } } },
    },
  ],
}

const codes = (definition) => validateModuleDefinition(definition).errors.map((error) => error.code)
const fileOf = (compiled, file) => compiled.files.find((f) => f.path === file)?.content

test('valid automations compile into manifest, runtime, events and route hooks', () => {
  assert.deepEqual(codes(structuredClone(BASE)), [])
  const compiled = compileModule(structuredClone(BASE))
  const manifest = fileOf(compiled, 'module.manifest.js')
  assert.match(manifest, /consumes: \{"runly.calendar":\["events.create"\],"runly.notifications":\["notifications.send"\],"runly.contacts":\["contacts.create"\]\}/)
  assert.match(manifest, /events: \{ subscribes: \["fleet.vehicle.updated"\] \}/)
  assert.ok(fileOf(compiled, 'api/automations.js'))
  assert.match(fileOf(compiled, 'api/events.js'), /createEventHandlers/)
  const routes = fileOf(compiled, 'api/orden-routes.js')
  assert.match(routes, /on: 'create', record: created/)
  assert.match(routes, /const previous = await service.getOrdenById/)
  // Active company from the tenant middleware, not the first membership.
  assert.match(routes, /c\.get\('companyId'\) \?\? c\.get\('userContext'\)/)
  for (const file of ['api/orden-routes.js', 'api/automations.js', 'api/events.js', 'module.manifest.js']) {
    assert.doesNotThrow(() => acorn.parse(fileOf(compiled, file), { ecmaVersion: 'latest', sourceType: 'module' }), file)
  }
})

test('validation rejects unsafe or impossible automations', () => {
  const broken = structuredClone(BASE)
  broken.automations[0].action.args = { title: { from: 'value', value: 'X' } } // startAt missing
  broken.automations[1].trigger.on = 'create' // "changed" on create
  broken.automations[2].action = { service: 'runly.calendar:events.create', args: { title: { from: 'actor' }, startAt: { from: 'field', field: 'nope' } } }
  const found = codes(broken)
  for (const code of ['AUTOMATION_ARG_REQUIRED', 'AUTOMATION_CONDITION_INVALID', 'AUTOMATION_SERVICE_NEEDS_USER', 'AUTOMATION_FIELD_NOT_FOUND', 'AUTOMATION_ARG_INVALID']) {
    assert.ok(found.includes(code), `${code} in ${found}`)
  }
  const readOnly = structuredClone(BASE)
  readOnly.automations = [{ ...BASE.automations[0], action: { service: 'runly.contacts:contacts.search', args: {} } }]
  assert.ok(codes(readOnly).includes('AUTOMATION_SERVICE_READONLY'))
})

test('automation dependencies are derived, preserve explicit entries and inspect with the same compiler', async () => {
  const input = structuredClone(BASE)
  input.dependencies = [{ key: 'runly.core' }, { key: 'runly.calendar' }, { key: 'runly.files' }]
  const compiled = compileModule(input)
  assert.deepEqual(compiled.definition.dependencies, [
    ...input.dependencies, { key: 'runly.notifications' }, { key: 'runly.contacts' },
  ])
  assert.deepEqual(compileModule(compiled.definition).definition, compiled.definition)
  const report = inspectModuleZip(await archiveModule(compiled))
  assert.equal(report.valid, true, JSON.stringify(report.diagnostics))
  assert.equal(report.generatedMatch, true)
  assert.deepEqual(report.definition.automations, compiled.definition.automations)
  assert.ok(report.files.some((file) => file.path === 'api/events.js'))
})

test('invalid automation shapes and UUID literals yield diagnostics and block compilation', () => {
  for (const change of [
    (a) => { a.label = 123 },
    (a) => { a.action.args = null },
    (a) => { a.action.args.sourceEntityId = { from: 'value', value: 'not-a-uuid' } },
    (a) => { a.action.service = '__proto__' },
    (a) => { a.action.args.toString = { from: 'value', value: 'ignored' } },
    (a) => { a.trigger = { type: 'event', event: 'toString' }; a.action = { service: 'runly.contacts:contacts.create', args: { name: { from: 'value', value: 'Ana' } } } },
  ]) {
    const input = structuredClone(BASE)
    change(input.automations[0])
    assert.equal(validateModuleDefinition(input).valid, false)
    assert.throws(() => compileModule(input))
  }
  assert.ok(codes({ ...BASE, automations: null }).includes('AUTOMATIONS_INVALID'))
})

test('generated runtime maps args, conditions and idempotency', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'runly-automations-'))
  const file = path.join(dir, 'automations.mjs')
  writeFileSync(file, fileOf(compileModule(structuredClone(BASE)), 'api/automations.js'))
  const runtime = await import(pathToFileURL(file).href)

  const calls = []
  const services = { call: async (service, args) => { calls.push({ service, args }); if (service.startsWith('runly.notifications')) throw Object.assign(new Error('sin permiso'), { code: 'permission_denied' }) } }
  const c = { get: (key) => (key === 'userId' ? 'user-1' : null) }
  const moduleContext = { services: { forRequest: () => services } }
  const record = { id: 'rec-1', folio: 'OS-7', fecha: '2026-10-06T16:00:00.000Z', estado: 'abierta' }

  assert.deepEqual(await runtime.runRecordAutomations({ c, moduleContext, entity: 'orden', on: 'create', record }), [{ key: 'agendar_visita', ok: true }])
  assert.deepEqual(calls[0], { service: 'runly.calendar:events.create', args: { title: 'Visita OS-7', startAt: record.fecha, reminderMinutes: [30], sourceEntityId: 'rec-1', idempotencyKey: 'agendar_visita:rec-1:create' } })

  // Update without a change in "estado": nothing runs; with a change: actor wrapped in an array, failure reported.
  assert.deepEqual(await runtime.runRecordAutomations({ c, moduleContext, entity: 'orden', on: 'update', record, previous: { ...record } }), [])
  const results = await runtime.runRecordAutomations({ c, moduleContext, entity: 'orden', on: 'update', record: { ...record, estado: 'cerrada' }, previous: record })
  assert.equal(results[0].ok, false)
  assert.equal(results[0].code, 'permission_denied')
  assert.deepEqual(calls.at(-1).args, { userIds: ['user-1'], title: 'Orden OS-7: cerrada', sourceEntityId: 'rec-1' })

  const handlers = runtime.createEventHandlers()
  await handlers['fleet.vehicle.updated']({ payload: { id: 'v1', plate: 'ABC', status: 'active' }, eventId: 'e1', services })
  assert.equal(calls.length, 2) // condition not met
  await handlers['fleet.vehicle.updated']({ payload: { id: 'v1', plate: 'ABC', status: 'maintenance' }, eventId: 'e2', services })
  assert.deepEqual(calls.at(-1), { service: 'runly.contacts:contacts.create', args: { name: 'Taller ABC', type: 'company', idempotencyKey: 'taller:e2' } })
})

const STEPS = {
  key: 'cadena', label: 'Cadena', enabled: true,
  trigger: { type: 'record', entity: 'orden', on: 'save', when: [{ field: 'folio', op: 'contains', value: 'OS' }, { field: 'estado', op: 'not_equals', value: 'cerrada' }] },
  steps: [
    { service: 'runly.notifications:notifications.send', args: { userIds: { from: 'actor' }, title: { from: 'template', template: 'Aviso {{folio}}' } } },
    { service: 'runly.calendar:events.create', args: { title: { from: 'template', template: 'Visita {{folio}}' }, startAt: { from: 'field', field: 'fecha' } } },
  ],
}

test('steps and multiple conditions validate, normalize and keep v1 compatibility', () => {
  const ok = { ...structuredClone(BASE), automations: [STEPS] }
  assert.deepEqual(codes(ok), [])
  const both = { ...structuredClone(BASE), automations: [{ ...STEPS, action: BASE.automations[0].action }] }
  assert.ok(codes(both).includes('AUTOMATION_STEPS_INVALID'))
  const tooMany = { ...structuredClone(BASE), automations: [{ ...STEPS, steps: Array(6).fill(STEPS.steps[0]) }] }
  assert.ok(codes(tooMany).includes('AUTOMATION_STEPS_INVALID'))
  const badStep = structuredClone(ok)
  badStep.automations[0].steps[1].args.title = { from: 'field', field: 'nope' }
  const errors = validateModuleDefinition(badStep).errors
  assert.ok(errors.some((e) => e.path === 'automations[0].steps[1].args.title' && e.code === 'AUTOMATION_FIELD_NOT_FOUND'))
  const badCondition = structuredClone(ok)
  badCondition.automations[0].trigger.when[1] = { field: 'estado', op: 'gt', value: 'x' }
  assert.ok(codes(badCondition).includes('AUTOMATION_CONDITION_INVALID'))
  // v1 `action` definitions compile to a single step.
  const v1 = compileModule(structuredClone(BASE))
  assert.match(fileOf(v1, 'api/automations.js'), /"steps": \[/)
})

test('generated runtime runs steps in order, stops or continues on error and logs the run', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'runly-automations-steps-'))
  const definition = { ...structuredClone(BASE), automations: [STEPS, { ...STEPS, key: 'sigue', onError: 'continue' }] }
  writeFileSync(path.join(dir, 'automations.mjs'), fileOf(compileModule(definition), 'api/automations.js'))
  const runtime = await import(pathToFileURL(path.join(dir, 'automations.mjs')).href)

  const calls = []
  const services = { call: async (service, args) => { calls.push({ service, args }); if (service.startsWith('runly.notifications')) throw new Error('falla') } }
  const logs = []
  const moduleContext = { services: { forRequest: () => services }, automations: { log: async (_c, entry) => { logs.push(entry) } } }
  const c = { get: () => 'user-1' }
  const record = { id: 'rec-1', folio: 'OS-7', fecha: '2026-10-06T16:00:00.000Z', estado: 'abierta' }

  const results = await runtime.runRecordAutomations({ c, moduleContext, entity: 'orden', on: 'create', record })
  assert.equal(results.length, 2)
  // "cadena" stops after the failing first step; "sigue" continues to the second.
  assert.deepEqual(calls.map((call) => call.service), ['runly.notifications:notifications.send', 'runly.notifications:notifications.send', 'runly.calendar:events.create'])
  assert.equal(calls[2].args.idempotencyKey, 'sigue:rec-1:create:1')
  assert.deepEqual(logs.map((l) => [l.automationKey, l.status]), [['cadena', 'failed'], ['sigue', 'partial']])
  assert.equal(logs[0].steps[1].skipped, true)

  // Conditions: all must hold.
  calls.length = 0
  assert.deepEqual(await runtime.runRecordAutomations({ c, moduleContext, entity: 'orden', on: 'create', record: { ...record, estado: 'cerrada' } }), [])
})
