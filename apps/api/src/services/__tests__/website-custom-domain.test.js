import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebsiteCustomDomainService, normalizeCustomHostname } from '../website-custom-domain-service.js'
import { createWebsiteGatewayService } from '../website-gateway-service.js'
import { createWebsiteAccess } from '../website-authorization-service.js'

const allowed = createWebsiteAccess({ companyId: 'c1', actorId: 'u', can: () => true })
const denied = createWebsiteAccess({ companyId: 'c1', actorId: 'u', can: () => false })
const otherCompany = createWebsiteAccess({ companyId: 'c2', actorId: 'u2', can: () => true })
const args = (extra) => ({ access: allowed, companyId: 'c1', siteId: 's1', ...extra })

function fake(options = {}) {
  const rows = new Map()
  let clock = new Date('2026-11-15T12:00:00Z')
  const prisma = {
    websiteSite: { findFirst: async ({ where }) => ((['s1', 's2'].includes(where.id) && where.companyId === 'c1') || (where.id === 's9' && where.companyId === 'c2') ? { id: where.id } : null) },
    websiteDomain: {
      findUnique: async ({ where }) => rows.get(where.hostname) ?? null,
      findFirst: async ({ where }) => [...rows.values()].find((r) => r.hostname === where.hostname && r.companyId === where.companyId && r.siteId === where.siteId && r.kind === where.kind) ?? null,
      findMany: async ({ where }) => [...rows.values()].filter((r) => r.companyId === where.companyId && r.siteId === where.siteId && r.kind === where.kind),
      count: async ({ where }) => [...rows.values()].filter((r) => r.companyId === where.companyId && r.kind === where.kind && r.state !== 'quarantined').length,
      create: async ({ data }) => {
        if (rows.has(data.hostname)) throw Object.assign(new Error('dup'), { code: 'P2002' })
        const row = { createdAt: clock, ...data }
        rows.set(data.hostname, row)
        return row
      },
      update: async ({ where, data }) => Object.assign(rows.get(where.hostname), data),
      updateMany: async ({ where, data }) => {
        const row = rows.get(where.hostname)
        if (!row || row.state !== where.state) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
    },
  }
  const calls = { verified: [], txt: [], https: [] }
  const state = { txt: [], https: 'ok' }
  const svc = createWebsiteCustomDomainService({
    prisma, namespaceRoot: 'sites.example.org', adminHosts: ['erp.example.org'],
    target: 'sites.example.net', limit: options.limit ?? 25, now: () => clock,
    resolveTxt: async (name) => { calls.txt.push(name); return state.txt },
    resolveAddresses: async () => ({ addresses: ['203.0.113.7'], cnames: [] }),
    probeHttps: async (host) => { calls.https.push(host); return state.https },
    onVerified: async (info) => { calls.verified.push(info.hostname) },
    ...options.service,
  })
  return { rows, svc, calls, state, advance: (ms) => { clock = new Date(clock.getTime() + ms) } }
}

test('hostnames are normalized and unsafe ones refused', () => {
  assert.equal(normalizeCustomHostname('https://WWW.MiTienda.mx/ruta?x=1'), 'www.mitienda.mx')
  assert.equal(normalizeCustomHostname('tienda.mx.'), 'tienda.mx')
  for (const bad of ['', 'localhost', '192.168.0.1', 'a b.com', 'http://[::1]/', `${'x'.repeat(300)}.com`, 'bad_host.com']) {
    assert.throws(() => normalizeCustomHostname(bad), (e) => e.code === 'invalid_hostname', bad)
  }
})

test('add creates a pending row with DNS instructions and does not serve yet', async () => {
  const { svc, rows } = fake()
  const made = await svc.add(args({ hostname: 'www.mitienda.mx' }))
  assert.deepEqual([made.state, made.ready, made.verified, made.kind], ['pending', false, false, 'custom'])
  const txt = made.dnsRecords.find((r) => r.type === 'TXT')
  assert.equal(txt.host, '_runly-verify.www', 'TXT host is relative to the zone')
  assert.equal(txt.name, '_runly-verify.www.mitienda.mx')
  assert.ok(txt.value.length >= 32)
  assert.deepEqual(made.dnsRecords.find((r) => r.type === 'CNAME'), { type: 'CNAME', name: 'www.mitienda.mx', value: 'sites.example.net', host: 'www' })
  assert.equal(rows.get('www.mitienda.mx').registryManaged, false)
  assert.equal((await svc.add(args({ hostname: 'WWW.mitienda.mx' }))).dnsRecords.find((r) => r.type === 'TXT').value, txt.value, 'idempotent for the same site')
  const apex = await svc.add(args({ hostname: 'mitienda.mx' }))
  assert.equal(apex.dnsRecords.find((r) => r.name === 'mitienda.mx').type, 'ALIAS', 'a bare domain cannot use CNAME')
})

test('an IP target produces an A record', async () => {
  const { svc } = fake({ service: { target: '203.0.113.7' } })
  const made = await svc.add(args({ hostname: 'tienda.mx' }))
  assert.deepEqual(made.dnsRecords.find((r) => r.type === 'A'), { type: 'A', name: 'tienda.mx', value: '203.0.113.7', host: '@' })
})

test('platform, admin, reserved and unavailable cases are refused', async () => {
  const { svc } = fake()
  await assert.rejects(svc.add(args({ hostname: 'mi.sites.example.org' })), (e) => e.code === 'hostname_reserved')
  await assert.rejects(svc.add(args({ hostname: 'erp.example.org' })), (e) => e.code === 'hostname_reserved')
  await assert.rejects(svc.add(args({ hostname: 'tienda.example.org' })), (e) => e.code === 'hostname_reserved', 'same registrable domain as the ERP')
  await assert.rejects(svc.add(args({ hostname: 'api.mitienda.mx' })), (e) => e.code === 'hostname_reserved')
  const off = fake({ service: { target: null } })
  await assert.rejects(off.svc.add(args({ hostname: 'www.mitienda.mx' })), (e) => e.code === 'custom_domains_unavailable')
  assert.equal((await off.svc.list(args({}))).available, false)
})

test('permissions are enforced and tenants are isolated', async () => {
  const { svc } = fake()
  await assert.rejects(svc.add({ ...args({ hostname: 'www.mitienda.mx' }), access: denied }), (e) => e.code === 'permission_denied')
  await svc.add(args({ hostname: 'www.mitienda.mx' }))
  await assert.rejects(svc.status({ access: otherCompany, companyId: 'c2', siteId: 's9', hostname: 'www.mitienda.mx' }), (e) => e.code === 'resource_not_found', 'another company cannot read it')
})

test('claims: verified and fresh pending names are protected; stale pending and released ones can be claimed', async () => {
  const { svc, rows, state, advance } = fake()
  const rival = (hostname) => ({ access: otherCompany, companyId: 'c2', siteId: 's9', hostname })
  const made = await svc.add(args({ hostname: 'www.mitienda.mx' }))
  await assert.rejects(svc.add(args({ hostname: 'www.mitienda.mx', siteId: 's2' })), (e) => e.code === 'hostname_taken', 'same company, other site')
  await assert.rejects(svc.add(rival('www.mitienda.mx')), (e) => e.code === 'claim_in_progress')
  advance(2 * 60 * 60 * 1000)
  const taken = await svc.add(rival('www.mitienda.mx'))
  assert.notEqual(taken.dnsRecords.find((r) => r.type === 'TXT').value, made.dnsRecords.find((r) => r.type === 'TXT').value, 'new token for the new claimant')
  assert.equal(rows.get('www.mitienda.mx').companyId, 'c2')
  state.txt = [[rows.get('www.mitienda.mx').verificationToken]]
  await svc.verify(rival('www.mitienda.mx'))
  await assert.rejects(svc.add(args({ hostname: 'www.mitienda.mx' })), (e) => e.code === 'hostname_taken')
  await svc.release(rival('www.mitienda.mx'))
  assert.equal((await svc.add(args({ hostname: 'www.mitienda.mx' }))).state, 'pending', 'a released name can be claimed by anyone who proves DNS')
})

test('verify: a wrong or missing TXT keeps it pending; the right one serves it, clears the token and notifies', async () => {
  const { svc, rows, state, calls, advance } = fake()
  await svc.add(args({ hostname: 'www.mitienda.mx' }))
  const token = rows.get('www.mitienda.mx').verificationToken
  state.txt = [['other-value']]
  const miss = await svc.verify(args({ hostname: 'www.mitienda.mx' }))
  assert.deepEqual([miss.state, miss.ready, miss.verified], ['pending', false, false])
  assert.match(miss.lastError, /registro TXT/)
  await assert.rejects(svc.verify(args({ hostname: 'www.mitienda.mx' })), (e) => e.status === 429, 'throttled')
  advance(11_000)
  state.txt = [[token.slice(0, 10), token.slice(10)]]
  const ok = await svc.verify(args({ hostname: 'www.mitienda.mx' }))
  assert.deepEqual([ok.state, ok.ready, ok.verified, ok.lastError], ['assigned', true, true, null])
  assert.equal(rows.get('www.mitienda.mx').verificationToken, null)
  assert.equal(ok.dnsRecords.some((r) => r.type === 'TXT'), false, 'the challenge disappears once verified')
  assert.equal(ok.pointsHere, true)
  assert.deepEqual(calls.verified, ['www.mitienda.mx'])
  assert.equal((await svc.verify(args({ hostname: 'www.mitienda.mx' }))).state, 'assigned', 'idempotent')
  assert.equal(calls.txt.length, 2, 'no DNS lookup once verified')
})

test('a DNS failure is reported in Spanish, not as a crash', async () => {
  const { svc } = fake({ service: { resolveTxt: async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) } } })
  await svc.add(args({ hostname: 'www.mitienda.mx' }))
  const result = await svc.verify(args({ hostname: 'www.mitienda.mx' }))
  assert.match(result.lastError, /rechazada/)
})

