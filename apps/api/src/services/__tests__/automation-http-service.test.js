import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createAutomationHttpService, isPublicAddress } from '../automation-http-service.js'

function configPrisma(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    store,
    instanceConfig: {
      findUnique: async ({ where }) => (store.has(where.key) ? { value: store.get(where.key) } : null),
      upsert: async ({ where, create }) => { store.set(where.key, create.value) },
    },
  }
}

test('only public addresses are accepted', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1', 'not-an-ip']) {
    assert.equal(isPublicAddress(address), false, address)
  }
  for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPublicAddress(address), true, address)
  }
})

test('the allow-list is validated and normalized', async () => {
  const svc = createAutomationHttpService({ prisma: configPrisma() })
  assert.deepEqual(await svc.setHosts([' Hooks.Example.com ', 'hooks.example.com', 'api.partner.mx']), ['hooks.example.com', 'api.partner.mx'])
  assert.deepEqual(await svc.getHosts(), ['hooks.example.com', 'api.partner.mx'])
  await assert.rejects(svc.setHosts(['https://hooks.example.com']), /no es un nombre de host válido/)
  await assert.rejects(svc.setHosts(['10.0.0.1']), /no es un nombre de host válido/)
  await assert.rejects(svc.setHosts(['localhost']), /no es un nombre de host válido/)
})

function service(prisma, transport, resolveHost) {
  return createAutomationHttpService({ prisma, transport, resolveHost: resolveHost ?? (async () => [{ address: '93.184.216.34', family: 4 }]) })
}
const request = (overrides = {}) => ({ method: 'POST', url: 'https://hooks.example.com/runly?x=1', body: { folio: 'OS-1' }, automationKey: 'a', idempotencyKey: 'a:r1:create', ...overrides })

test('send rejects insecure, credentialed, non-listed destinations and sends the rest signed', async () => {
  const prisma = configPrisma({ automation_http_hosts: JSON.stringify(['hooks.example.com']) })
  const sent = []
  const svc = service(prisma, async (options) => { sent.push(options); return { status: 204, text: '' } })
  for (const url of ['http://hooks.example.com/x', 'https://user:pw@hooks.example.com/x', 'https://hooks.example.com:8443/x', 'nonsense']) {
    await assert.rejects(svc.send({ companyId: 'c1', moduleKey: 'custom.x', request: request({ url }) }), /https|dirección/)
  }
  await assert.rejects(svc.send({ companyId: 'c1', moduleKey: 'custom.x', request: request({ url: 'https://evil.example.org/x' }) }), /no está en la lista/)
  await assert.rejects(svc.send({ companyId: 'c1', moduleKey: 'custom.x', request: request({ method: 'DELETE' }) }), /Método/)
  assert.equal(sent.length, 0)

  const result = await svc.send({ companyId: 'c1', moduleKey: 'custom.x', request: request() })
  assert.equal(result.status, 204)
  const call = sent[0]
  assert.equal(call.host, 'hooks.example.com')
  assert.equal(call.path, '/runly?x=1')
  const secret = prisma.store.get('automation_http_secret')
  assert.ok(secret)
  const expected = crypto.createHmac('sha256', secret).update(call.body).digest('hex')
  assert.equal(call.headers['X-Runly-Signature'], `sha256=${expected}`)
  assert.deepEqual(JSON.parse(call.body), { module: 'custom.x', automation: 'a', companyId: 'c1', idempotencyKey: 'a:r1:create', data: { folio: 'OS-1' } })
})

test('non-2xx answers and oversized bodies fail the step; private resolution is refused at connect time', async () => {
  const prisma = configPrisma({ automation_http_hosts: JSON.stringify(['hooks.example.com']) })
  const failing = service(prisma, async () => ({ status: 500, text: 'boom' }))
  await assert.rejects(failing.send({ companyId: 'c1', moduleKey: 'm', request: request() }), /respondió 500: boom/)
  const ok = service(prisma, async () => ({ status: 200, text: '' }))
  await assert.rejects(ok.send({ companyId: 'c1', moduleKey: 'm', request: request({ body: { big: 'x'.repeat(70_000) } }) }), /64 KB/)

  const rebinding = service(prisma, async () => ({ status: 200, text: '' }), async () => [{ address: '10.0.0.5', family: 4 }])
  await new Promise((resolve) => rebinding.safeLookup('hooks.example.com', {}, (error) => {
    assert.match(error.message, /no pública/)
    resolve()
  }))
  const mixed = service(prisma, async () => ({ status: 200, text: '' }), async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }])
  await new Promise((resolve) => mixed.safeLookup('hooks.example.com', { all: true }, (error) => {
    assert.ok(error, 'one private address among public ones is enough to refuse')
    resolve()
  }))
})
