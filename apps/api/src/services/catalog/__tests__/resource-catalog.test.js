import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { CatalogDownloadError } from '../catalog-download.js'
import { canonicalBytes, keyIdOf, RELEASE_DOMAIN as V2_RELEASE_DOMAIN, SNAPSHOT_DOMAIN as V2_SNAPSHOT_DOMAIN } from '../catalog-v2-contract.js'
import { OFFICIAL_SNAPSHOT_DOMAIN } from '../catalog-official-contract.js'
import { createTrustStore, CatalogTrustError } from '../catalog-trust-store.js'
import { RESOURCE_CATALOG_PUBLIC_KEYS } from '../catalog-resource-public-key.js'
import { RESOURCE_RELEASE_DOMAIN, RESOURCE_SNAPSHOT_DOMAIN, SIGNING_DOMAINS, TYPE_MAX_BYTES, domainProblem, resourceReleaseBytes, resourceReleaseDigest, resourceReleaseStatement, resourceSnapshotBytes, resourceSnapshotDigest, validateResourceEnvelope } from '../catalog-resource-contract.js'
import { createResourceCatalogService, RESOURCE_CONFIG_KEYS } from '../resource-catalog-service.js'

// Real vectors published by Developer Hub (copied verbatim; see fixtures/README in this folder's commit).
// The key is a PUBLIC TEST key whose seed is documented in the vectors: it is used here to re-sign mutated
// snapshots so each negative case isolates ONE rule. It is never a production key.
const vectors = JSON.parse(readFileSync(new URL('./fixtures/resource-feed-v1.vectors.json', import.meta.url), 'utf8'))
const seed = createHash('sha256').update('runly-resource-feed-v1 TEST VECTORS ONLY - not a production key').digest()
const testKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' })
const PUBLIC = vectors.testKey.publicKey, KEY_ID = vectors.testKey.keyId
const clone = (value) => JSON.parse(JSON.stringify(value))
const b64 = (bytes) => bytes.toString('base64')
const snapshot1 = () => clone(vectors.snapshot1.envelope), snapshot2 = () => clone(vectors.snapshot2.envelope)
const T0 = Date.parse('2026-11-08T13:00:00.000Z'), HOUR = 3600000, DAY = 86400000
const FEED = 'https://catalog.example/resources/index.json'
const studioSha = vectors.packages.studio.sha256, autoSha = vectors.packages.automation.sha256
const studioBytes = Buffer.from(vectors.packages.studio.utf8), autoBytes = Buffer.from(vectors.packages.automation.utf8)

// Re-signs a mutated snapshot (and optionally its releases) with the test key.
function resign(envelope, { releases = false } = {}) {
  if (releases) for (const entry of envelope.signed.entries) entry.signature = b64(sign(null, resourceReleaseBytes(entry), testKey))
  envelope.signatures = [{ keyId: KEY_ID, signature: b64(sign(null, resourceSnapshotBytes(envelope.signed), testKey)) }]
  return envelope
}
const chained = (prev, patch) => { const next = snapshot2(); next.signed.previous = { sequence: prev.signed.sequence, sha256: resourceSnapshotDigest(prev.signed) }; patch?.(next.signed); return resign(next) }

