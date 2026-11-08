import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadStagingResourceKeys, resourceTrustFromEnv, STAGING_TRUST_FORMAT } from '../catalog-resource-staging-trust.js'
import { createResourceCatalogService, RESOURCE_CONFIG_KEYS } from '../resource-catalog-service.js'
import { resourceSnapshotBytes } from '../catalog-resource-contract.js'

const vectors = JSON.parse(readFileSync(new URL('./fixtures/resource-feed-v1.vectors.json', import.meta.url), 'utf8'))
const VECTOR = vectors.testKey
const spki = (publicKey) => publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const idOf = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex')
const dir = mkdtempSync(join(tmpdir(), 'resource-trust-'))
const write = (name, content) => { const file = join(dir, name); writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content), { mode: 0o600 }); return file }
const doc = (keys) => ({ format: STAGING_TRUST_FORMAT, role: 'resource', keys })
const vectorKey = { keyId: VECTOR.keyId, publicKey: VECTOR.publicKey }
const env = (file, extra = {}) => ({ NODE_ENV: 'staging', RUNLY_RESOURCE_TRUST_MODE: 'staging', RUNLY_RESOURCE_TRUSTED_KEYS_FILE: file, ...extra })
test.after(() => rmSync(dir, { recursive: true, force: true }))

test('without the file nothing changes; with it, only an explicit non-production opt-in is accepted', () => {
  assert.deepEqual(loadStagingResourceKeys({}), [])
  assert.deepEqual(resourceTrustFromEnv({ NODE_ENV: 'production' }), {})
  const file = write('ok.json', doc([vectorKey]))
  assert.deepEqual(loadStagingResourceKeys(env(file)), [VECTOR.publicKey])
  for (const [extra, code] of [[{ NODE_ENV: 'production' }, 'RESOURCE_STAGING_TRUST_REQUIRES_NON_PRODUCTION'], [{ NODE_ENV: undefined }, 'RESOURCE_STAGING_TRUST_REQUIRES_NON_PRODUCTION'], [{ RUNLY_RESOURCE_TRUST_MODE: undefined }, 'RESOURCE_STAGING_TRUST_NOT_ENABLED']]) {
    assert.throws(() => loadStagingResourceKeys(env(file, extra)), { code })
  }
  const warnings = []
  assert.deepEqual(resourceTrustFromEnv(env(file, { NODE_ENV: 'production' }), { warn: (...a) => warnings.push(a.join(' ')) }), {}, 'production never widens trust')
  assert.ok(warnings[0].includes('RESOURCE_STAGING_TRUST_REQUIRES_NON_PRODUCTION'))
})

test('strict format, identity and role; files in the repository or writable by others are refused', () => {
  const other = spki(generateKeyPairSync('ed25519').publicKey), rsa = spki(generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey)
  const cases = [
    [doc([{ keyId: idOf(other), publicKey: VECTOR.publicKey }]), 'RESOURCE_STAGING_TRUST_KEY_ID_MISMATCH'],
    [doc([{ keyId: idOf(rsa), publicKey: rsa }]), 'RESOURCE_STAGING_TRUST_KEY_INVALID'],
    [{ ...doc([vectorKey]), role: 'community' }, 'RESOURCE_STAGING_TRUST_FORMAT'],
    [{ ...doc([vectorKey]), extra: 1 }, 'RESOURCE_STAGING_TRUST_FORMAT'],
    [doc([{ ...vectorKey, privateKey: 'x' }]), 'RESOURCE_STAGING_TRUST_KEY_INVALID'],
    [doc([vectorKey, vectorKey]), 'RESOURCE_STAGING_TRUST_KEY_DUPLICATE'],
    [doc([]), 'RESOURCE_STAGING_TRUST_FORMAT'],
    ['not json', 'RESOURCE_STAGING_TRUST_FILE_INVALID'],
  ]
  cases.forEach(([content, code], i) => assert.throws(() => loadStagingResourceKeys(env(write(`c${i}.json`, content))), { code }, code))
  assert.throws(() => loadStagingResourceKeys(env('relative/trust.json')), { code: 'RESOURCE_STAGING_TRUST_PATH_INVALID' })
  assert.throws(() => loadStagingResourceKeys(env(fileURLToPath(new URL('./fixtures/resource-feed-v1.vectors.json', import.meta.url)))), { code: 'RESOURCE_STAGING_TRUST_FILE_IN_REPOSITORY' })
  const file = write('writable.json', doc([vectorKey]))
  assert.throws(() => loadStagingResourceKeys(env(file), { platform: 'linux', stat: () => ({ isFile: () => true, size: 100, mode: 0o100666 }) }), { code: 'RESOURCE_STAGING_TRUST_FILE_WRITABLE' })
})

test('the mounted staging key verifies its feed; a key the feed only announces is never trusted', async () => {
  const configs = new Map([[RESOURCE_CONFIG_KEYS.url, 'https://hub-staging.example.test/api/v1/marketplace/catalog/resources/index.json']]), cache = new Map()
  const prisma = {
    instanceConfig: { findUnique: async ({ where }) => (configs.has(where.key) ? { value: configs.get(where.key) } : null), upsert: async ({ where, update }) => { configs.set(where.key, update.value) } },
    moduleCatalogCache: { findUnique: async ({ where }) => cache.get(where.url) ?? null, upsert: async ({ where, create, update }) => { cache.set(where.url, { ...(cache.get(where.url) ?? create), ...update }) } },
  }
  const now = () => Date.parse(vectors.snapshot1.envelope.signed.generatedAt) + 3_600_000
  const serve = (envelope) => async () => ({ status: 200, buffer: Buffer.from(JSON.stringify(envelope)) })
  await assert.rejects(createResourceCatalogService({ prisma, trust: resourceTrustFromEnv({}), now, readBytes: serve(vectors.snapshot1.envelope) }).refresh())
  const file = write('trusted.json', doc([vectorKey]))
  const trust = resourceTrustFromEnv(env(file), { warn: () => {} })
  assert.equal((await createResourceCatalogService({ prisma, trust, now, readBytes: serve(vectors.snapshot1.envelope) }).refresh()).status, 'ok')
  // A feed signed by a key it announces in trust.keys, but that is not mounted, is refused.
  const rogue = generateKeyPairSync('ed25519'), rogueSpki = spki(rogue.publicKey)
  const forged = JSON.parse(JSON.stringify(vectors.snapshot1.envelope))
  forged.signed.trust.keys = [{ ...forged.signed.trust.keys[0], keyId: idOf(rogueSpki), publicKey: rogueSpki }]
  forged.signatures = [{ keyId: idOf(rogueSpki), signature: sign(null, resourceSnapshotBytes(forged.signed), rogue.privateKey).toString('base64') }]
  cache.clear(); configs.delete(RESOURCE_CONFIG_KEYS.state)
  await assert.rejects(createResourceCatalogService({ prisma, trust, now, readBytes: serve(forged) }).refresh())
})
