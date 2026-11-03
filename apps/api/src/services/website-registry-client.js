import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { HEADERS, REGISTRY_BASE, signingString } from './website-registry-contract.js'

// Signed client for the global subdomain registry (Runly Developer Hub). The installation holds an Ed25519
// private key; the registry holds the public key it enrolled. Nothing here decides uniqueness.
export class RegistryUnavailableError extends Error {
  constructor(reason) { super('REGISTRY_UNAVAILABLE'); this.reason = reason }
}
export class RegistryError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function createRegistryClient({ baseUrl, installationId, privateKey, fetchImpl = fetch, timeoutMs = 8000, now = () => Date.now() }) {
  const seed = Buffer.from(privateKey, 'base64url')
  if (seed.length !== 32) throw new Error('REGISTRY_PRIVATE_KEY_INVALID')
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' })
  const root = baseUrl.replace(/\/+$/, '')
  // Opaque references: the registry never sees company or site identifiers of the ERP.
  const ref = (kind, id) => sha256(`${installationId}:${kind}:${id}`)

  async function call(method, path, payload, idempotencyKey = '') {
    const body = payload === undefined ? '' : JSON.stringify(payload)
    const timestamp = Math.floor(now() / 1000), nonce = randomBytes(16).toString('base64url')
    const message = signingString({ method, path, timestamp, nonce, bodySha256: sha256(body), idempotencyKey })
    const headers = {
      [HEADERS.installation]: installationId, [HEADERS.timestamp]: String(timestamp), [HEADERS.nonce]: nonce,
      [HEADERS.signature]: sign(null, Buffer.from(message), key).toString('base64url'),
    }
    if (idempotencyKey) headers[HEADERS.idempotency] = idempotencyKey
    if (body) headers['content-type'] = 'application/json'
    let response
    try {
      response = await fetchImpl(root + path, { method, headers, body: body || undefined, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) { throw new RegistryUnavailableError(error?.name ?? 'network') }
    if (response.status >= 500) throw new RegistryUnavailableError(`http_${response.status}`)
    let json = null
    try { json = await response.json() } catch { json = null }
    if (!response.ok) throw new RegistryError(response.status, json?.error?.code ?? 'REGISTRY_ERROR')
    return { status: response.status, data: json }
  }
  const mutating = (method, path, payload, idempotencyKey) => call(method, path, payload, idempotencyKey ?? randomBytes(16).toString('hex'))
  const q = (params) => new URLSearchParams(params).toString()
  return {
    installationId,
    ref,
    availability: (namespace, slug) => call('GET', `${REGISTRY_BASE}/availability?${q({ namespace, slug })}`).then((r) => r.data),
    status: (hostname) => call('GET', `${REGISTRY_BASE}/names/${encodeURIComponent(hostname)}`).then((r) => r.data),
    list: async () => {
      const names = []
      let after = ''
      for (let page = 0; page < 50; page++) {
        const { data } = await call('GET', `${REGISTRY_BASE}/names?${q({ after, limit: '200' })}`)
        names.push(...data.names)
        if (!data.next || data.names.length < 200) break
        after = data.next
      }
      return names
    },
    claim: (input, idempotencyKey) => mutating('POST', `${REGISTRY_BASE}/names`, input, idempotencyKey).then((r) => r.data),
    keys: () => call('GET', `${REGISTRY_BASE}/keys`).then((r) => r.data.keys),
    rotateKey: (publicKey, graceSeconds, idempotencyKey) => mutating('POST', `${REGISTRY_BASE}/keys/rotate`, { publicKey, ...(graceSeconds && { graceSeconds }) }, idempotencyKey).then((r) => r.data),
    revokeKey: (keyId, idempotencyKey) => mutating('POST', `${REGISTRY_BASE}/keys/${encodeURIComponent(keyId)}/revoke`, undefined, idempotencyKey).then((r) => r.data),
    activate: (hostname, idempotencyKey) => mutating('POST', `${REGISTRY_BASE}/names/${encodeURIComponent(hostname)}/activate`, undefined, idempotencyKey).then((r) => r.data),
    release: (hostname, idempotencyKey) => mutating('POST', `${REGISTRY_BASE}/names/${encodeURIComponent(hostname)}/release`, undefined, idempotencyKey).then((r) => r.data),
    rename: (hostname, slug, idempotencyKey) => mutating('POST', `${REGISTRY_BASE}/names/${encodeURIComponent(hostname)}/rename`, { slug }, idempotencyKey).then((r) => r.data),
  }
}

// Returns null when the installation has no registry configuration (hostnames are then local-only).
export function createRegistryClientFromEnv(env = process.env, options = {}) {
  // A key file (0600, e.g. a mounted secret) is preferred so the key does not sit in the container environment.
  const baseUrl = env.RUNLY_REGISTRY_URL, installationId = env.RUNLY_INSTALLATION_ID
  const privateKey = env.RUNLY_INSTALLATION_PRIVATE_KEY_FILE ? readFileSync(env.RUNLY_INSTALLATION_PRIVATE_KEY_FILE, 'utf8').trim() : env.RUNLY_INSTALLATION_PRIVATE_KEY
  if (!baseUrl || !installationId || !privateKey) return null
  return createRegistryClient({ baseUrl, installationId, privateKey, ...options })
}