function fixture({ trust = { resource: [PUBLIC] }, clock = T0, feed = snapshot1(), files = {} } = {}) {
  const configs = new Map([[RESOURCE_CONFIG_KEYS.url, FEED]]), cache = new Map(), requests = []
  const prisma = {
    instanceConfig: { findUnique: async ({ where }) => (configs.has(where.key) ? { value: configs.get(where.key) } : null), upsert: async ({ where, update }) => { configs.set(where.key, update.value) } },
    moduleCatalogCache: { findUnique: async ({ where }) => cache.get(where.url) ?? null, upsert: async ({ where, create, update }) => { cache.set(where.url, { ...(cache.get(where.url) ?? create), ...update }) } },
  }
  const f = { prisma, configs, cache, requests, feed, offline: false, time: clock, files: { [studioSha]: studioBytes, [autoSha]: autoBytes, ...files }, failure: null }
  const build = () => createResourceCatalogService({
    prisma, trust, now: () => f.time, runlyVersion: '1.2.0',
    readBytes: async (url, options) => {
      requests.push({ url, ...options })
      if (f.failure) throw f.failure
      if (f.offline) throw new CatalogDownloadError('CATALOG_UNREACHABLE')
      if (url === FEED) return { status: 200, buffer: Buffer.from(JSON.stringify(f.feed)) }
      const sha = url.split('/').pop()
      if (f.files[sha] === undefined) throw new CatalogDownloadError('CATALOG_UNREACHABLE')
      return { status: 200, buffer: Buffer.from(f.files[sha]) }
    },
  })
  f.service = build()
  f.restart = () => { f.service = build(); return f.service }
  return f
}
const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code, `expected ${code}`)

test('real vectors: structure, digests, domains and signatures verify with the pinned test key', async () => {
  assert.equal(resourceSnapshotDigest(vectors.snapshot1.envelope.signed), vectors.snapshot1.digest)
  assert.equal(resourceSnapshotDigest(vectors.snapshot2.envelope.signed), vectors.snapshot2.digest)
  const [studio, auto] = vectors.snapshot1.envelope.signed.entries
  assert.equal(resourceReleaseDigest(studio), vectors.releaseStatementSha256.studio)
  assert.equal(resourceReleaseDigest(auto), vectors.releaseStatementSha256.automation)
  assert.equal(vectors.domains.release, RESOURCE_RELEASE_DOMAIN)
  assert.equal(vectors.domains.snapshot, RESOURCE_SNAPSHOT_DOMAIN)
  assert.equal(keyIdOf(PUBLIC), KEY_ID)
  for (const envelope of [snapshot1(), snapshot2()]) validateResourceEnvelope(envelope)
  assert.equal(vectors.negative.length, 14)
  const f = fixture()
  const result = await f.service.refresh()
  assert.deepEqual([result.status, result.alert, result.sequence, result.freshness, result.installable], ['ok', null, 1, 'fresh', true])
  const list = await f.service.list()
  assert.deepEqual(list.map((r) => [r.resourceKey, r.trust, r.eligible, r.availability]), [['automation.aviso-lead', 'resource', true, 'available'], ['studio.menu-restaurante', 'resource', true, 'available']])
})

// The 14 published negative cases, each isolated by re-signing the mutated snapshot where needed.
const negative = {
  N1: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[0].extra = 1; return resign(e) } },
  N2: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[0].resourceKey = 'custom.menu'; return resign(e, { releases: true }) } },
  N3: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[0].type = 'automation'; return resign(e, { releases: true }) } },
  N4: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[0].packageUrl = `packages/${'a'.repeat(64)}`; return resign(e, { releases: true }) } },
  N5: { code: 'RESOURCE_SIGNATURE_INVALID', make: () => { const e = snapshot1(); e.signed.publishers.push({ ...e.signed.publishers[0], handle: 'other-publisher' }); e.signed.entries[0].publisher = 'other-publisher'; return resign(e) } },
  N6: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.trust.keys[0].role = 'community'; return resign(e) } },
  N7: { code: 'RESOURCE_SIGNATURE_INVALID', make: () => { const e = snapshot1(); const entry = e.signed.entries[0]; entry.signature = b64(sign(null, Buffer.concat([Buffer.from(V2_RELEASE_DOMAIN), canonicalBytes(resourceReleaseStatement(entry))]), testKey)); return resign(e) } },
  N9: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.validUntil = e.signed.generatedAt; return resign(e) } },
  N10: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[0].size = 26_214_401; return resign(e, { releases: true }) } },
  N11: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[1].size = 204_801; return resign(e, { releases: true }) } },
  N12: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[1].sha256 = e.signed.entries[0].sha256; e.signed.entries[1].packageUrl = `packages/${e.signed.entries[0].sha256}`; return resign(e, { releases: true }) } },
  N13: { code: 'RESOURCE_FEED_INVALID', make: () => { const e = snapshot1(); e.signed.entries[0].access = 'installation'; e.signed.entries[0].packageUrl = null; return resign(e, { releases: true }) } },
}
for (const [id, { code, make }] of Object.entries(negative)) {
  test(`negative vector ${id}: ${vectors.negative.find((n) => n.id === id).mutate.slice(0, 60)} => ${code}`, async () => {
    assert.ok(vectors.negative.some((n) => n.id === id))
    const f = fixture({ feed: make() })
    await rejects(f.service.refresh(), code)
    assert.equal(f.cache.size, 0, 'nothing rejected is ever cached')
    assert.equal(f.configs.has('catalog.sequence.highWater'), false, 'nor does it advance the high-water mark')
  })
}

