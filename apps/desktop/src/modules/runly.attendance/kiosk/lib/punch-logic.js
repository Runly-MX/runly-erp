// Pure punch rules for the offline kiosk. Mirrors apps/api attendance-core.js
// (nextDirection, verifyPin, verifyPhonePayload) so decisions made offline match
// what the server re-validates on sync. No DOM, no network.
import { base64UrlToBytes, bytesToHex } from './encoding.js'

export const PRESENCE_WINDOW_MS = 24 * 60 * 60 * 1000
export const PHONE_QR_WINDOW_MS = 45_000
export const DUPLICATE_WINDOW_MS = 20_000
export const PIN_MAX_FAILS = 5
export const PIN_LOCK_MS = 30_000
export const PHONE_PAYLOAD_PREFIX = 'RA1'

export function nextDirection(lastPunch, mode = 'both', now = new Date()) {
  if (mode === 'in' || mode === 'out') return mode
  if (!lastPunch || lastPunch.status === 'voided') return 'in'
  if (new Date(now) - new Date(lastPunch.occurredAt) > PRESENCE_WINDOW_MS) return 'in'
  return lastPunch.direction === 'in' ? 'out' : 'in'
}

// Latest of the roster's last punch and the punches recorded on this device.
export function latestPunch(a, b) {
  if (!a) return b ?? null
  if (!b) return a
  return new Date(b.occurredAt) > new Date(a.occurredAt) ? b : a
}

export function isDuplicatePunch(lastAtMs, now = Date.now(), windowMs = DUPLICATE_WINDOW_MS) {
  return lastAtMs != null && now - lastAtMs < windowMs
}

// pinHash format: p1$<iterations>$<saltHex>$<hashHex>. The server feeds the salt
// hex STRING (utf-8 bytes) to PBKDF2, not the decoded bytes.
export async function verifyPin(pin, stored, subtle = globalThis.crypto.subtle) {
  if (!stored || pin == null || pin === '') return false
  const [version, iterations, salt, hash] = String(stored).split('$')
  if (version !== 'p1' || !salt || !hash || !Number(iterations)) return false
  const enc = new TextEncoder()
  const material = await subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: Number(iterations) }, material, 256)
  const got = bytesToHex(bits)
  const expected = hash.toLowerCase()
  if (got.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i += 1) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// 5 wrong PINs for one employee code lock that code for 30 s.
export function createPinThrottle({ maxFails = PIN_MAX_FAILS, lockMs = PIN_LOCK_MS } = {}) {
  const state = new Map()
  const key = (code) => String(code).trim().toLowerCase()
  return {
    remainingMs(code, now = Date.now()) {
      const s = state.get(key(code))
      return s && s.until > now ? s.until - now : 0
    },
    fail(code, now = Date.now()) {
      const k = key(code)
      const s = state.get(k) ?? { fails: 0, until: 0 }
      if (s.until && s.until <= now) { s.fails = 0; s.until = 0 }
      s.fails += 1
      if (s.fails >= maxFails) { s.until = now + lockMs; s.fails = 0 }
      state.set(k, s)
      return s.until > now ? s.until - now : 0
    },
    success(code) { state.delete(key(code)) },
  }
}

export function normalizeUid(value) {
  return String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function parsePhonePayload(payload) {
  const parts = String(payload ?? '').trim().split('.')
  if (parts.length !== 4 || parts[0] !== PHONE_PAYLOAD_PREFIX) return null
  const [, personId, ts, sig] = parts
  if (!/^[0-9a-f-]{36}$/i.test(personId) || !/^\d{9,12}$/.test(ts) || !sig) return null
  return { personId, ts: Number(ts), sig }
}

// Returns { ok, reason?, personId?, ts? }. Signature is raw r||s (P1363).
export async function verifyPhonePayload({ payload, jwk, now = Date.now(), windowMs = PHONE_QR_WINDOW_MS, subtle = globalThis.crypto.subtle }) {
  const parsed = typeof payload === 'string' ? parsePhonePayload(payload) : payload
  if (!parsed || !jwk) return { ok: false, reason: 'malformed' }
  if (Math.abs(now - parsed.ts * 1000) > windowMs) return { ok: false, reason: 'expired' }
  try {
    const key = await subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const message = new TextEncoder().encode(`${parsed.personId}.${parsed.ts}`)
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, base64UrlToBytes(parsed.sig), message)
    return ok ? { ok: true, personId: parsed.personId, ts: parsed.ts } : { ok: false, reason: 'bad_signature' }
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
}

// Each (personId, ts) QR can be used once on this kiosk.
export function createReplayGuard(maxAgeMs = 5 * 60_000) {
  const used = new Map()
  const prune = (now) => { for (const [k, at] of used) if (now - at > maxAgeMs) used.delete(k) }
  return {
    has(personId, ts) { return used.has(`${personId}:${ts}`) },
    add(personId, ts, now = Date.now()) { prune(now); used.set(`${personId}:${ts}`, now) },
  }
}
