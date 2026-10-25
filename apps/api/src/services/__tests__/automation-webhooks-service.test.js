import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationWebhooksService, flattenPayload, isOriginAllowed } from '../automation-webhooks-service.js'
import { createSystemAutomationsService } from '../system-automations-service.js'

test('flattenPayload turns nested JSON into safe, flat field names', () => {
  assert.deepEqual(flattenPayload({ cliente: { nombre: 'Ana', dir: { ciudad: 'MX' } }, total: 12.5, activo: true, nota: null, 'raro key!': 'x', 1: 'num' }), {
    cliente_nombre: 'Ana', cliente_dir_ciudad: 'MX', total: 12.5, activo: true, nota: null, raro_key: 'x', f_1: 'num',
  })
  assert.equal(flattenPayload({ items: [1, 2, 3] }).items, '[1,2,3]')
  assert.equal(Object.keys(flattenPayload(Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, i])))).length, 100)
  assert.equal(flattenPayload({ a: { b: { c: { d: 'deep' } } } }).a_b_c, '{"d":"deep"}')
})

test('origins: empty list allows everyone, otherwise IPs and networks', () => {
  assert.equal(isOriginAllowed('8.8.8.8', []), true)
  assert.equal(isOriginAllowed('203.0.113.7', ['203.0.113.7']), true)
  assert.equal(isOriginAllowed('203.0.113.9', ['203.0.113.7']), false)
  assert.equal(isOriginAllowed('203.0.113.200', ['203.0.113.0/24']), true)
  assert.equal(isOriginAllowed('::ffff:203.0.113.5', ['203.0.113.0/24']), true)
  assert.equal(isOriginAllowed('2001:db8::1', ['2001:db8::/32']), true)
  assert.equal(isOriginAllowed('not-an-ip', ['203.0.113.0/24']), false)
})

function fakePrisma({ origins = null } = {}) {
  const config = new Map(origins ? [['automation_inbound_origins', JSON.stringify(origins)]] : [])
  const events = []
  const outbox = []
  const automation = { id: 's1', companyId: 'c1', key: 'pedido', enabled: true, webhookToken: 'T'.repeat(32), definition: { trigger: { type: 'webhook', fields: [] }, steps: [] } }
  return {
    events, outbox, automation,
    instanceConfig: {
      findUnique: async ({ where }) => (config.has(where.key) ? { value: config.get(where.key) } : null),
      upsert: async ({ where, create }) => { config.set(where.key, create.value) },
    },
    systemAutomation: { findUnique: async ({ where }) => (where.webhookToken === automation.webhookToken ? automation : null) },
    automationWebhookEvent: {
      create: async ({ data }) => { const row = { id: `e${events.length + 1}`, createdAt: new Date(events.length), ...data }; events.unshift(row); return row },
      findMany: async ({ skip = 0, take }) => events.slice(skip, take ? skip + take : undefined),
      deleteMany: async ({ where }) => { for (const id of where.id.in) { const i = events.findIndex((e) => e.id === id); if (i >= 0) events.splice(i, 1) } },
    },
    domainEventOutbox: { create: async ({ data }) => { outbox.push(data); return data } },
  }
}

test('ingest validates the token, origin, size and format, stores the message and queues the event', async () => {
  const prisma = fakePrisma()
  const svc = createAutomationWebhooksService({ prisma })
  const token = prisma.automation.webhookToken
  const ok = await svc.ingest({ token, bodyText: JSON.stringify({ cliente: { nombre: 'Ana' }, total: 5 }), contentType: 'application/json', ip: '1.2.3.4' })
  assert.equal(ok.received, 2)
  assert.deepEqual(prisma.outbox[0], { companyId: 'c1', event: 'automations.webhook.received', payload: { automationKey: 'pedido', data: { cliente_nombre: 'Ana', total: 5 } } })
  assert.equal(prisma.events[0].sourceIp, '1.2.3.4')

  await assert.rejects(svc.ingest({ token: 'x'.repeat(32), bodyText: '{}', ip: '1.1.1.1' }), (e) => e.status === 404)
  await assert.rejects(svc.ingest({ token: 'corto', bodyText: '{}', ip: '1.1.1.1' }), (e) => e.status === 404)
  await assert.rejects(svc.ingest({ token, bodyText: 'no json', contentType: 'application/json', ip: '1.1.1.1' }), (e) => e.status === 400)
  await assert.rejects(svc.ingest({ token, bodyText: '5', contentType: 'application/json', ip: '1.1.1.1' }), (e) => e.status === 400)
  await assert.rejects(svc.ingest({ token, bodyText: '{}', contentType: 'text/plain', ip: '1.1.1.1' }), (e) => e.status === 415)
  await assert.rejects(svc.ingest({ token, bodyText: JSON.stringify({ x: 'y'.repeat(70000) }), contentType: 'application/json', ip: '1.1.1.1' }), (e) => e.status === 413)
  prisma.automation.enabled = false
  await assert.rejects(svc.ingest({ token, bodyText: '{}', ip: '1.1.1.1' }), (e) => e.status === 404)
})