test('negative vector N8: a broken chain is rejected and the last good snapshot stays', async () => {
  const f = fixture()
  await f.service.refresh()
  f.feed = chained(snapshot1(), (signed) => { signed.previous.sha256 = 'f'.repeat(64) })
  f.time += HOUR
  const result = await f.service.refresh()
  assert.deepEqual([result.status, result.alert, result.sequence], ['cached', 'RESOURCE_FEED_CHAIN_INVALID', 1])
  assert.equal(JSON.parse(f.configs.get(RESOURCE_CONFIG_KEYS.state)).sequence, 1)
  f.feed = chained(snapshot1())
  assert.equal((await f.service.refresh()).sequence, 2, 'the genuine successor is accepted')
})

test('negative vector N14: digests carry the release domain; a statement signed without it never verifies', async () => {
  const [studio] = vectors.snapshot1.envelope.signed.entries
  const plain = createHash('sha256').update(canonicalBytes(resourceReleaseStatement(studio))).digest('hex')
  assert.equal(vectors.negative.find((n) => n.id === 'N14').observedWithoutDomain.studio, plain)
  assert.notEqual(plain, vectors.releaseStatementSha256.studio)
  const e = snapshot1()
  e.signed.entries[0].signature = b64(sign(null, canonicalBytes(resourceReleaseStatement(e.signed.entries[0])), testKey))
  await rejects(fixture({ feed: resign(e) }).service.refresh(), 'RESOURCE_SIGNATURE_INVALID')
})

test('trust: only PINNED resource keys count; a key present in the feed is never accepted on its own', async () => {
  assert.equal(RESOURCE_CATALOG_PUBLIC_KEYS.length, 1)
  assert.equal(keyIdOf(RESOURCE_CATALOG_PUBLIC_KEYS[0].publicKey), "8d0c6dd35b7589a13198f0c92810b0a74915a1e5a5741e157d6a47eaef65969d")
  await rejects(fixture({ trust: {} }).service.refresh(), 'RESOURCE_SIGNATURE_INVALID')
  // The same key pinned in a MODULE category (or managed) does not make it a resource key.
  for (const category of ['official', 'community', 'managed']) {
    const trust = category === 'managed' ? { managed: [PUBLIC] } : { [category]: [PUBLIC] }
    await rejects(fixture({ trust }).service.refresh(), 'RESOURCE_SIGNATURE_INVALID')
  }
  assert.throws(() => createTrustStore({ official: [PUBLIC], resource: [PUBLIC] }), (e) => e instanceof CatalogTrustError && e.code === 'RESOURCE_KEY_OVERLAPS_MODULE_KEY')
  assert.throws(() => createTrustStore({ community: [PUBLIC], resource: [PUBLIC] }), (e) => e.code === 'RESOURCE_KEY_OVERLAPS_MODULE_KEY')
  const store = createTrustStore({ resource: [PUBLIC], managed: [PUBLIC] })
  assert.deepEqual(store.keys.managed, [], 'a managed copy of a resource key stays in its pinned category only')
  assert.equal(store.categoryOf(KEY_ID), 'resource')
  // A pinned resource key signs nothing in the module catalogs.
  assert.throws(() => store.verifySnapshot({ signed: { generatedAt: '2026-11-08T00:00:00.000Z', trust: { keys: [] } }, signatures: [{ keyId: KEY_ID, signature: 'x' }] }), (e) => e.code === 'CATALOG_V2_SIGNATURE_UNTRUSTED')
  // An unpinned signer stays rejected even when the feed announces its key as active.
  const other = generateKeyPairSync('ed25519'), otherPublic = other.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  const e = snapshot1()
  e.signed.trust.keys.push({ ...e.signed.trust.keys[0], keyId: keyIdOf(otherPublic), publicKey: otherPublic })
  e.signatures = [{ keyId: keyIdOf(otherPublic), signature: b64(sign(null, resourceSnapshotBytes(e.signed), other.privateKey)) }]
  await rejects(fixture({ feed: e }).service.refresh(), 'RESOURCE_SIGNATURE_INVALID')
})

