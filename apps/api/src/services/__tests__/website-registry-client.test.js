import test from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, sign, verify, createHash } from 'node:crypto'
import { createRegistryClient, createRegistryClientFromEnv, createRegistryClientFromEnvSafe, RegistryError, RegistryUnavailableError } from '../website-registry-client.js'
import { signingString, slugProblem } from '../website-registry-contract.js'
import { localLiveness } from '../website-hostname-service.js'

const seed = Buffer.alloc(32, 7)
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex')
const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' })
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

test('contract parity with the Developer Hub: same canonical string, same pinned signature vector', () => {
  const message = signingString({ method: 'post', path: '/registry/v1/names', timestamp: 1790000000, nonce: 'nonce-0123456789ab', bodySha256: sha256('{"a":1}'), idempotencyKey: 'idem-0123456789abcdef' })
  // The Hub test signs the identical inputs with the identical seed and expects this exact value.
  assert.equal(sign(null, Buffer.from(message), privateKey).toString('base64url'), 'X1jOJVuFkKi2S36kC7k2fmnkohyeddps4_BH1kcEv6cydzs02bX7UP38Zr-V7al0Yh4G8eYL3F6F4nHjC-Q1Ag')
  assert.equal(slugProblem('mi-tienda'), null)
  assert.equal(slugProblem('str1pe'), 'NAME_RESERVED')
})

test('requests are signed over method, path, body, nonce and idempotency key, and verifiable with the public key', async () => {
  const captured = []
  const fetchImpl = async (url, init) => { captured.push({ url, init }); return new Response(JSON.stringify({ hostname: 'a.sites.test', state: 'pending' }), { status: 201 }) }
  const client = createRegistryClient({ baseUrl: 'http://127.0.0.1:1/', installationId: '11111111-1111-4111-8111-111111111111', privateKey: seed.toString('base64url'), fetchImpl, now: () => 1790000000000 })
  await client.claim({ namespace: 'sites.test', slug: 'mi-tienda', companyRef: client.ref('company', 'c'), siteRef: client.ref('site', 's') }, 'idem-0123456789abcdef')
  const { url, init } = captured[0]
  assert.equal(url, 'http://127.0.0.1:1/registry/v1/names')
  const h = init.headers
  const message = signingString({ method: 'POST', path: '/registry/v1/names', timestamp: h['x-runly-timestamp'], nonce: h['x-runly-nonce'], bodySha256: sha256(init.body), idempotencyKey: 'idem-0123456789abcdef' })
  const publicKey = createPublicKey(privateKey)
  assert.equal(verify(null, Buffer.from(message), publicKey, Buffer.from(h['x-runly-signature'], 'base64url')), true)
  assert.notEqual(verify(null, Buffer.from(message + 'x'), publicKey, Buffer.from(h['x-runly-signature'], 'base64url')), true)
  assert.equal(h['idempotency-key'], 'idem-0123456789abcdef')
})

test('references are opaque and stable per installation; company and site ids never leave the ERP', () => {
  const a = createRegistryClient({ baseUrl: 'http://x', installationId: 'inst-a', privateKey: seed.toString('base64url') })
  const b = createRegistryClient({ baseUrl: 'http://x', installationId: 'inst-b', privateKey: seed.toString('base64url') })
  assert.match(a.ref('company', 'c1'), /^[a-f0-9]{64}$/)
  assert.equal(a.ref('company', 'c1'), a.ref('company', 'c1'))
  assert.notEqual(a.ref('company', 'c1'), b.ref('company', 'c1'))
  assert.notEqual(a.ref('company', 'c1'), a.ref('site', 'c1'))
})

test('registry failures are classified: unreachable and 5xx are unavailability, 4xx carry the stable code', async () => {
  const make = (fetchImpl) => createRegistryClient({ baseUrl: 'http://x', installationId: 'i', privateKey: seed.toString('base64url'), fetchImpl })
  await assert.rejects(make(async () => { throw new TypeError('connect ECONNREFUSED') }).status('a.sites.test'), RegistryUnavailableError)
  await assert.rejects(make(async () => new Response('{}', { status: 503 })).status('a.sites.test'), RegistryUnavailableError)
  await assert.rejects(make(async () => new Response(JSON.stringify({ error: { code: 'NAME_UNAVAILABLE' } }), { status: 409 })).claim({}, 'k'.repeat(20)), (e) => e instanceof RegistryError && e.status === 409 && e.code === 'NAME_UNAVAILABLE')
})

