import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebsiteHostnameService, RELEASE_WINDOW_MS } from '../website-hostname-service.js'
import { createWebsiteAccess } from '../website-authorization-service.js'

const allowed = createWebsiteAccess({ companyId: 'c1', actorId: 'u', can: () => true })
function fake() {
  const rows = new Map()
  const prisma = {
    websiteSite: { findFirst: async ({ where }) => ((where.id === 's1' && where.companyId === 'c1') || (where.id === 's2' && where.companyId === 'c2') ? { id: where.id } : null) },
    websiteDomain: {
      findUnique: async ({ where }) => rows.get(where.hostname) ?? null,
      findFirst: async ({ where }) => [...rows.values()].find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
      updateMany: async ({ where, data }) => { let count = 0; for (const r of rows.values()) if (Object.entries(where).every(([k, v]) => r[k] === v)) { Object.assign(r, data); count += 1 } return { count } },
      create: async ({ data }) => { if (rows.has(data.hostname)) throw Object.assign(new Error('dup'), { code: 'P2002' }); rows.set(data.hostname, data); return data },
      update: async ({ where, data }) => { const row = rows.get(where.hostname); Object.assign(row, data); return row },
    },
    $transaction: async (ops) => Promise.all(ops),
  }
  return { rows, prisma, svc: createWebsiteHostnameService({ prisma, registry: null, namespaceRoot: 'sites.example.org', adminHosts: ['erp.example.org'] }) }
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

test('primary address: only an active one can be primary, one per site, and the gateway redirects the others to it', async () => {
  const { svc, rows, prisma } = fake()
  const { createWebsiteGatewayService } = await import('../website-gateway-service.js')
  const gateway = createWebsiteGatewayService({ prisma, namespaceRoot: 'sites.example.org' })
  const a = await svc.reserve(args({ slug: 'principal' }))
  const b = await svc.reserve(args({ slug: 'alias' }))
  const site = { id: 's1', companyId: 'c1' }
  assert.equal(await gateway.primaryRedirect({ site, hostname: b.hostname }), null, 'no primary, no redirect')
  await svc.setPrimary(args({ hostname: a.hostname }))
  assert.equal(await gateway.primaryRedirect({ site, hostname: b.hostname }), a.hostname)
  assert.equal(await gateway.primaryRedirect({ site, hostname: a.hostname }), null, 'the primary itself serves')
  await svc.setPrimary(args({ hostname: b.hostname }))
  assert.deepEqual([rows.get(a.hostname).isPrimary, rows.get(b.hostname).isPrimary], [false, true], 'one primary per site')
  await svc.release(args({ hostname: b.hostname }))
  assert.equal(await gateway.primaryRedirect({ site, hostname: a.hostname }), null, 'a primary that cannot serve never receives redirects')
  await assert.rejects(svc.setPrimary(args({ hostname: b.hostname })), (e) => e.code === 'domain_not_ready')
  await svc.setPrimary(args({ hostname: null }))
  assert.equal(rows.get(b.hostname).isPrimary, false, 'clearing removes the primary')
})

test('release window: a released name stays with its site for 15 days, then any site can claim it', async () => {
  const { svc, rows } = fake()
  const other = (extra) => ({ access: createWebsiteAccess({ companyId: 'c2', actorId: 'u', can: () => true }), companyId: 'c2', siteId: 's2', ...extra })
  const made = await svc.reserve(args({ slug: 'casa' }))
  rows.get(made.hostname).kind = 'platform'
  const released = await svc.release(args({ hostname: made.hostname }))
  assert.ok(released.releasedAt instanceof Date)
  assert.equal(released.freeAt.getTime() - released.releasedAt.getTime(), RELEASE_WINDOW_MS)
  assert.equal((await svc.availability(other({ slug: 'casa' }))).available, false, 'inside the window')
  await assert.rejects(svc.reserve(other({ slug: 'casa' })), (e) => e.code === 'name_unavailable')
  rows.get(made.hostname).releasedAt = new Date(Date.now() - RELEASE_WINDOW_MS - 1000)
  assert.equal((await svc.availability(other({ slug: 'casa' }))).available, true, 'after the window')
  const claimed = await svc.reserve(other({ slug: 'casa' }))
  assert.deepEqual([claimed.state, claimed.ready, claimed.releasedAt], ['assigned', true, null])
  assert.deepEqual([rows.get(made.hostname).companyId, rows.get(made.hostname).siteId], ['c2', 's2'])
  await assert.rejects(svc.reserve(args({ slug: 'casa' })), (e) => e.code === 'name_unavailable', 'the old site lost it')
  const own = await svc.reserve(other({ slug: 'propia' }))
  await svc.release(other({ hostname: own.hostname }))
  assert.equal((await svc.reserve(other({ slug: 'propia' }))).releasedAt, null, 'its own site takes it back and the window resets')
})