test('trust lifecycle: a feed or local revocation of the signing key makes everything unverifiable (fail closed)', async () => {
  const revoked = snapshot1()
  revoked.signed.trust.keys[0].state = 'revoked'
  revoked.signed.trust.keys[0].reason = 'compromised'
  await rejects(fixture({ feed: resign(revoked) }).service.refresh(), 'RESOURCE_SIGNATURE_INVALID')
  const f = fixture()
  await f.service.refresh()
  f.configs.set(RESOURCE_CONFIG_KEYS.revokedKeyIds, JSON.stringify([KEY_ID]))
  await rejects(f.service.list(), 'RESOURCE_FEED_UNAVAILABLE')
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_FEED_UNAVAILABLE')
})

test('signing domains: five distinct, prefix-free; no statement of another domain verifies as a resource statement', async () => {
  assert.equal(SIGNING_DOMAINS.length, 5)
  assert.equal(domainProblem(), null)
  assert.equal(domainProblem([...SIGNING_DOMAINS, RESOURCE_RELEASE_DOMAIN]), 'duplicate')
  assert.equal(domainProblem([...SIGNING_DOMAINS, 'runly.catalog.resources.v1.release\nextra']), 'prefix')
  assert.equal(domainProblem(SIGNING_DOMAINS, `${OFFICIAL_SNAPSHOT_DOMAIN}x`), 'v1_overlap')
  for (const domain of [OFFICIAL_SNAPSHOT_DOMAIN, V2_SNAPSHOT_DOMAIN, V2_RELEASE_DOMAIN, RESOURCE_RELEASE_DOMAIN]) {
    const e = snapshot1()
    e.signatures = [{ keyId: KEY_ID, signature: b64(sign(null, Buffer.from(`${domain}${e.signed.sequence}:${resourceSnapshotDigest(e.signed)}`), testKey)) }]
    await rejects(fixture({ feed: e }).service.refresh(), 'RESOURCE_SIGNATURE_INVALID')
  }
})

