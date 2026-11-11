import test from 'node:test'
import assert from 'node:assert/strict'
import { createCatalogV2Service, RUNLY_CATALOG_SOURCE } from '../catalog-v2-service.js'
import { CatalogDownloadError } from '../catalog-download.js'

const failure = status => Object.assign(new CatalogDownloadError('CATALOG_UNREACHABLE'), { httpStatus: status })
function service({ config = {}, readBytes = async () => { throw failure(404) } } = {}) {
  return createCatalogV2Service({ prisma: {
    instanceConfig: { findUnique: async ({ where }) => config[where.key] === undefined ? null : { value: config[where.key] } },
    moduleCatalogCache: { findUnique: async () => null },
  }, readBytes })
}
test('unpublished default module endpoints return an explicit unverified empty state per domain', async () => {
  const result = await service().list()
  assert.equal(result.status, 'not_published'); assert.equal(result.verified, false); assert.deepEqual(result.modules, [])
  for (const domain of Object.values(result.catalogs)) {
    assert.equal(domain.error, 'catalog_not_published'); assert.equal(domain.diagnostic.httpStatus, 404); assert.equal(domain.verified, false)
  }
})
test('custom 404, HTTP upstream failure, TLS, DNS and no verified copy remain errors with distinct diagnostics', async () => {
  for (const [config, error, expected] of [
    [{ 'catalog.source.mode': 'custom', 'catalog.v2.url': 'https://catalog.example.test/index.json' }, failure(404), { httpStatus: 404 }],
    [{}, failure(503), { httpStatus: 503 }],
    [{}, Object.assign(new Error('TLS'), { code: 'CERT_HAS_EXPIRED' }), { cause: 'CERT_HAS_EXPIRED' }],
    [{}, Object.assign(new Error('DNS'), { code: 'ENOTFOUND' }), { cause: 'ENOTFOUND' }],
  ]) await assert.rejects(service({ config, readBytes: async () => { throw error } }).list(), e => {
    assert.equal(e.code, 'catalog_unreachable'); assert.equal(e.details.verifiedCopy, false)
    for (const [key, value] of Object.entries(expected)) assert.equal(e.details[key], value)
    return true
  })
})
test('one default 404 never hides a TLS error in the other domain or an invalid feed', async () => {
  await assert.rejects(service({ readBytes: async url => { if (url === RUNLY_CATALOG_SOURCE.communityUrl) throw failure(404); throw Object.assign(new Error('TLS'), { code: 'CERT_HAS_EXPIRED' }) } }).list(), e => e.code === 'catalog_unreachable' && e.details.catalogs.community.error === 'catalog_not_published')
  await assert.rejects(service({ readBytes: async () => ({ buffer: Buffer.from('{}') }) }).list(), e => e.status === 422 && e.code !== 'catalog_not_published')
})
