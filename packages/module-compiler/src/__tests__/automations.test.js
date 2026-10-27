import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as acorn from 'acorn'
import { compileModule, validateModuleDefinition } from '../index.js'
import { archiveModule } from '../archive.js'
import { validateDefinitionAutomations } from '../automations.js'
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
  const tooMany = { ...structuredClone(BASE), automations: [{ ...STEPS, steps: Array(13).fill(STEPS.steps[0]) }] }
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

const SYSTEM_STEP = { service: 'runly.notifications:notifications.send', args: { userIds: { from: 'actor' }, title: { from: 'template', template: 'Seguimiento {{folio}}' } } }
const CONTACT_STEP = { service: 'runly.contacts:contacts.create', args: { name: { from: 'template', template: 'Cliente {{folio}}' }, type: { from: 'value', value: 'company' } } }
const WAITING = {
  key: 'seguimiento', label: 'Seguimiento', enabled: true,
  trigger: { type: 'record', entity: 'orden', on: 'create' },
  steps: [CONTACT_STEP, { type: 'delay', amount: 3, unit: 'days' }, CONTACT_STEP],
}
const SCHEDULED = {
  key: 'revision', label: 'Revisión semanal', enabled: true,
  trigger: { type: 'schedule', every: 'week', weekday: 1, at: '08:00', entity: 'orden', when: { field: 'estado', op: 'equals', value: 'abierta' } },
  steps: [CONTACT_STEP],
}

test('waits and schedules validate: placement, system-only services, trigger shape', () => {
  const ok = { ...structuredClone(BASE), automations: [WAITING, SCHEDULED] }
  assert.deepEqual(codes(ok), [])
  const first = { ...structuredClone(BASE), automations: [{ ...WAITING, steps: [{ type: 'delay', amount: 1, unit: 'hours' }, CONTACT_STEP] }] }
  assert.ok(codes(first).includes('AUTOMATION_DELAY_INVALID'))
  const tooLong = { ...structuredClone(BASE), automations: [{ ...WAITING, steps: [CONTACT_STEP, { type: 'delay', amount: 31, unit: 'days' }, CONTACT_STEP] }] }
  assert.ok(codes(tooLong).includes('AUTOMATION_DELAY_INVALID'))
  // A service that needs a person cannot run after a wait or on a schedule.
  const userStep = { service: 'runly.calendar:events.create', args: { title: { from: 'value', value: 'x' }, startAt: { from: 'field', field: 'fecha' } } }
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...WAITING, steps: [CONTACT_STEP, { type: 'delay', amount: 1, unit: 'days' }, userStep] }] }).includes('AUTOMATION_SERVICE_NEEDS_USER'))
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...SCHEDULED, steps: [userStep] }] }).includes('AUTOMATION_SERVICE_NEEDS_USER'))
  const badSchedule = { ...structuredClone(BASE), automations: [{ ...SCHEDULED, trigger: { type: 'schedule', every: 'month', at: '25:00', day: 30 } }] }
  assert.ok(codes(badSchedule).includes('AUTOMATION_TRIGGER_INVALID'))
  const compiled = compileModule(ok)
  assert.match(fileOf(compiled, 'module.manifest.js'), /schedules: \[\{"key":"revision","every":"week","at":"08:00","weekday":1\}\]/)
  assert.match(fileOf(compiled, 'module.manifest.js'), /"runly.contacts":\["contacts.create"\]/)
})

