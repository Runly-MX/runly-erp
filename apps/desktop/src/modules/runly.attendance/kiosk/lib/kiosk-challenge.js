// Offline kiosk challenge shown to phones ("Con mi teléfono" mode). Mirrors
// apps/api attendance-core.js kioskChallengeMac: HMAC-SHA256 keyed with the
// roster's qrSecret (UTF-8 string), first 22 chars of the base64url digest.
import { bytesToBase64Url } from './encoding.js'

export const CHALLENGE_PREFIX = 'RK1'
export const CHALLENGE_REFRESH_MS = 25_000

export async function kioskChallengeMac(secret, kioskId, ts, subtle = globalThis.crypto.subtle) {
  const enc = new TextEncoder()
  const key = await subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await subtle.sign('HMAC', key, enc.encode(`${kioskId}.${ts}`))
  return bytesToBase64Url(sig).slice(0, 22)
}

// Returns { text, ts } for the QR, or null when the roster lacks the secret/id.
export async function buildKioskChallenge({ secret, kioskId, now = Date.now(), subtle } = {}) {
  if (!secret || !kioskId) return null
  const ts = Math.floor(now / 1000)
  const mac = await kioskChallengeMac(secret, kioskId, ts, subtle)
  return { text: `${CHALLENGE_PREFIX}.${kioskId}.${ts}.${mac}`, ts }
}
