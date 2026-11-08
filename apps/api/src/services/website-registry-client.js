import { randomBytes } from 'node:crypto'
import { REGISTRY_BASE } from './website-registry-contract.js'
import { createSignedTransport, readInstallationIdentity, sha256 } from './installation-signer.js'

// Signed client for the global subdomain registry (Runly Developer Hub). The installation holds an Ed25519
// private key; the registry holds the public key it enrolled. Nothing here decides uniqueness.
// Signing and transport are shared with the Marketplace installations channel (installation-signer.js).
export class RegistryUnavailableError extends Error {
  constructor(reason) { super('REGISTRY_UNAVAILABLE'); this.reason = reason }
}
export class RegistryError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}

export function createRegistryClient({ baseUrl, installationId, privateKey, fetchImpl = fetch, timeoutMs = 8000, now = () => Date.now() }) {
  const transport = createSignedTransport({ baseUrl, installationId, privateKey, fetchImpl, timeoutMs, now })
  // Opaque references: the registry never sees company or site identifiers of the ERP.
  const ref = (kind, id) => sha256(`${installationId}:${kind}:${id}`)

  async function call(method, path, payload, idempotencyKey = '') {
    const body = payload === undefined ? '' : JSON.stringify(payload)
    let response
    try {
      response = await transport.send(method, path, { body, idempotencyKey })
    } catch (error) { throw new RegistryUnavailableError(error?.reason ?? 'network') }
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
  const baseUrl = env.RUNLY_REGISTRY_URL, identity = baseUrl ? readInstallationIdentity(env) : null
  if (!baseUrl || !identity) return null
  return createRegistryClient({ baseUrl, ...identity, ...options })
}

// A misconfigured registry (bad key, unreadable key file) must not stop the ERP from booting: it is reported without any
// secret and treated as "no registry", so platform subdomains stay unavailable and nothing is ever assigned locally.
export function createRegistryClientFromEnvSafe(env = process.env, { warn = console.error, ...options } = {}) {
  try { return createRegistryClientFromEnv(env, options) } catch (error) {
    warn('[website-registry] invalid registry configuration; platform subdomains are disabled:', error?.message?.startsWith('REGISTRY_') ? error.message : 'key unreadable')
    return null
  }
}
