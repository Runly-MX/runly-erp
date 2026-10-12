import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { generatePhoneKey, buildPhonePayload } from '../phone-key.js'
import { verifyPhonePayload } from '../../../kiosk/lib/punch-logic.js'

test('phone key: private key is non-extractable and its payload verifies in the kiosk and against node crypto', async () => {
  const { privateKey, publicJwk } = await generatePhoneKey()
  assert.equal(privateKey.extractable, false)
  assert.deepEqual(Object.keys(publicJwk).sort(), ['crv', 'kty', 'x', 'y'])
  const personId = '0194b3a0-1111-7222-8333-444455556666'
  const now = Date.now()
  const { payload, ts } = await buildPhonePayload(personId, privateKey, now)
  assert.match(payload, /^RA1\.[0-9a-f-]{36}\.\d{10}\.[A-Za-z0-9_-]{86}$/)
  assert.equal((await verifyPhonePayload({ payload, jwk: publicJwk, now })).ok, true)
  assert.equal((await verifyPhonePayload({ payload, jwk: publicJwk, now: now + 60_000 })).reason, 'expired')
  // Same check the server performs (node crypto, ieee-p1363).
  const sig = Buffer.from(payload.split('.')[3], 'base64url')
  const ok = crypto.verify('sha256', Buffer.from(`${personId}.${ts}`), { key: crypto.createPublicKey({ key: publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, sig)
  assert.equal(ok, true)
})