test('HTTPS status needs verification, maps probe results and is throttled', async () => {
  const { svc, rows, state, advance } = fake()
  await svc.add(args({ hostname: 'www.mitienda.mx' }))
  await assert.rejects(svc.checkHttps(args({ hostname: 'www.mitienda.mx' })), (e) => e.code === 'not_verified')
  state.txt = [[rows.get('www.mitienda.mx').verificationToken]]
  await svc.verify(args({ hostname: 'www.mitienda.mx' }))
  for (const expected of ['ok', 'invalid', 'unreachable']) {
    state.https = expected
    assert.equal((await svc.checkHttps(args({ hostname: 'www.mitienda.mx' }))).httpsState, expected)
    advance(61_000)
  }
  await svc.checkHttps(args({ hostname: 'www.mitienda.mx' }))
  await assert.rejects(svc.checkHttps(args({ hostname: 'www.mitienda.mx' })), (e) => e.status === 429)
})

test('per-company cap and release', async () => {
  const { svc, rows } = fake({ limit: 2 })
  await svc.add(args({ hostname: 'a.mitienda.mx' }))
  await svc.add(args({ hostname: 'b.mitienda.mx' }))
  await assert.rejects(svc.add(args({ hostname: 'c.mitienda.mx' })), (e) => e.code === 'limit_reached')
  const released = await svc.release(args({ hostname: 'a.mitienda.mx' }))
  assert.deepEqual([released.state, released.ready], ['released', false])
  assert.equal(rows.get('a.mitienda.mx').verificationToken, null)
  await svc.add(args({ hostname: 'c.mitienda.mx' }))
})

