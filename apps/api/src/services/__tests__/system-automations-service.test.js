import test from 'node:test'
import assert from 'node:assert/strict'
import { createSystemAutomationsService, SYSTEM_MODULE_KEY } from '../system-automations-service.js'

const NOW = new Date('2026-10-26T14:00:00Z')

function fakePrisma() {
  const rows = new Map()
  const grants = []
  const runs = []
  const db = {
    rows, grants, runs,
    systemAutomation: {
      findMany: async ({ where }) => [...rows.values()].filter((row) => row.companyId === where.companyId && (where.enabled === undefined || row.enabled === where.enabled)),
      findUnique: async ({ where }) => rows.get(`${where.companyId_key.companyId}|${where.companyId_key.key}`) ?? null,
      count: async ({ where }) => [...rows.values()].filter((row) => row.companyId === where.companyId).length,
      create: async ({ data }) => { const row = { id: `s${rows.size + 1}`, createdAt: NOW, updatedAt: NOW, ...data }; rows.set(`${data.companyId}|${data.key}`, row); return row },
      update: async ({ where, data }) => { const row = [...rows.values()].find((item) => item.id === where.id); Object.assign(row, data); return row },
      delete: async ({ where }) => { for (const [key, row] of rows) if (row.id === where.id) rows.delete(key) },
    },
    moduleServiceGrant: {
      deleteMany: async ({ where }) => { for (let i = grants.length - 1; i >= 0; i -= 1) if (grants[i].companyId === where.companyId && !where.serviceKey.notIn.includes(grants[i].serviceKey)) grants.splice(i, 1) },
      createMany: async ({ data }) => { for (const item of data) if (!grants.some((g) => g.companyId === item.companyId && g.serviceKey === item.serviceKey)) grants.push(item) },
    },
    automationRun: { create: async ({ data }) => { runs.push(data); return { id: `r${runs.length}`, ...data } }, findMany: async () => [] },
  }
  return db
}

const input = (extra = {}) => ({
  key: 'avisar', label: 'Avisar al aprobar', enabled: true,
  trigger: { type: 'event', event: 'purchases.order.approved', when: { field: 'status', op: 'equals', value: 'APPROVED' } },
  steps: [{ service: 'runly.contacts:contacts.create', args: { name: { from: 'template', template: 'Orden {{id}}' }, type: { from: 'value', value: 'company' } } }],
  ...extra,
})

test('save validates, normalizes, scopes to the company and keeps the grants in sync', async () => {
  const prisma = fakePrisma()
  const svc = createSystemAutomationsService({ prisma, now: () => NOW })
  const saved = await svc.create({ companyId: 'c1', actorId: 'u1', input: input() })
  assert.equal(saved.key, 'avisar')
  assert.equal(saved.trigger.event, 'purchases.order.approved')
  assert.deepEqual(prisma.grants.map((g) => g.serviceKey), ['runly.contacts:contacts.create'])
  assert.equal(prisma.grants[0].moduleKey, SYSTEM_MODULE_KEY)
  assert.equal(prisma.grants[0].companyId, 'c1')

  await assert.rejects(svc.create({ companyId: 'c1', input: input() }), /Ya existe/)
  const record = input({ key: 'por_registro', trigger: { type: 'record', entity: 'x', on: 'create' } })
  await assert.rejects(svc.create({ companyId: 'c1', input: record }), (error) => error.status === 422 && error.diagnostics.length > 0)
  const needsUser = input({ key: 'con_usuario', steps: [{ service: 'runly.calendar:events.create', args: { title: { from: 'value', value: 'x' }, startAt: { from: 'field', field: 'id' } } }] })
  await assert.rejects(svc.create({ companyId: 'c1', input: needsUser }), (error) => error.diagnostics.some((d) => d.code === 'AUTOMATION_SERVICE_NEEDS_USER'))

  assert.equal((await svc.list('c2')).length, 0)
  await svc.save({ companyId: 'c1', key: 'avisar', input: input({ label: 'Nuevo nombre', steps: [{ service: 'runly.notifications:notifications.send', args: { userIds: { from: 'value', value: ['01a10900-0000-7000-8000-000000000001'] }, title: { from: 'value', value: 'Hola' } } }] }) })
  assert.deepEqual(prisma.grants.map((g) => g.serviceKey), ['runly.notifications:notifications.send']) // the old one is gone
  await assert.rejects(svc.save({ companyId: 'c1', key: 'no_existe', input: input({ key: 'no_existe' }) }), /no encontrada/)
  await svc.remove({ companyId: 'c1', actorId: 'u1', key: 'avisar' })
  assert.equal(prisma.grants.length, 0)
})