test('anti-rollback by sequence and domain survives a restart; equivocation is rejected', async () => {
  const f = fixture({ feed: snapshot2() })
  const first = await f.service.refresh()
  assert.deepEqual([first.status, first.sequence], ['ok', 2])
  const domain = JSON.parse(f.configs.get('catalog.sequence.highWater'))['resource:runly-resources-v1']
  assert.equal(domain.sequence, 2)
  assert.equal(Object.keys(JSON.parse(f.configs.get('catalog.sequence.highWater'))).every((k) => k.startsWith('resource:')), true, 'its own domain, never a module one')
  f.feed = snapshot1(); f.time += HOUR
  const old = await f.restart().refresh()
  assert.deepEqual([old.status, old.alert, old.sequence], ['cached', 'RESOURCE_FEED_ROLLBACK', 2], 'a new process still remembers sequence 2')
  const same = snapshot2(); same.signed.generatedAt = '2026-11-09T09:00:00.001Z'
  f.feed = resign(same)
  assert.equal((await f.service.refresh()).alert, 'RESOURCE_FEED_CHAIN_INVALID', 'same sequence, different content')
  const fresh = fixture({ feed: snapshot2() })
  fresh.configs.set('catalog.sequence.highWater', JSON.stringify({ 'resource:runly-resources-v1': { sequence: 5, sha256: 'a'.repeat(64), generatedAt: '2026-11-08T00:00:00.000Z' } }))
  await rejects(fresh.service.refresh(), 'RESOURCE_FEED_ROLLBACK')
  // Another trust domain's mark never blocks resources.
  const other = fixture({ feed: snapshot2() })
  other.configs.set('catalog.sequence.highWater', JSON.stringify({ 'community:runly-v2': { sequence: 99, sha256: 'a'.repeat(64), generatedAt: '2026-11-08T00:00:00.000Z' } }))
  assert.equal((await other.service.refresh()).sequence, 2)
})

test('revocations by release, publisher and key close the entry; nothing is deleted from the view', async () => {
  const f = fixture()
  await f.service.refresh()
  const revokedRelease = chained(snapshot1())
  f.feed = revokedRelease; f.time += HOUR
  await f.service.refresh()
  assert.deepEqual((await f.service.list()).map((r) => r.resourceKey), ['studio.menu-restaurante'])
  const all = await f.service.list({ includeUnavailable: true })
  const auto = all.find((r) => r.resourceKey === 'automation.aviso-lead')
  assert.deepEqual([auto.availability, auto.revocation.type, auto.eligible, auto.blockedBy], ['revoked', 'release', false, ['RESOURCE_REVOKED']])
  await rejects(f.service.downloadPackage('automation.aviso-lead', '1.2.0'), 'RESOURCE_REVOKED')
  // Publisher and key revocations (re-signed snapshots chained on the previous one).
  const publisher = chained(snapshot1(), (s) => { s.revocations = [{ type: 'publisher', target: { publisher: 'acme-labs' }, reason: 'abuso', revokedAt: '2026-11-09T08:00:00.000Z', sequence: 2, replacement: null }] })
  const g = fixture(); await g.service.refresh(); g.feed = publisher; g.time += HOUR; await g.service.refresh()
  assert.ok((await g.service.list({ includeUnavailable: true })).every((r) => r.revocation?.type === 'publisher' && !r.eligible))
  const byKey = chained(snapshot1(), (s) => { s.revocations = [{ type: 'key', target: { keyId: KEY_ID }, reason: 'compromiso', revokedAt: '2026-11-09T08:00:00.000Z', sequence: 2, replacement: null }] })
  const h = fixture(); await h.service.refresh(); h.feed = byKey
  h.time += HOUR
  const afterKey = await h.service.refresh()
  assert.equal(afterKey.alert, 'RESOURCE_SIGNATURE_INVALID', 'a snapshot that revokes its own signing key can no longer be verified by it: the last good copy stays, now re-checked')
  const withdrawn = chained(snapshot1(), (s) => { s.entries[0].status = 'withdrawn'; for (const entry of s.entries) entry.signature = b64(sign(null, resourceReleaseBytes(entry), testKey)) })
  const w = fixture(); await w.service.refresh(); w.feed = withdrawn; w.time += HOUR; await w.service.refresh()
  assert.equal((await w.service.get('studio.menu-restaurante')).availability, 'withdrawn')
})