test('the client exists only when the whole configuration is present, and a bad key is refused', () => {
  assert.equal(createRegistryClientFromEnv({}), null)
  assert.equal(createRegistryClientFromEnv({ RUNLY_REGISTRY_URL: 'http://x', RUNLY_INSTALLATION_ID: 'i' }), null)
  assert.throws(() => createRegistryClientFromEnv({ RUNLY_REGISTRY_URL: 'http://x', RUNLY_INSTALLATION_ID: 'i', RUNLY_INSTALLATION_PRIVATE_KEY: 'short' }), /REGISTRY_PRIVATE_KEY_INVALID/)
})

test('local liveness: only an assigned name in a ready namespace is ever served', () => {
  assert.deepEqual(localLiveness({ state: 'assigned', ready: true }), { state: 'assigned', ready: true })
  assert.deepEqual(localLiveness({ state: 'assigned', ready: false }), { state: 'assigned', ready: false })
  for (const state of ['pending', 'suspended', 'revoked', 'quarantined']) assert.equal(localLiveness({ state, ready: true }).ready, false, state)
})

test('key lifecycle calls hit the registry key routes with idempotent signed mutations', async () => {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, method: init.method ?? 'GET', body: init.body }); return new Response(JSON.stringify({ keys: [], fingerprint: 'abcdef0123456789', revoked: true }), { status: 200 }) }
  const client = createRegistryClient({ baseUrl: 'http://x', installationId: 'i', privateKey: seed.toString('base64url'), fetchImpl })
  await client.keys(); await client.rotateKey('A'.repeat(43), 3600); await client.revokeKey('11111111-1111-4111-8111-111111111111')
  assert.deepEqual(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`), ['GET /registry/v1/keys', 'POST /registry/v1/keys/rotate', 'POST /registry/v1/keys/11111111-1111-4111-8111-111111111111/revoke'])
  assert.deepEqual(JSON.parse(calls[1].body), { publicKey: 'A'.repeat(43), graceSeconds: 3600 })
})

test('a key file is preferred over the environment variable, and a real namespace never falls back to local assignment', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { localFallbackAllowed } = await import('../website-hostname-service.js')
  const dir = mkdtempSync(join(tmpdir(), 'registry-key-'))
  try {
    writeFileSync(join(dir, 'key'), seed.toString('base64url') + '\n', { mode: 0o600 })
    const client = createRegistryClientFromEnv({ RUNLY_REGISTRY_URL: 'http://x', RUNLY_INSTALLATION_ID: 'i', RUNLY_INSTALLATION_PRIVATE_KEY_FILE: join(dir, 'key') })
    assert.ok(client)
    assert.equal(localFallbackAllowed(null, 'sites.lab.test'), true)
    assert.equal(localFallbackAllowed(null, 'sites.runly.mx'), false, 'no registry and a real namespace: the reservation is refused')
    assert.equal(localFallbackAllowed(client, 'sites.lab.test'), false, 'with a registry configured the registry always decides')
    assert.equal(localFallbackAllowed(null, undefined), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a broken registry configuration degrades to "no registry" without leaking the key or stopping the boot', () => {
  const warnings = []
  const bad = { RUNLY_REGISTRY_URL: 'http://x', RUNLY_INSTALLATION_ID: 'i', RUNLY_INSTALLATION_PRIVATE_KEY: 'SECRET-NOT-A-KEY' }
  assert.equal(createRegistryClientFromEnvSafe(bad, { warn: (...args) => warnings.push(args.join(' ')) }), null)
  assert.equal(createRegistryClientFromEnvSafe({ ...bad, RUNLY_INSTALLATION_PRIVATE_KEY: undefined, RUNLY_INSTALLATION_PRIVATE_KEY_FILE: '/nonexistent/key' }, { warn: (...args) => warnings.push(args.join(' ')) }), null)
  assert.equal(warnings.length, 2); assert.equal(warnings.join('').includes('SECRET-NOT-A-KEY'), false)
  assert.ok(createRegistryClientFromEnvSafe({ ...bad, RUNLY_INSTALLATION_PRIVATE_KEY: Buffer.alloc(32, 1).toString('base64url') }))
})
