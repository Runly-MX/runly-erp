import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrowthDomainMonitorsHook } from '../growth-domain-monitors.js'

function fake({ installed = true, disabledForCompany = false, property = { id: 'p1' }, existing = [] } = {}) {
  const created = []
  const prisma = {
    runlyModule: { findFirst: async () => (installed ? { id: 'm1' } : null) },
    companyModule: { findFirst: async () => (disabledForCompany ? { moduleId: 'm1' } : null) },
    growthMonitor: {
      findMany: async () => existing,
      create: async ({ data }) => created.push(data),
    },
  }
  const propertyService = { resolveProperty: async ({ propertyId }) => (property && propertyId === 's1' ? property : null) }
  return { created, hook: createGrowthDomainMonitorsHook({ prisma, propertyService }) }
}
const info = { companyId: 'c1', siteId: 's1', hostname: 'www.mitienda.mx' }

test('a verified custom domain gets http, ssl and a daily domain monitor', async () => {
  const { hook, created } = fake()
  assert.deepEqual(await hook(info), { created: 3 })
  assert.deepEqual(created.map((m) => m.type), ['http', 'ssl', 'domain'])
  assert.equal(created[0].config.url, 'https://www.mitienda.mx/')
  assert.equal(created[2].intervalSeconds, 86400)
  assert.ok(created.every((m) => m.companyId === 'c1' && m.propertyId === 'p1'))
})

test('it is idempotent: existing monitors for that host are not duplicated', async () => {
  const { hook, created } = fake({ existing: [{ type: 'http', config: { url: 'https://www.mitienda.mx/' } }, { type: 'ssl', config: { host: 'www.mitienda.mx' } }] })
  assert.deepEqual(await hook(info), { created: 1 })
  assert.deepEqual(created.map((m) => m.type), ['domain'])
})

test('it does nothing when Growth is not installed, is disabled for the company, or has no property', async () => {
  for (const [options, reason] of [[{ installed: false }, 'growth_not_installed'], [{ disabledForCompany: true }, 'growth_disabled_for_company'], [{ property: null }, 'no_property']]) {
    const { hook, created } = fake(options)
    assert.deepEqual(await hook(info), { skipped: reason, created: 0 })
    assert.equal(created.length, 0)
  }
})