test('expiry and freshness: 24 h fresh, 24-72 h only with explicit acknowledgement, never past 72 h or validUntil, view up to 30 days', async () => {
  const f = fixture()
  await f.service.refresh()
  const eligible = async (options) => (await f.service.get('studio.menu-restaurante', null, options)).eligible
  f.time = T0 + 23 * HOUR
  assert.equal(await eligible(), true)
  f.time = T0 + 25 * HOUR
  assert.equal(await eligible(), false)
  assert.deepEqual((await f.service.get('studio.menu-restaurante')).blockedBy, ['RESOURCE_ACKNOWLEDGEMENT_REQUIRED'])
  assert.equal(await eligible({ acknowledgeStale: 'yes' }), false, 'only an explicit true counts')
  assert.equal(await eligible({ acknowledgeStale: true }), true)
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_ACKNOWLEDGEMENT_REQUIRED')
  assert.equal((await f.service.downloadPackage('studio.menu-restaurante', null, { acknowledgeStale: true })).sha256, studioSha)
  f.time = T0 + 73 * HOUR
  assert.deepEqual((await f.service.get('studio.menu-restaurante', null, { acknowledgeStale: true })).blockedBy, ['RESOURCE_FEED_STALE'])
  assert.equal((await f.service.list()).length, 2, 'still viewable from the cache')
  // validUntil is a hard stop whatever the age: snapshot 1 expires 7 days after its generation.
  const refreshed = fixture({ clock: Date.parse('2026-11-15T12:00:00.000Z') })
  await refreshed.service.refresh()
  refreshed.time = Date.parse('2026-11-15T12:30:00.000Z')
  assert.deepEqual((await refreshed.service.get('studio.menu-restaurante')).blockedBy, ['RESOURCE_FEED_EXPIRED'])
  f.time = T0 + 31 * DAY
  await rejects(f.service.list(), 'RESOURCE_FEED_UNAVAILABLE')
  assert.equal((await f.service.status()).verified, false)
})

test('an authentic but expired snapshot is not accepted; the last good copy remains', async () => {
  await rejects(fixture({ clock: Date.parse('2026-11-16T00:00:00.000Z') }).service.refresh(), 'RESOURCE_FEED_EXPIRED')
  const f = fixture()
  await f.service.refresh()
  f.feed = snapshot2(); f.time = Date.parse('2026-11-16T12:00:00.000Z')
  const result = await f.service.refresh()
  assert.deepEqual([result.status, result.alert, result.sequence], ['cached', 'RESOURCE_FEED_EXPIRED', 1])
  assert.equal(JSON.parse(f.configs.get('catalog.sequence.highWater'))['resource:runly-resources-v1'].sequence, 1)
})

test('offline and transport failures keep the verified copy; security rejections are alerts', async () => {
  const f = fixture()
  await f.service.refresh()
  f.offline = true; f.time += HOUR
  assert.deepEqual([(await f.service.refresh()).status, (await f.service.refresh()).offline], ['cached', true])
  f.offline = false; f.failure = new CatalogDownloadError('CATALOG_PRIVATE_ADDRESS')
  assert.equal((await f.service.refresh()).alert, 'RESOURCE_FEED_TRANSPORT_REJECTED')
  f.failure = new CatalogDownloadError('CATALOG_RESPONSE_TOO_LARGE')
  assert.equal((await f.service.refresh()).alert, 'RESOURCE_FEED_TOO_LARGE')
  await rejects(fixture({ feed: snapshot1() }).restart().refresh().then(() => { const g = fixture(); g.offline = true; return g.service.refresh() }), 'RESOURCE_FEED_UNREACHABLE')
  const unsafe = fixture(); unsafe.configs.set(RESOURCE_CONFIG_KEYS.url, 'http://catalog.example/index.json')
  await rejects(unsafe.service.refresh(), 'RESOURCE_FEED_URL_REJECTED')
  const unconfigured = fixture(); unconfigured.configs.delete(RESOURCE_CONFIG_KEYS.url)
  assert.deepEqual(await unconfigured.service.refresh(), { status: 'not_configured', alert: null })
  assert.deepEqual(await unconfigured.service.status(), { configured: false })
  // The real transport refuses private addresses before connecting (no network is touched).
  const real = fixture(); real.configs.set(RESOURCE_CONFIG_KEYS.url, 'https://127.0.0.1/resources/index.json')
  const svc = createResourceCatalogService({ prisma: real.prisma, trust: { resource: [PUBLIC] }, now: () => T0 })
  await rejects(svc.refresh(), 'RESOURCE_FEED_TRANSPORT_REJECTED')
})