test('generated runtime queues a wait, resumes after it and fires schedules', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'runly-automations-wait-'))
  const definition = { ...structuredClone(BASE), automations: [WAITING, SCHEDULED] }
  writeFileSync(path.join(dir, 'automations.mjs'), fileOf(compileModule(definition), 'api/automations.js'))
  const runtime = await import(pathToFileURL(path.join(dir, 'automations.mjs')).href)

  const calls = []
  const services = { call: async (service, args) => { calls.push({ service, args }) } }
  const jobs = []
  const logs = []
  const log = async (entry) => { logs.push(entry); return { id: 'run-1' } }
  const enqueue = async (job) => { jobs.push(job) }
  const moduleContext = { services: { forRequest: () => services }, automations: { log: async (_c, entry) => log(entry), enqueue: async (_c, job) => enqueue(job) } }
  const c = { get: () => 'user-1' }
  const record = { id: 'rec-1', folio: 'OS-9', estado: 'abierta' }

  const results = await runtime.runRecordAutomations({ c, moduleContext, entity: 'orden', on: 'create', record })
  assert.deepEqual(results, [{ key: 'seguimiento', ok: true }])
  assert.equal(calls.length, 1) // only the step before the wait
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].fromStep, 2)
  assert.equal(jobs[0].runId, 'run-1')
  assert.equal(jobs[0].dedupe, 'seguimiento:rec-1:create:w2')
  assert.ok(Date.parse(jobs[0].runAt) - Date.now() > 2.9 * 86_400_000)
  assert.deepEqual(logs.map((l) => l.status), ['running', 'waiting'])

  // The worker resumes from step 2: the step after the wait runs with its own idempotency key.
  calls.length = 0
  logs.length = 0
  await runtime.resume({ job: { automationKey: 'seguimiento', fromStep: 2, runId: 'run-1', payload: jobs[0].payload }, services, log, enqueue })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args.idempotencyKey, 'seguimiento:rec-1:create:2')
  assert.equal(logs.at(-1).status, 'success')
  assert.equal(logs.at(-1).runId, 'run-1')

  // Schedule with an entity: one run per matching record, keyed by the occurrence.
  calls.length = 0
  const rows = [{ id: 'a', folio: 'OS-1', estado: 'abierta' }, { id: 'b', folio: 'OS-2', estado: 'cerrada' }]
  const prisma = { $queryRawUnsafe: async (sql) => { assert.match(sql, /FROM "custom_servicio_orden"|FROM "[a-z_]+_orden"/); return rows } }
  const fired = await runtime.runScheduled({ key: 'revision', companyId: 'co-1', occurrence: '2026-10-26T14:00:00.000Z', prisma, services, log, enqueue })
  assert.equal(fired.runs, 1)
  assert.equal(calls[0].args.idempotencyKey, 'revision:a:2026-10-26T14:00:00.000Z')
})

const APPROVER = '01a10900-0000-7000-8000-000000000001'
const HTTP_STEP = { type: 'http', method: 'POST', url: 'https://hooks.example.com/runly', body: { folio: { from: 'field', field: 'folio' }, nota: { from: 'template', template: 'Orden {{folio}}' } } }
const APPROVAL_STEP = { type: 'approval', approvers: [APPROVER], message: 'Aprobar la orden {{folio}}' }
const GATED = {
  key: 'compuerta', label: 'Compuerta', enabled: true,
  trigger: { type: 'record', entity: 'orden', on: 'create' },
  steps: [HTTP_STEP, APPROVAL_STEP, CONTACT_STEP],
}

test('http and approval steps validate placement, shape and sources', () => {
  assert.deepEqual(codes({ ...structuredClone(BASE), automations: [GATED] }), [])
  const bad = (step) => codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [HTTP_STEP, step, CONTACT_STEP] }] })
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [{ ...HTTP_STEP, url: 'http://hooks.example.com/x' }, CONTACT_STEP] }] }).includes('AUTOMATION_HTTP_INVALID'))
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [{ ...HTTP_STEP, url: 'https://user:pw@hooks.example.com/x' }, CONTACT_STEP] }] }).includes('AUTOMATION_HTTP_INVALID'))
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [{ ...HTTP_STEP, method: 'DELETE' }, CONTACT_STEP] }] }).includes('AUTOMATION_HTTP_INVALID'))
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [{ ...HTTP_STEP, body: { folio: { from: 'field', field: 'nope' } } }, CONTACT_STEP] }] }).includes('AUTOMATION_FIELD_NOT_FOUND'))
  assert.ok(bad({ ...APPROVAL_STEP, approvers: [] }).includes('AUTOMATION_APPROVAL_INVALID'))
  assert.ok(bad({ ...APPROVAL_STEP, approvers: ['not-an-id'] }).includes('AUTOMATION_APPROVAL_INVALID'))
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [CONTACT_STEP, APPROVAL_STEP, CONTACT_STEP, APPROVAL_STEP, CONTACT_STEP] }] }).includes('AUTOMATION_APPROVAL_INVALID'))
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [APPROVAL_STEP, CONTACT_STEP] }] }).includes('AUTOMATION_APPROVAL_INVALID'))
  // Services after an approval must run without a person.
  const userStep = { service: 'runly.calendar:events.create', args: { title: { from: 'value', value: 'x' }, startAt: { from: 'field', field: 'fecha' } } }
  assert.ok(codes({ ...structuredClone(BASE), automations: [{ ...GATED, steps: [CONTACT_STEP, APPROVAL_STEP, userStep] }] }).includes('AUTOMATION_SERVICE_NEEDS_USER'))
  // The manifest only consumes real services; http/approval steps add none.
  assert.match(fileOf(compileModule({ ...structuredClone(BASE), automations: [GATED] }), 'module.manifest.js'), /consumes: \{"runly.contacts":\["contacts.create"\]\}/)
})

