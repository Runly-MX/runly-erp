// ERP E4: signed client of the Developer Hub installations channel (/installations/v1, H5 contract).
// Same installation identity and key as the subdomain registry (installation-signer.js), its own signed paths.
// It is OPTIONAL: the public Marketplace (E2 feed, E3a imports) never depends on it, and without configuration
// this module returns null. Private downloads are inactive in H5 (DEC-P1): public packages always go through E2.
import { createSignedTransport, errorCodeOf, readInstallationIdentity, sha256 } from '../installation-signer.js'
import { INSTALLATIONS_BASE, RECEIPT_LIMITS, receiptProblem } from './installations-contract.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const KEY = /^[A-Za-z0-9_-]{16,200}$/

// A definitive answer of the Hub: never retried automatically (authorization, validation, security, conflict).
export class InstallChannelError extends Error {
  constructor(status, code, detail = null) { super(code); this.name = 'InstallChannelError'; this.status = status; this.code = code; this.retryable = false; this.detail = detail }
}
// Network failure, timeout, 429 or 5xx: may be retried later with the SAME Idempotency-Key.
export class InstallChannelUnavailableError extends Error {
  constructor(reason, retryAfter = null) { super('INSTALLATIONS_UNAVAILABLE'); this.name = 'InstallChannelUnavailableError'; this.reason = reason; this.retryable = true; this.retryAfter = retryAfter }
}

export function createMarketplaceInstallClient({ baseUrl, installationId, privateKey, fetchImpl = fetch, timeoutMs = 8000, now = () => Date.now() }) {
  const transport = createSignedTransport({ baseUrl, installationId, privateKey, fetchImpl, timeoutMs, now })

  async function exchange(method, path, { body = '', idempotencyKey = '' } = {}) {
    let response
    try { response = await transport.send(method, path, { body, idempotencyKey }) } catch (error) { throw new InstallChannelUnavailableError(error?.reason ?? 'network') }
    if (response.status === 429) throw new InstallChannelUnavailableError('rate_limited', Number(response.headers.get('retry-after')) || null)
    if (response.status >= 500) throw new InstallChannelUnavailableError(`http_${response.status}`)
    return response
  }
  async function json(response) { try { return await response.json() } catch { return null } }
  async function fail(response) { throw new InstallChannelError(response.status, errorCodeOf(await json(response), 'INSTALLATIONS_ERROR')) }

  // The capabilities of THIS installation (diagnostics without attempting downloads).
  async function capabilities() {
    const response = await exchange('GET', `${INSTALLATIONS_BASE}/capabilities`)
    if (!response.ok) return fail(response)
    const data = await json(response)
    if (data?.schemaVersion !== 1 || data.installationId !== installationId || !Array.isArray(data.capabilities)) throw new InstallChannelError(502, 'INSTALLATIONS_RESPONSE_INVALID')
    return { installationId: data.installationId, capabilities: [...data.capabilities] }
  }

  // Bounded binary download (contract section 4), for when DEC-P1 activates installation releases. Today the Hub
  // answers 404 release_not_found for every release; public releases must keep using the E2 feed and packages.
  async function download(releaseId, { maxBytes, sha256: expected = null } = {}) {
    if (!UUID_V4.test(String(releaseId ?? ''))) throw new InstallChannelError(400, 'release_id_invalid')
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new InstallChannelError(400, 'MAX_BYTES_REQUIRED')
    const response = await exchange('GET', `${INSTALLATIONS_BASE}/downloads/${releaseId}`)
    if (!response.ok) return fail(response)
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); throw new InstallChannelError(502, 'DOWNLOAD_TOO_LARGE') }
    const chunks = []
    let size = 0
    for await (const chunk of response.body ?? []) {
      size += chunk.length
      if (size > maxBytes) { await response.body.cancel().catch(() => {}); throw new InstallChannelError(502, 'DOWNLOAD_TOO_LARGE') }
      chunks.push(Buffer.from(chunk))
    }
    const bytes = Buffer.concat(chunks), digest = sha256(bytes)
    // The caller still verifies the release signature from the feed before using the bytes.
    if (digest !== response.headers.get('x-runly-sha256') || (expected && digest !== expected)) throw new InstallChannelError(502, 'DOWNLOAD_MISMATCH')
    return { bytes, sha256: digest, size }
  }

  // Opt-in install receipt. Validated locally with the vendored contract; the exact bytes sent are the bytes signed.
  async function sendReceipt(receipt, idempotencyKey) {
    if (!KEY.test(idempotencyKey ?? '')) throw new InstallChannelError(400, 'IDEMPOTENCY_KEY_REQUIRED')
    const problem = receiptProblem(receipt, { now: now() })
    if (problem) throw new InstallChannelError(400, 'receipt_invalid', problem)
    const body = JSON.stringify(receipt)
    if (Buffer.byteLength(body) > RECEIPT_LIMITS.maxBytes) throw new InstallChannelError(413, 'BODY_TOO_LARGE')
    const response = await exchange('POST', `${INSTALLATIONS_BASE}/receipts`, { body, idempotencyKey })
    if (response.status !== 201 && response.status !== 200) return fail(response)
    const data = await json(response)
    return { receiptId: data?.receiptId, receivedAt: data?.receivedAt, replay: response.status === 200 }
  }

  return { installationId, capabilities, download, sendReceipt }
}

// null when the installation has no channel configuration: the ERP boots and the public Marketplace works.
// URL: RUNLY_INSTALLATIONS_URL, or the registry URL (the same Hub serves both). No URL is hard-coded.
export function createMarketplaceInstallClientFromEnv(env = process.env, options = {}) {
  const baseUrl = env.RUNLY_INSTALLATIONS_URL || env.RUNLY_REGISTRY_URL
  const identity = baseUrl ? readInstallationIdentity(env, { reload: true }) : null
  if (!baseUrl || !identity) return null
  return createMarketplaceInstallClient({ baseUrl, ...identity, ...options })
}
export function createMarketplaceInstallClientFromEnvSafe(env = process.env, { warn = console.error, ...options } = {}) {
  try { return createMarketplaceInstallClientFromEnv(env, options) } catch (error) {
    warn('[marketplace-installations] invalid installation configuration; the signed channel is disabled (public Marketplace unaffected):', error?.message?.startsWith('REGISTRY_') ? error.message : 'key unreadable')
    return null
  }
}
