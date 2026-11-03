import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebsiteHostnameService } from '../website-hostname-service.js'
import { createWebsiteAccess } from '../website-authorization-service.js'

const allowed = createWebsiteAccess({ companyId: 'c1', actorId: 'u', can: () => true })
function fake() {
  const rows = new Map()
  const prisma = {
    websiteSite: { findFirst: async ({ where }) => (where.id === 's1' && where.companyId === 'c1' ? { id: 's1' } : null) },
    websiteDomain: {
      findUnique: async ({ where }) => rows.get(where.hostname) ?? null,
      findFirst: async ({ where }) => [...rows.values()].find((r) => r.hostname === where.hostname && r.companyId === where.companyId && r.siteId === where.siteId && r.registryManaged === where.registryManaged) ?? null,
      create: async ({ data }) => { if (rows.has(data.hostname)) throw Object.assign(new Error('dup'), { code: 'P2002' }); rows.set(data.hostname, data); return data },
      update: async ({ where, data }) => { const row = rows.get(where.hostname); Object.assign(row, data); return row },
    },
  }
  return { rows, svc: createWebsiteHostnameService({ prisma, registry: null, namespaceRoot: 'sites.example.org', adminHosts: ['erp.example.org'] }) }
}
const args = (extra) => ({ access: allowed, companyId: 'c1', siteId: 's1', ...extra })

test('autonomous namespace: reserves, serves immediately, rejects collisions, reserved names and releases', async () => {
  const { svc, rows } = fake()
  const made = await svc.reserve(args({ slug: 'mi-tienda' }))
  assert.equal(made.hostname, 'mi-tienda.sites.example.org')
  assert.deepEqual([made.state, made.ready, made.registryManaged], ['assigned', true, false])
  assert.equal((await svc.reserve(args({ slug: 'mi-tienda' }))).hostname, made.hostname, 'idempotent for the same site')
  assert.equal((await svc.availability(args({ slug: 'mi-tienda' }))).available, false)
  assert.equal((await svc.availability(args({ slug: 'otra-tienda' }))).available, true)
  await assert.rejects(svc.reserve(args({ slug: 'admin' })), (e) => e.code === 'name_reserved')
  await assert.rejects(svc.reserve(args({ slug: 'x' })), (e) => e.code === 'slug_invalid')
  rows.get(made.hostname).siteId = 's2'
  await assert.rejects(svc.reserve(args({ slug: 'mi-tienda' })), (e) => e.code === 'name_unavailable', 'another site cannot take it')
  rows.get(made.hostname).siteId = 's1'
  await svc.release(args({ hostname: made.hostname }))
  assert.deepEqual([rows.get(made.hostname).state, rows.get(made.hostname).ready], ['quarantined', false], 'a released name is retired, never deleted')
  assert.equal((await svc.reserve(args({ slug: 'mi-tienda' }))).ready, true, 'its own site can take it back')
})

test('without registry and without a usable namespace, reservations report namespace_unavailable', async () => {
  const svc = createWebsiteHostnameService({ prisma: fake().rows && { websiteSite: { findFirst: async () => ({ id: 's1' }) } }, registry: null, namespaceRoot: undefined })
  await assert.rejects(svc.reserve(args({ slug: 'mi-tienda' })), (e) => e.code === 'namespace_unavailable')
})

test('with a registry configured the registry still decides and rows stay registry-managed', async () => {
  const { rows, svc: _unused } = fake()
  const prisma = {
    websiteSite: { findFirst: async () => ({ id: 's1' }) },
    websiteDomain: {
      findUnique: async ({ where }) => rows.get(where.hostname) ?? null,
      create: async ({ data }) => { rows.set(data.hostname, data); return data },
    },
  }
  const registry = { ref: (kind, id) => `${kind}:${id}`, claim: async ({ slug }) => ({ hostname: `${slug}.sites.example.org`, state: 'pending', ready: false, version: 1, namespaceReady: true }) }
  const svc = createWebsiteHostnameService({ prisma, registry, registryConfigured: true, namespaceRoot: 'sites.example.org' })
  const made = await svc.reserve(args({ slug: 'mi-tienda' }))
  assert.deepEqual([made.registryManaged, made.state, made.ready], [true, 'pending', false])
})