test('download: relative URL of the verified feed, per-type byte limit, exact length and SHA-256, fail closed', async () => {
  const f = fixture()
  await f.service.refresh()
  const got = await f.service.downloadPackage('studio.menu-restaurante', '1.0.0')
  assert.deepEqual([got.bytes.equals(studioBytes), got.sha256, got.size, got.resource.trust], [true, studioSha, studioBytes.length, 'resource'])
  const request = f.requests.at(-1)
  assert.equal(request.url, `https://catalog.example/resources/packages/${studioSha}`)
  assert.deepEqual([request.maxBytes, request.httpsOnly], [TYPE_MAX_BYTES.studio_template, true])
  await f.service.downloadPackage('automation.aviso-lead', null)
  assert.equal(f.requests.at(-1).maxBytes, 204_800, 'automations are capped at 200 KiB, not 25 MiB')
  // Any difference fails closed.
  f.files[studioSha] = Buffer.from('TEST-PACKAGE-BYTES studio_template v2')
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_PACKAGE_MISMATCH')
  f.files[studioSha] = Buffer.concat([studioBytes, Buffer.from('x')])
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_PACKAGE_MISMATCH')
  f.files[studioSha] = studioBytes.subarray(1)
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_PACKAGE_MISMATCH')
  f.files[studioSha] = studioBytes
  f.failure = new CatalogDownloadError('CATALOG_RESPONSE_TOO_LARGE')
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_PACKAGE_MISMATCH')
  f.failure = new CatalogDownloadError('CATALOG_PRIVATE_ADDRESS')
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_PACKAGE_UNAVAILABLE')
  f.failure = null
  await rejects(f.service.downloadPackage('studio.no-existe', null), 'RESOURCE_NOT_FOUND')
  // A tampered cache (absolute package URL) is never followed: the copy fails verification.
  const cached = f.cache.get(FEED)
  cached.payload.signed.entries[0].packageUrl = 'https://evil.example/x'
  await rejects(f.service.downloadPackage('studio.menu-restaurante', null), 'RESOURCE_FEED_UNAVAILABLE')
})

test('read API: filters, inspection and compatibility verdicts; nothing is installed or applied', async () => {
  const f = fixture()
  await f.service.refresh()
  assert.deepEqual((await f.service.list({ type: 'automation' })).map((r) => r.resourceKey), ['automation.aviso-lead'])
  assert.deepEqual((await f.service.list({ query: 'menú' })).map((r) => r.resourceKey), ['studio.menu-restaurante'])
  await rejects(f.service.list({ type: 'module' }), 'RESOURCE_TYPE_INVALID')
  const inspected = await f.service.inspect('studio.menu-restaurante')
  assert.deepEqual([inspected.verification.snapshotSignature, inspected.verification.releaseSignature, inspected.verification.formatName, inspected.verification.maxBytes], ['verified', 'verified', 'studio', 26_214_400])
  assert.equal(inspected.catalog.sequence, 1)
  const old = fixture(); old.time = T0
  const strict = createResourceCatalogService({ prisma: old.prisma, trust: { resource: [PUBLIC] }, now: () => T0, runlyVersion: '0.5.0', readBytes: async () => ({ buffer: Buffer.from(JSON.stringify(snapshot1())) }) })
  await strict.refresh()
  assert.deepEqual((await strict.get('studio.menu-restaurante')).blockedBy, ['RESOURCE_RUNLY_VERSION'])
  const status = await f.service.status()
  assert.deepEqual([status.configured, status.verified, status.sequence], [true, true, 1])
  assert.equal(Object.keys(f.service).sort().join(), 'downloadPackage,get,inspect,list,refresh,status', 'read, verify and download only: no install')
})
