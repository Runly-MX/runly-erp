import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationsMiraiCapabilities } from '../mirai-capabilities.js'

function fakePrisma(rows = []) {
  const store = [...rows]
  return {
    store,
    systemAutomation: {
      findMany: async () => store,
      findUnique: async ({ where }) => store.find((row) => row.key === (where.companyId_key?.key ?? '')) ?? null,
      count: async () => store.length,
      create: async ({ data }) => { const row = { id: `id-${store.length}`, updatedAt: new Date(), ...data }; store.push(row); return row },
      update: async ({ where, data }) => { const row = store.find((item) => item.id === where.id); Object.assign(row, data); return row },
      delete: async ({ where }) => { store.splice(store.findIndex((item) => item.id === where.id), 1) },
    },
    moduleServiceGrant: { deleteMany: async () => {}, createMany: async () => {} },
    automationRun: { findMany: async () => [] },
  }
}
const actx = { companyId: 'c1', actorProfileId: 'p1' }
const action = (cap, key) => cap.actions.find((item) => item.key === key)
const steps = [{ service: 'runly.notifications:notifications.send', args: { userIds: { from: 'value', value: ['00000000-0000-7000-8000-00000000a001'] }, title: { from: 'template', template: 'Hola {{folio}}' } } }]

test('create validates, starts paused and never exposes the webhook url', async () => {
  const prisma = fakePrisma()
  const cap = createAutomationsMiraiCapabilities({ prisma })
  const create = action(cap, 'automations.automation.create')
  const bad = await create.prepare({ label: 'Mala', trigger: { type: 'event', event: 'no.existe' }, steps }, actx)
  assert.match(bad.error, /no es valida/)
  const ok = await create.prepare({ label: 'Aviso de pedidos', trigger: { type: 'webhook', fields: [{ key: 'folio' }] }, steps }, actx)
  assert.equal(ok.input.candidate.enabled, false)
  assert.equal(ok.input.candidate.key, 'aviso_de_pedidos')
  const done = await create.execute(ok.input, actx)
  assert.equal(prisma.store[0].enabled, false)
  assert.ok(!JSON.stringify(done).includes(prisma.store[0].webhookToken))
  const list = await cap.tools.find((tool) => tool.name === 'automations_list').run({}, actx)
  assert.equal(list.total, 1)
  assert.ok(!JSON.stringify(list).includes(prisma.store[0].webhookToken))
})

test('activate and delete go through the service', async () => {
  const prisma = fakePrisma()
  const cap = createAutomationsMiraiCapabilities({ prisma })
  const made = await action(cap, 'automations.automation.create').prepare({ label: 'Uno', trigger: { type: 'schedule', every: 'day', at: '08:00' }, steps: [{ ...steps[0], args: { ...steps[0].args, title: { from: 'value', value: 'Hola' } } }] }, actx)
  await action(cap, 'automations.automation.create').execute(made.input, actx)
  const toggle = action(cap, 'automations.automation.set_enabled')
  assert.match((await toggle.prepare({ key: 'uno', enabled: false }, actx)).error, /Ya estaba/)
  const prepared = await toggle.prepare({ key: 'uno', enabled: true }, actx)
  await toggle.execute(prepared.input, actx)
  assert.equal(prisma.store[0].enabled, true)
  const del = action(cap, 'automations.automation.delete')
  assert.match((await del.prepare({ key: 'nada' }, actx)).error, /No encontre/)
  await del.execute({ key: 'uno' }, actx)
  assert.equal(prisma.store.length, 0)
})

test('catalog lists events and background-safe actions', async () => {
  const cap = createAutomationsMiraiCapabilities({ prisma: fakePrisma() })
  const catalog = await cap.tools.find((tool) => tool.name === 'automations_catalog').run({}, actx)
  assert.ok(catalog.eventos.length > 0)
  assert.ok(catalog.acciones.some((item) => item.service === 'runly.notifications:email.send'))
})