test('a configured origin list blocks other senders; the list is validated', async () => {
  const prisma = fakePrisma()
  const svc = createAutomationWebhooksService({ prisma })
  await assert.rejects(svc.setOrigins(['no es ip']), /no es una dirección IP/)
  await assert.rejects(svc.setOrigins(['10.0.0.0/99']), /no es una dirección IP/)
  assert.deepEqual(await svc.setOrigins([' 203.0.113.0/24 ', '203.0.113.0/24', '2001:db8::1']), ['203.0.113.0/24', '2001:db8::1'])
  const token = prisma.automation.webhookToken
  await assert.rejects(svc.ingest({ token, bodyText: '{}', ip: '8.8.8.8' }), (e) => e.status === 403)
  assert.ok(await svc.ingest({ token, bodyText: '{}', ip: '203.0.113.50' }))
})

test('only the last 20 messages are kept and the rate limit answers 429', async () => {
  const prisma = fakePrisma()
  let clock = 1_000_000
  const svc = createAutomationWebhooksService({ prisma, now: () => new Date(clock) })
  const token = prisma.automation.webhookToken
  for (let i = 0; i < 60; i += 1) await svc.ingest({ token, bodyText: JSON.stringify({ n: i }), ip: '1.1.1.1' })
  assert.equal(prisma.events.length, 20)
  await assert.rejects(svc.ingest({ token, bodyText: '{}', ip: '1.1.1.1' }), (e) => e.status === 429)
  clock += 61_000
  assert.ok(await svc.ingest({ token, bodyText: '{}', ip: '1.1.1.1' }))
})

test('a webhook message runs only its automation, with the fields as data', async () => {
  const rows = new Map()
  const calls = []
  const prisma = {
    systemAutomation: {
      findMany: async ({ where }) => [...rows.values()].filter((row) => row.companyId === where.companyId && row.enabled),
      findUnique: async () => null, count: async () => 0,
      create: async ({ data }) => { const row = { id: `s${rows.size}`, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.set(data.key, row); return row },
    },
    moduleServiceGrant: { deleteMany: async () => {}, createMany: async () => {} },
    automationRun: { create: async ({ data }) => ({ id: 'r1', ...data }) },
  }
  const moduleServices = { forSystem: () => ({ call: async (service, args) => { calls.push(args) } }) }
  const svc = createSystemAutomationsService({ prisma, moduleServices })
  const make = (key) => ({
    key, label: key, enabled: true,
    trigger: { type: 'webhook', fields: [{ key: 'cliente_nombre', label: 'Cliente' }, { key: 'total' }], when: { field: 'total', op: 'gt', value: 10 } },
    steps: [{ service: 'runly.contacts:contacts.create', args: { name: { from: 'template', template: 'Pedido de {{cliente_nombre}}' }, type: { from: 'value', value: 'company' } } }],
  })
  const created = await svc.create({ companyId: 'c1', input: make('pedido') })
  assert.ok(created.webhookToken && created.webhookToken.length >= 24)
  await svc.create({ companyId: 'c1', input: make('otro') })

  assert.deepEqual(await svc.runEvent({ companyId: 'c1', event: 'automations.webhook.received', payload: { automationKey: 'pedido', data: { cliente_nombre: 'Ana', total: 5 } }, eventId: 'e1' }), { ran: 0 })
  assert.deepEqual(await svc.runEvent({ companyId: 'c1', event: 'automations.webhook.received', payload: { automationKey: 'pedido', data: { cliente_nombre: 'Ana', total: 50 } }, eventId: 'e2' }), { ran: 1 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'Pedido de Ana')
  assert.equal(calls[0].idempotencyKey, 'pedido:e2')
})
