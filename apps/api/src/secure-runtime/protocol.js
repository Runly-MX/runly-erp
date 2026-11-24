// Secure Module Runtime protocol v1 (experimental, F1B Stage 2).
// ADR: docs/architecture/adr-secure-module-runtime.md
//
// Two host-signed tokens travel with every gateway call:
//   - call token: who is calling (module identity bound to its trusted package
//     hash), on behalf of whom (company, user, permissions resolved by the
//     host from the authenticated request), which capabilities, until when.
//   - per-call nonce: single use, so a captured call cannot be replayed.
// The module never chooses any of these values: it only receives the opaque
// token from the host and forwards it.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto'

export const PROTOCOL_VERSION = 'runly.capabilities/v1'
export const TOKEN_TTL_MS = 60_000
const NONCE_TTL_MS = 2 * TOKEN_TTL_MS

export class GatewayError extends Error {
  constructor(code, message, status = 403, details = null) {
    super(message)
    this.name = 'GatewayError'
    this.code = code
    this.status = status
    this.details = details
  }
}

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

// Host key pair. Production: loaded from the host's secret store; the PoC
// generates one per process so restarting the host invalidates every token.
export function createHostSigner({ privateKeyPem = null, now = () => Date.now() } = {}) {
  const privateKey = privateKeyPem ? createPrivateKey(privateKeyPem) : generateKeyPairSync('ed25519').privateKey
  const publicKey = createPublicKey(privateKey)
  const nonces = new Map() // nonce -> expiry

  function issue(claims, ttlMs = TOKEN_TTL_MS) {
    const issuedAt = now()
    const body = { v: PROTOCOL_VERSION, jti: randomUUID(), iat: issuedAt, exp: issuedAt + ttlMs, ...claims }
    const payload = b64(body)
    return `${payload}.${sign(null, Buffer.from(payload), privateKey).toString('base64url')}`
  }

  function verifyToken(token) {
    const [payload, signature, extra] = String(token ?? '').split('.')
    if (!payload || !signature || extra !== undefined) throw new GatewayError('CONTEXT_INVALID', 'Token de llamada inválido.', 401)
    if (!verify(null, Buffer.from(payload), publicKey, Buffer.from(signature, 'base64url'))) throw new GatewayError('CONTEXT_INVALID', 'Firma de llamada inválida.', 401)
    let claims
    try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { throw new GatewayError('CONTEXT_INVALID', 'Token de llamada ilegible.', 401) }
    if (claims.v !== PROTOCOL_VERSION) throw new GatewayError('PROTOCOL_UNSUPPORTED', 'Versión de protocolo no soportada.', 400)
    if (!Number.isFinite(claims.exp) || claims.exp <= now()) throw new GatewayError('CONTEXT_EXPIRED', 'El token de llamada expiró.', 401)
    return claims
  }

  // Single-use nonce per call (replay protection), bounded memory.
  function consumeNonce(nonce) {
    const at = now()
    if (nonces.size > 50_000) for (const [key, expiry] of nonces) if (expiry <= at) nonces.delete(key)
    if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) throw new GatewayError('NONCE_REQUIRED', 'Falta un nonce de llamada válido.', 400)
    if (nonces.has(nonce) && nonces.get(nonce) > at) throw new GatewayError('REPLAYED_CALL', 'La llamada ya fue procesada.', 409)
    nonces.set(nonce, at + NONCE_TTL_MS)
  }

  return { issue, verify: verifyToken, consumeNonce, publicKey }
}
