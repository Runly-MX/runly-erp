import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { HEADERS, signingString } from './website-registry-contract.js'

// One signed transport for every Developer Hub channel of this installation (/registry/v1, /installations/v1).
// Same identity and Ed25519 key; the signed string binds method, FULL path (+query), timestamp, nonce, body sha256
// and Idempotency-Key, so a signature for one channel or path never verifies on another.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function parseInstallationKey(privateKey) {
  const seed = Buffer.from(String(privateKey ?? ''), 'base64url')
  if (seed.length !== 32) throw new Error('REGISTRY_PRIVATE_KEY_INVALID')
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' })
}

// privateKey: the base64url seed, or a function returning it (re-read after a key rotation without a restart).
export function createSignedTransport({ baseUrl, installationId, privateKey, fetchImpl = fetch, timeoutMs = 8000, now = () => Date.now() }) {
  let cached = null
  const keyOf = () => {
    const value = typeof privateKey === 'function' ? privateKey() : privateKey
    if (cached?.value !== value) cached = { value, key: parseInstallationKey(value) }
    return cached.key
  }
  keyOf()
  const root = String(baseUrl).replace(/\/+$/, '')
  // body: the exact string that is sent and hashed. Throws { transport: true } on network failure or timeout.
  async function send(method, path, { body = '', idempotencyKey = '' } = {}) {
    const timestamp = Math.floor(now() / 1000), nonce = randomBytes(16).toString('base64url')
    const message = signingString({ method, path, timestamp, nonce, bodySha256: sha256(body), idempotencyKey })
    const headers = {
      [HEADERS.installation]: installationId, [HEADERS.timestamp]: String(timestamp), [HEADERS.nonce]: nonce,
      [HEADERS.signature]: sign(null, Buffer.from(message), keyOf()).toString('base64url'),
    }
    if (idempotencyKey) headers[HEADERS.idempotency] = idempotencyKey
    if (body) headers['content-type'] = 'application/json'
    try {
      return await fetchImpl(root + path, { method, headers, body: body || undefined, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) { throw Object.assign(new Error('TRANSPORT_FAILED'), { transport: true, reason: error?.name ?? 'network' }) }
  }
  return { installationId, send }
}

// Hub error bodies: /registry/v1 { error: { code } }, /installations/v1 { code, message }.
export const errorCodeOf = (json, fallback) => (typeof json?.code === 'string' ? json.code : typeof json?.error?.code === 'string' ? json.error.code : fallback)

// Identity from the environment. A key file (0600, e.g. a mounted secret) is preferred over the variable.
// reload: re-read the file when it changes (key rotation without a restart).
export function readInstallationIdentity(env = process.env, { reload = false } = {}) {
  const installationId = env.RUNLY_INSTALLATION_ID, file = env.RUNLY_INSTALLATION_PRIVATE_KEY_FILE
  if (!installationId || (!file && !env.RUNLY_INSTALLATION_PRIVATE_KEY)) return null
  if (!file) return { installationId, privateKey: env.RUNLY_INSTALLATION_PRIVATE_KEY }
  const read = () => readFileSync(file, 'utf8').trim()
  if (!read()) return null
  if (!reload) return { installationId, privateKey: read() }
  const stampOf = () => { const s = statSync(file); return `${s.mtimeMs}:${s.size}` }
  let stamp = stampOf(), value = read()
  return { installationId, privateKey: () => { const next = stampOf(); if (next !== stamp) { value = read(); stamp = next } return value } }
}
