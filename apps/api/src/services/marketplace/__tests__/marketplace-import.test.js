// Pure parts of ERP E3a; the real flow runs on Supabase in scripts/verify-marketplace-imports.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createMarketplaceImportGate } from '../marketplace-import-gate.js'
import { definitionDigest } from '../automation-import-service.js'
import { ResourceFeedError } from '../../catalog/catalog-resource-contract.js'

const RELEASE = '2914a359-0143-43e9-bc3c-c2edbb275229'
const resource = (patch = {}) => ({ resourceKey: 'automation.aviso-de-pago', type: 'automation', version: '1.0.0', releaseId: RELEASE, sha256: 'a'.repeat(64), size: 3, eligible: true, blockedBy: [], publisher: { handle: 'p', verified: false }, ...patch })
function fakeCatalog({ described = resource(), bytes = Buffer.from('abc') } = {}) {
  const calls = { refresh: 0, download: 0 }
  return {
    calls,
    status: async () => ({ configured: true, verified: true, fetchedAt: new Date(0).toISOString() }),
    refresh: async () => { calls.refresh++; return { status: 'ok', alert: null, offline: false } },
    inspect: async () => ({ resource: typeof described === 'function' ? described() : described, catalog: { sequence: 7 } }),
    downloadPackage: async () => { calls.download++; return { bytes, sha256: 'a'.repeat(64), size: bytes.length, resource: resource() } },
  }
}
const ref = { resourceKey: 'automation.aviso-de-pago', version: '1.0.0', releaseId: RELEASE }

test('download binds provenance to the exact verified release and never downloads a blocked one', async () => {
  const catalog = fakeCatalog()
  const gate = createMarketplaceImportGate({ catalog, now: () => 2 * 3_600_000 })
  const { source } = await gate.download(ref, 'automation', { companyId: 'c', actorId: 'u' })
  assert.deepEqual([source.releaseId, source.sha256, source.catalogSequence, source.importedBy, source.companyId], [RELEASE, 'a'.repeat(64), 7, 'u', 'c'])
  assert.equal(catalog.calls.refresh, 1, 'an old verified copy is refreshed first')
  for (const [described, code] of [
    [resource({ eligible: false, blockedBy: ['RESOURCE_REVOKED'] }), 'RESOURCE_REVOKED'],
    [resource({ releaseId: '11111111-1111-4111-8111-111111111111' }), 'MARKETPLACE_RELEASE_MISMATCH'],
    [resource({ type: 'studio_template' }), 'MARKETPLACE_TYPE_MISMATCH'],
  ]) {
    const blocked = fakeCatalog({ described })
    await assert.rejects(createMarketplaceImportGate({ catalog: blocked }).download(ref, 'automation', {}), (e) => e.code === code && e.status === 409)
    assert.equal(blocked.calls.download, 0)
  }
  const tampered = fakeCatalog({ bytes: Buffer.from('abcd') })
  await assert.rejects(createMarketplaceImportGate({ catalog: tampered }).download(ref, 'automation', {}), (e) => e.code === 'RESOURCE_PACKAGE_MISMATCH')
  const missing = { ...fakeCatalog(), inspect: async () => { throw Object.assign(new ResourceFeedError('RESOURCE_NOT_FOUND'), { status: 404 }) } }
  await assert.rejects(createMarketplaceImportGate({ catalog: missing }).resolve(ref, 'automation'), (e) => e.code === 'RESOURCE_NOT_FOUND' && e.status === 404)
  await assert.rejects(createMarketplaceImportGate({ catalog }).resolve({ ...ref, url: 'https://evil.example/x' }, 'automation'))
})

test('confirm-time recheck requires a feed verified now: unreachable, cached, offline or alerted feeds refuse with a retryable 503', async () => {
  const source = { ...ref, type: 'automation', sha256: 'a'.repeat(64) }
  for (const refresh of [
    async () => { throw new ResourceFeedError('RESOURCE_FEED_UNREACHABLE') },
    async () => ({ status: 'cached', alert: null, offline: true }),
    async () => ({ status: 'cached', alert: 'RESOURCE_FEED_ROLLBACK', offline: false }),
    async () => ({ status: 'not_configured', alert: null }),
  ]) {
    const catalog = { ...fakeCatalog(), refresh, inspect: async () => assert.fail('a stale copy must not be consulted') }
    await assert.rejects(createMarketplaceImportGate({ catalog }).recheck(source), (e) => e.code === 'RESOURCE_FEED_UNVERIFIED' && e.status === 503)
  }
})

test('recheck refuses a release whose content changed after preparation', async () => {
  const gate = createMarketplaceImportGate({ catalog: fakeCatalog() })
  await gate.recheck({ ...ref, type: 'automation', sha256: 'a'.repeat(64) })
  await assert.rejects(gate.recheck({ ...ref, type: 'automation', sha256: 'b'.repeat(64) }), (e) => e.code === 'RESOURCE_PACKAGE_MISMATCH')
})

test('the consent digest is stable across key order and changes with any content change', () => {
  const a = { label: 'X', trigger: { type: 'webhook', fields: [] }, steps: [{ service: 's', args: { a: 1, b: 2 } }] }
  const b = { steps: [{ args: { b: 2, a: 1 }, service: 's' }], trigger: { fields: [], type: 'webhook' }, label: 'X' }
  assert.equal(definitionDigest(a), definitionDigest(b))
  assert.notEqual(definitionDigest(a), definitionDigest({ ...a, label: 'Y' }))
})

test('literal values typed into HTTP steps are counted (never echoed) so the importer can warn about credentials', async () => {
  const { httpLiteralCount } = await import('../automation-import-service.js')
  const definition = { label: 'x', trigger: { type: 'webhook', fields: [] }, steps: [
    { type: 'http', method: 'POST', url: 'https://api.example.test/hook?key=abc&v=2', body: { token: { from: 'value', value: 'sk_live_x' }, auth: { from: 'template', template: 'Bearer abc' }, name: { from: 'template', template: 'Hola {{name}}' }, total: { from: 'field', field: 'total' }, empty: { from: 'value', value: '' } } },
    { service: 'runly.notifications:notifications.send', args: { title: { from: 'template', template: 'Fijo' } } },
  ] }
  assert.equal(httpLiteralCount(definition), 4)
  assert.equal(httpLiteralCount({ steps: [{ type: 'http', method: 'GET', url: 'https://api.example.test/x', body: { a: { from: 'field', field: 'id' } } }] }), 0)
})
