import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { uuidv7 } from '../uuidv7.js'
import {
  nextDirection, verifyPin, createPinThrottle, verifyPhonePayload, createReplayGuard, isDuplicatePunch, normalizeUid, latestPunch,
} from '../punch-logic.js'
import { bytesToBase64Url } from '../encoding.js'

test('uuidv7 has version/variant bits, embeds time and is unique', () => {
  const id = uuidv7(1_760_000_000_000)
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(parseInt(id.replace(/-/g, '').slice(0, 12), 16), 1_760_000_000_000)
  assert.notEqual(uuidv7(), uuidv7())
})

test('nextDirection toggles, honors fixed modes and the 24h window', () => {
  const now = new Date('2026-10-11T12:00:00Z')
  assert.equal(nextDirection(null, 'both', now), 'in')
  assert.equal(nextDirection({ direction: 'in', occurredAt: '2026-10-11T08:00:00Z' }, 'both', now), 'out')
  assert.equal(nextDirection({ direction: 'out', occurredAt: '2026-10-11T08:00:00Z' }, 'both', now), 'in')
  assert.equal(nextDirection({ direction: 'in', occurredAt: '2026-10-09T08:00:00Z' }, 'both', now), 'in')
  assert.equal(nextDirection({ direction: 'in', occurredAt: '2026-10-11T08:00:00Z' }, 'in', now), 'in')
  const newer = { direction: 'out', occurredAt: '2026-10-11T10:00:00Z' }
  assert.equal(latestPunch({ direction: 'in', occurredAt: '2026-10-11T08:00:00Z' }, newer), newer)
})

test('PIN verifies against the server hash format (salt hex string as utf-8)', async () => {
  const salt = crypto.randomBytes(8).toString('hex')
  const stored = `p1$1000$${salt}$${crypto.pbkdf2Sync('4821', salt, 1000, 32, 'sha256').toString('hex')}`
  assert.equal(await verifyPin('4821', stored), true)
  assert.equal(await verifyPin('4822', stored), false)
  assert.equal(await verifyPin('4821', null), false)
})

test('PIN throttle locks a code after 5 failures for 30 s', () => {
  const t = createPinThrottle()
  const now = 1_000_000
  for (let i = 0; i < 4; i += 1) assert.equal(t.fail('E1', now), 0)
  assert.equal(t.fail('E1', now), 30_000)
  assert.equal(t.remainingMs('e1', now + 10_000), 20_000)
  assert.equal(t.remainingMs('E1', now + 31_000), 0)
  assert.equal(t.remainingMs('E2', now), 0)
})

test('QR payload built like the server test verifies; expired, tampered and wrong key do not', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const personId = '0194b3a0-1111-7222-8333-444455556666'
  const now = Date.now()
  const ts = Math.floor(now / 1000)
  const sig = crypto.sign('sha256', Buffer.from(`${personId}.${ts}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  const payload = `RA1.${personId}.${ts}.${sig}`
  assert.equal((await verifyPhonePayload({ payload, jwk, now })).ok, true)
  assert.equal((await verifyPhonePayload({ payload, jwk, now: now + 120_000 })).reason, 'expired')
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
  assert.equal((await verifyPhonePayload({ payload, jwk: other, now })).reason, 'bad_signature')
  assert.equal((await verifyPhonePayload({ payload: payload.replace('0194', '0195'), jwk, now })).ok, false)
  assert.equal((await verifyPhonePayload({ payload: 'nope', jwk, now })).reason, 'malformed')
})

test('WebCrypto-signed payload (phone side) verifies on the kiosk side', async () => {
  const { subtle } = globalThis.crypto
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await subtle.exportKey('jwk', pair.publicKey)
  const personId = '0194b3a0-1111-7222-8333-444455556666'
  const ts = Math.floor(Date.now() / 1000)
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(`${personId}.${ts}`))
  assert.equal(sig.byteLength, 64)
  const result = await verifyPhonePayload({ payload: `RA1.${personId}.${ts}.${bytesToBase64Url(sig)}`, jwk })
  assert.equal(result.ok, true)
})

test('replay guard, duplicate window and uid normalization', () => {
  const g = createReplayGuard()
  assert.equal(g.has('p', 1), false)
  g.add('p', 1)
  assert.equal(g.has('p', 1), true)
  assert.equal(isDuplicatePunch(1000, 15_000), true)
  assert.equal(isDuplicatePunch(1000, 25_000), false)
  assert.equal(isDuplicatePunch(null), false)
  assert.equal(normalizeUid('04:a2-1f 9c'), '04A21F9C')
})