test('the gateway serves a verified custom host and refuses pending or released ones', async () => {
  const rows = new Map()
  const prisma = {
    websiteDomain: { findUnique: async ({ where }) => rows.get(where.hostname) ?? null },
    websiteSite: { findFirst: async () => ({ id: 's1', companyId: 'c1', enabled: true, status: 'published', sourceType: 'builder', releaseManaged: false }) },
    company: { findFirst: async () => ({ slug: 'acme' }) },
  }
  const gateway = createWebsiteGatewayService({ prisma, namespaceRoot: 'sites.example.org', adminHosts: ['erp.example.org'] })
  const ctx = (host) => ({ req: { header: () => host, url: `https://${host}/` } })
  const row = (extra) => ({ hostname: 'www.mitienda.mx', companyId: 'c1', siteId: 's1', kind: 'custom', registryManaged: false, state: 'pending', ready: false, ...extra })
  rows.set('www.mitienda.mx', row({}))
  await assert.rejects(gateway.resolve(ctx('www.mitienda.mx')), (e) => e.status === 404, 'pending is not served')
  rows.set('www.mitienda.mx', row({ state: 'assigned', ready: true, verifiedAt: new Date() }))
  const served = await gateway.resolve(ctx('www.mitienda.mx'))
  assert.equal(served.site.id, 's1')
  assert.equal(served.hostname, 'www.mitienda.mx')
  rows.set('www.mitienda.mx', row({ state: 'quarantined', ready: false }))
  await assert.rejects(gateway.resolve(ctx('www.mitienda.mx')), (e) => e.status === 404, 'released is not served')
  rows.set('erp.example.org', row({ hostname: 'erp.example.org', state: 'assigned', ready: true }))
  await assert.rejects(gateway.resolve(ctx('erp.example.org')), (e) => e.status === 404, 'the admin origin is never a website')
})