test('runEvent runs only enabled automations of the company whose event and conditions match', async () => {
  const prisma = fakePrisma()
  const calls = []
  const moduleServices = { forSystem: (moduleKey, companyId) => ({ call: async (service, args) => { calls.push({ moduleKey, companyId, service, args }) } }) }
  const svc = createSystemAutomationsService({ prisma, moduleServices, now: () => NOW })
  await svc.create({ companyId: 'c1', input: input() })
  await svc.create({ companyId: 'c1', input: input({ key: 'pausada', enabled: false }) })
  await svc.create({ companyId: 'c2', input: input() })

  assert.deepEqual(await svc.runEvent({ companyId: 'c1', event: 'purchases.order.approved', payload: { id: 'o1', status: 'DRAFT' }, eventId: 'e1' }), { ran: 0 })
  assert.deepEqual(await svc.runEvent({ companyId: 'c1', event: 'purchases.order.issued', payload: { id: 'o1', status: 'APPROVED' }, eventId: 'e2' }), { ran: 0 })
  assert.deepEqual(await svc.runEvent({ companyId: 'c1', event: 'purchases.order.approved', payload: { id: 'o1', status: 'APPROVED' }, eventId: 'e3' }), { ran: 1 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].moduleKey, SYSTEM_MODULE_KEY)
  assert.equal(calls[0].companyId, 'c1')
  assert.equal(calls[0].args.name, 'Orden o1')
  assert.equal(calls[0].args.idempotencyKey, 'avisar:e3')
  assert.equal(prisma.runs.at(-1).moduleKey, SYSTEM_MODULE_KEY)
  assert.equal(prisma.runs.at(-1).status, 'success')

  // A failing step is reported to the dispatcher so it retries the event.
  const failing = { forSystem: () => ({ call: async () => { throw new Error('sin permiso') } }) }
  const broken = createSystemAutomationsService({ prisma, moduleServices: failing, now: () => NOW })
  await assert.rejects(broken.runEvent({ companyId: 'c1', event: 'purchases.order.approved', payload: { id: 'o1', status: 'APPROVED' }, eventId: 'e4' }), /avisar: sin permiso/)
})

test('schedule helpers only expose enabled schedule automations', async () => {
  const prisma = fakePrisma()
  prisma.systemAutomation.findMany = async ({ where }) => [...prisma.rows.values()].filter((row) => (where.companyId === undefined || row.companyId === where.companyId) && (where.enabled === undefined || row.enabled === where.enabled))
  const svc = createSystemAutomationsService({ prisma, now: () => NOW })
  await svc.create({ companyId: 'c1', input: input({ key: 'semanal', trigger: { type: 'schedule', every: 'week', weekday: 1, at: '08:00' } }) })
  await svc.create({ companyId: 'c1', input: input({ key: 'evento' }) })
  assert.deepEqual((await svc.listSchedules()).map((item) => [item.companyId, item.schedule.key, item.schedule.every]), [['c1', 'semanal', 'week']])
  assert.equal((await svc.scheduleOf({ companyId: 'c1', key: 'semanal' })).weekday, 1)
  assert.equal(await svc.scheduleOf({ companyId: 'c1', key: 'evento' }), null)
  assert.equal(await svc.scheduleOf({ companyId: 'c2', key: 'semanal' }), null)
})
