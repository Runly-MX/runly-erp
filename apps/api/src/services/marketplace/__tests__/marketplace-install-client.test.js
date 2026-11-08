import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createPrivateKey, createPublicKey, verify } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMarketplaceInstallClient, createMarketplaceInstallClientFromEnv, createMarketplaceInstallClientFromEnvSafe, InstallChannelError, InstallChannelUnavailableError } from '../marketplace-install-client.js'
import { createMarketplaceReceiptsService } from '../marketplace-receipts-service.js'
import { signingString } from '../../website-registry-contract.js'

const seed = Buffer.alloc(32, 9), PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex')
const publicKey = createPublicKey(createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' }))
const sha256 = (v) => createHash('sha256').update(v).digest('hex')
const ID = '11111111-1111-4111-8111-111111111111', RELEASE = '6b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const receipt = () => ({ schemaVersion: 1, kind: 'component', solutionReleaseId: null, state: 'applied', components: [{ releaseId: RELEASE, sha256: 'a'.repeat(64), state: 'applied', errorCode: null }], startedAt: '2026-11-08T10:00:00.000Z', finishedAt: '2026-11-08T10:00:01.000Z' })
function make(respond, extra = {}) {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return respond(url, init) }
  return { calls, client: createMarketplaceInstallClient({ baseUrl: 'https://hub.example.test/', installationId: ID, privateKey: seed.toString('base64url'), fetchImpl, now: () => Date.parse('2026-11-08T10:05:00Z'), ...extra }) }
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const signedOk = ({ url, init }) => {
  const h = init.headers, path = new URL(url).pathname + new URL(url).search
  const message = signingString({ method: init.method, path, timestamp: h['x-runly-timestamp'], nonce: h['x-runly-nonce'], bodySha256: sha256(init.body ?? ''), idempotencyKey: h['idempotency-key'] ?? '' })
  return verify(null, Buffer.from(message), publicKey, Buffer.from(h['x-runly-signature'], 'base64url'))
}

test('the vendored H5 contract is byte-identical to the Developer Hub (H5 990fd20)', () => {
  const vendored = readFileSync(new URL('../installations-contract.js', import.meta.url))
  assert.equal(sha256(vendored), '5457bcb94e61bdb836f8b3529a394142c2bfc92b7588d86e0e681918b2ed75e3')
  const hub = new URL('../../../../../../../runly-developer-hub/packages/contracts/installations.js', import.meta.url)
  if (existsSync(hub)) assert.equal(sha256(readFileSync(hub, 'utf8').replace(/\r\n/g, '\n')), sha256(vendored), 'the Hub contract changed: re-vendor it')
})

test('capabilities: signed over the full /installations/v1 path, only this installation is accepted', async () => {
  const { calls, client } = make(() => json(200, { schemaVersion: 1, installationId: ID, capabilities: ['marketplace:receipt', 'registry:names'] }))
  assert.deepEqual(await client.capabilities(), { installationId: ID, capabilities: ['marketplace:receipt', 'registry:names'] })
  assert.equal(calls[0].url, 'https://hub.example.test/installations/v1/capabilities')
  assert.ok(signedOk(calls[0]))
  const other = make(() => json(200, { schemaVersion: 1, installationId: RELEASE, capabilities: ['marketplace:download'] }))
  await assert.rejects(other.client.capabilities(), { code: 'INSTALLATIONS_RESPONSE_INVALID' })
})

test('receipts: validated locally, the exact bytes sent are signed, 201/200 and every H5 error classified', async () => {
  const { calls, client } = make(() => json(201, { receiptId: RELEASE, receivedAt: '2026-11-08T10:05:00.000Z' }))
  assert.deepEqual(await client.sendReceipt(receipt(), 'e3a-studio-0123456789abcdef'), { receiptId: RELEASE, receivedAt: '2026-11-08T10:05:00.000Z', replay: false })
  assert.ok(signedOk(calls[0])); assert.equal(calls[0].init.body, JSON.stringify(receipt())); assert.equal(calls[0].init.headers['idempotency-key'], 'e3a-studio-0123456789abcdef')
  assert.equal((await make(() => json(200, { receiptId: RELEASE, receivedAt: 'x' })).client.sendReceipt(receipt(), 'k'.repeat(16))).replay, true)
  // Never sent: invalid receipt, extra (personal) fields, missing or unstable key.
  const local = make(() => assert.fail('must not reach the network'))
  await assert.rejects(local.client.sendReceipt({ ...receipt(), companyName: 'Acme' }, 'k'.repeat(16)), { code: 'receipt_invalid', detail: 'keys' })
  await assert.rejects(local.client.sendReceipt({ ...receipt(), state: 'partial' }, 'k'.repeat(16)), { code: 'receipt_invalid' })
  await assert.rejects(local.client.sendReceipt(receipt()), { code: 'IDEMPOTENCY_KEY_REQUIRED' })
  for (const [status, code] of [[400, 'receipt_invalid'], [401, 'REGISTRY_AUTH_FAILED'], [403, 'capability_missing'], [409, 'idempotency_conflict'], [422, 'unknown_release']]) {
    await assert.rejects(make(() => json(status, { code, message: 'x' })).client.sendReceipt(receipt(), 'k'.repeat(16)), (e) => e instanceof InstallChannelError && e.status === status && e.code === code && e.retryable === false)
  }
  for (const respond of [() => json(503, {}), () => json(429, { code: 'RATE_LIMITED' }, { 'retry-after': '7' }), () => { throw new TypeError('fetch failed') }]) {
    await assert.rejects(make(respond).client.sendReceipt(receipt(), 'k'.repeat(16)), (e) => e instanceof InstallChannelUnavailableError && e.retryable)
  }
})

test('downloads: inactive in H5 (404), bounded and hash-checked for a future activation, never for public releases', async () => {
  const local = make(() => assert.fail('must not reach the network'))
  await assert.rejects(local.client.download('not-a-uuid', { maxBytes: 10 }), { code: 'release_id_invalid' })
  await assert.rejects(local.client.download(RELEASE), { code: 'MAX_BYTES_REQUIRED' })
  await assert.rejects(make(() => json(404, { code: 'release_not_found', message: 'x' })).client.download(RELEASE, { maxBytes: 100 }), { status: 404, code: 'release_not_found' })
  const bytes = Buffer.from('paquete privado futuro')
  const ok = make(() => new Response(bytes, { status: 200, headers: { 'x-runly-sha256': sha256(bytes) } }))
  assert.equal((await ok.client.download(RELEASE, { maxBytes: 100 })).sha256, sha256(bytes))
  await assert.rejects(ok.client.download(RELEASE, { maxBytes: 5 }), { code: 'DOWNLOAD_TOO_LARGE' })
  await assert.rejects(make(() => new Response(bytes, { status: 200, headers: { 'x-runly-sha256': 'b'.repeat(64) } })).client.download(RELEASE, { maxBytes: 100 }), { code: 'DOWNLOAD_MISMATCH' })
})

test('configuration is optional: no config -> null; registry URL reused; a rotated key file is picked up without restart', () => {
  assert.equal(createMarketplaceInstallClientFromEnv({}), null)
  assert.equal(createMarketplaceInstallClientFromEnv({ RUNLY_INSTALLATIONS_URL: 'https://hub.example.test' }), null)
  const warnings = []
  assert.equal(createMarketplaceInstallClientFromEnvSafe({ RUNLY_REGISTRY_URL: 'https://x', RUNLY_INSTALLATION_ID: ID, RUNLY_INSTALLATION_PRIVATE_KEY: 'SECRET-BAD' }, { warn: (...a) => warnings.push(a.join(' ')) }), null)
  assert.ok(!warnings.join('').includes('SECRET-BAD'))
  const dir = mkdtempSync(join(tmpdir(), 'install-key-'))
  try {
    const file = join(dir, 'key')
    writeFileSync(file, seed.toString('base64url'), { mode: 0o600 })
    const captured = []
    const client = createMarketplaceInstallClientFromEnv({ RUNLY_REGISTRY_URL: 'https://hub.example.test', RUNLY_INSTALLATION_ID: ID, RUNLY_INSTALLATION_PRIVATE_KEY_FILE: file }, { fetchImpl: async (url, init) => { captured.push(init.headers['x-runly-signature']); return json(200, { schemaVersion: 1, installationId: ID, capabilities: [] }) }, now: () => 1790000000000 })
    return (async () => {
      await client.capabilities()
      writeFileSync(file, Buffer.alloc(32, 3).toString('base64url')); utimesSync(file, new Date(), new Date(Date.now() + 5000))
      await client.capabilities()
      assert.notEqual(captured[0], captured[1])
    })().finally(() => rmSync(dir, { recursive: true, force: true }))
  } catch (error) { rmSync(dir, { recursive: true, force: true }); throw error }
})

test('receipts service: off by default and on no config; explicit, stable and never throwing when on', async () => {
  const config = new Map(), audits = [], sent = []
  const rows = { studio: [{ source: { kind: 'marketplace', releaseId: RELEASE, sha256: 'a'.repeat(64), companyId: 'X' }, started: new Date('2026-11-08T10:00:00Z'), finished: new Date('2026-11-08T10:00:02Z') }] }
  const prisma = {
    instanceConfig: { findUnique: async ({ where }) => (config.has(where.key) ? { value: config.get(where.key) } : null), upsert: async ({ where, create }) => { config.set(where.key, create.value) } },
    auditLog: { create: async ({ data }) => audits.push(data) },
    $queryRaw: async () => rows.studio,
  }
  const client = { sendReceipt: async (r, k) => { sent.push([r, k]); return { receiptId: RELEASE, receivedAt: 'x', replay: sent.length > 1 } } }
  const service = createMarketplaceReceiptsService({ prisma, client })
  const args = { kind: 'studio', importId: RELEASE, companyId: ID }
  assert.deepEqual(await service.reportImportReceipt(args), { sent: false, reason: 'disabled' })
  assert.equal(sent.length, 0)
  assert.deepEqual(await createMarketplaceReceiptsService({ prisma }).capabilities(), { configured: false, capabilities: [] })
  await service.setEnabled(true, ID)
  assert.equal(audits[0].action, 'marketplace.receipts.enabled'); assert.equal(audits[0].companyId, null)
  const first = await service.reportImportReceipt(args), second = await service.reportImportReceipt(args)
  assert.equal(first.sent, true); assert.equal(second.replay, true)
  assert.equal(sent[0][1], sent[1][1]); assert.deepEqual(sent[0][0], sent[1][0], 'same receipt bytes on retry')
  assert.ok(!JSON.stringify(sent[0][0]).includes(ID) && !JSON.stringify(sent[0][0]).includes('"X"'), 'no company or user')
  const failing = createMarketplaceReceiptsService({ prisma, client: { sendReceipt: async () => { throw new InstallChannelError(403, 'capability_missing') } } })
  assert.deepEqual(await failing.reportImportReceipt(args), { sent: false, reason: 'capability_missing', status: 403, retryable: false })
  await assert.rejects(service.setEnabled('yes'), /RECEIPTS_ENABLED_INVALID/)
})