test('generated runtime calls HTTP through the host only and parks the run at an approval', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'runly-automations-gated-'))
  writeFileSync(path.join(dir, 'automations.mjs'), fileOf(compileModule({ ...structuredClone(BASE), automations: [GATED] }), 'api/automations.js'))
  const runtime = await import(pathToFileURL(path.join(dir, 'automations.mjs')).href)
  const calls = []
  const services = { call: async (service, args) => { calls.push({ service, args }) } }
  const requests = []
  const approvals = []
  const logs = []
  const moduleContext = {
    services: { forRequest: () => services },
    automations: {
      log: async (_c, entry) => { logs.push(entry); return { id: 'run-9' } },
      http: async (_c, request) => { requests.push(request) },
      approve: async (_c, request) => { approvals.push(request) },
    },
  }
  const record = { id: 'rec-5', folio: 'OS-5' }
  const results = await runtime.runRecordAutomations({ c: { get: () => 'user-1' }, moduleContext, entity: 'orden', on: 'create', record })
  assert.deepEqual(results, [{ key: 'compuerta', ok: true }])
  assert.deepEqual(requests[0].body, { folio: 'OS-5', nota: 'Orden OS-5' })
  assert.equal(requests[0].url, 'https://hooks.example.com/runly')
  assert.equal(requests[0].idempotencyKey, 'compuerta:rec-5:create')
  assert.equal(approvals.length, 1)
  assert.equal(approvals[0].message, 'Aprobar la orden OS-5')
  assert.equal(approvals[0].fromStep, 2)
  assert.equal(approvals[0].runId, 'run-9')
  assert.equal(calls.length, 0) // the contact step waits for the decision
  assert.equal(logs.at(-1).status, 'waiting')
  // Without host support the steps fail instead of falling back to anything else.
  const bare = await runtime.runRecordAutomations({ c: { get: () => 'user-1' }, moduleContext: { services: { forRequest: () => services } }, entity: 'orden', on: 'create', record })
  assert.equal(bare[0].ok, false)
  assert.match(bare[0].error, /HTTP no están disponibles/)
})

test('previewAutomation shows conditions and the exact arguments without calling anything', async () => {
  const { previewAutomation } = await import('../automations-preview.js')
  const automation = { ...STEPS, steps: [STEPS.steps[0], { type: 'delay', amount: 2, unit: 'hours' }, CONTACT_STEP, HTTP_STEP, APPROVAL_STEP] }
  const pass = previewAutomation(automation, { data: { id: 'r1', folio: 'OS-8', fecha: '2026-11-01T10:00:00Z', estado: 'abierta' } })
  assert.equal(pass.passes, true)
  assert.equal(pass.steps[0].args.title, 'Aviso OS-8')
  assert.equal(pass.steps[0].problems.length, 0)
  assert.match(pass.steps[1].summary, /2 hora/)
  assert.equal(pass.steps[3].body.nota, 'Orden OS-8')
  assert.equal(pass.steps[4].message, 'Aprobar la orden OS-8')
  const blocked = previewAutomation(automation, { data: { folio: 'X-1', estado: 'abierta' } })
  assert.equal(blocked.passes, false)
  assert.deepEqual(blocked.steps, [])
  assert.equal(blocked.conditions[0].passes, false)
})

test('steps can use the results of earlier steps (paso<N>_<key>) and the layout is validated and normalized', async () => {
  const chain = {
    key: 'encadena', label: 'Encadena', enabled: true,
    trigger: { type: 'record', entity: 'orden', on: 'create' },
    steps: [CONTACT_STEP, { service: 'runly.notifications:notifications.send', args: { userIds: { from: 'actor' }, title: { from: 'template', template: 'Contacto {{paso1_id}} para {{folio}}' }, sourceEntityId: { from: 'field', field: 'paso1_id' } } }],
    ui: { layout: 'free', trigger: { x: 10.4, y: 20.6 }, steps: [{ x: 300, y: 40 }, null] },
  }
  assert.deepEqual(codes({ ...structuredClone(BASE), automations: [chain] }), [])
  // The first step cannot use its own result nor a later one.
  const early = structuredClone(chain)
  early.steps[0].args.name = { from: 'template', template: '{{paso1_id}}' }
  assert.ok(codes({ ...structuredClone(BASE), automations: [early] }).includes('AUTOMATION_FIELD_NOT_FOUND'))
  const badUi = structuredClone(chain)
  badUi.ui = { layout: 'diagonal', steps: [{ x: 'a', y: 1 }] }
  assert.ok(codes({ ...structuredClone(BASE), automations: [badUi] }).includes('AUTOMATION_UI_INVALID'))
  const compiled = compileModule({ ...structuredClone(BASE), automations: [chain] })
  assert.match(fileOf(compiled, 'api/automations.js'), /"ui": \{\s+"layout": "free",\s+"trigger": \{\s+"x": 10,\s+"y": 21/)

  // At run time the id returned by step 1 reaches step 2, and the log keeps what was sent.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'runly-automations-chain-'))
  writeFileSync(path.join(dir, 'automations.mjs'), fileOf(compiled, 'api/automations.js'))
  const runtime = await import(pathToFileURL(path.join(dir, 'automations.mjs')).href)
  const calls = []
  const services = { call: async (service, args) => { calls.push({ service, args }); return service.includes('contacts') ? { id: '01a10900-0000-7000-8000-0000000000aa', name: 'x' } : { id: 'n1' } } }
  const logs = []
  const moduleContext = { services: { forRequest: () => services }, automations: { log: async (_c, entry) => { logs.push(entry); return { id: 'r' } } } }
  await runtime.runRecordAutomations({ c: { get: () => '01a10900-0000-7000-8000-0000000000bb' }, moduleContext, entity: 'orden', on: 'create', record: { id: '01a10900-0000-7000-8000-0000000000cc', folio: 'OS-9' } })
  assert.equal(calls[1].args.title, 'Contacto 01a10900-0000-7000-8000-0000000000aa para OS-9')
  assert.equal(calls[1].args.sourceEntityId, '01a10900-0000-7000-8000-0000000000aa')
  const [first, second] = logs.at(-1).steps
  assert.equal(first.output.id, '01a10900-0000-7000-8000-0000000000aa')
  assert.equal(second.args.title, 'Contacto 01a10900-0000-7000-8000-0000000000aa para OS-9')
  assert.equal(typeof first.ms, 'number')
})

test('previewAutomation passes simulated results of one step to the next', async () => {
  const { previewAutomation } = await import('../automations-preview.js')
  const automation = {
    key: 'p', label: 'p', trigger: { type: 'record', entity: 'orden', on: 'create' },
    steps: [CONTACT_STEP, { service: 'runly.notifications:notifications.send', args: { userIds: { from: 'actor' }, title: { from: 'template', template: 'Contacto {{paso1_id}}' } } }],
  }
  const preview = previewAutomation(automation, { data: { id: 'r1', folio: 'OS-1' } })
  assert.equal(preview.steps[1].args.title, 'Contacto 00000000-0000-7000-8000-00000000a003')
  assert.equal(preview.steps[1].problems.length, 0)
})

test('a text with data cannot fill a people list', () => {
  const errors = []
  validateDefinitionAutomations({ entities: [], automations: [{ key: 'aviso', label: 'Aviso', trigger: { type: 'event', event: 'inventory.item.created' }, steps: [{ service: 'runly.notifications:notifications.send', args: { title: { from: 'value', value: 'Hola' }, userIds: { from: 'template', template: 'Hola {{name}}' } } }] }] }, errors)
  assert.ok(errors.some((error) => error.path.endsWith('args.userIds') && error.code === 'AUTOMATION_ARG_INVALID'))
})
