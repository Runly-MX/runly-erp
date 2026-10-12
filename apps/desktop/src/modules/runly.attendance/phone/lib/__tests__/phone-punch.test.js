import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { generatePhoneKey } from '../phone-key.js'
import { isChallenge, signChallenge, phonePunchErrorMessage, OFFLINE_MESSAGE, currentPosition } from '../phone-punch.js'

test('signChallenge signs `${personId}|${challenge}` verifiable with node crypto (p1363)', async () => {
  const { privateKey, publicJwk } = await generatePhoneKey()
  const personId = '0194b3a0-1111-7222-8333-444455556666'
  const challenge = 'RK1.0194b3a0-aaaa-7bbb-8ccc-ddddeeeeffff.1760000000.abcDEF_-123'
  const sig = await signChallenge(personId, challenge, privateKey)
  assert.match(sig, /^[A-Za-z0-9_-]{86}$/)
  const ok = crypto.verify('sha256', Buffer.from(`${personId}|${challenge}`), { key: crypto.createPublicKey({ key: publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
  assert.equal(ok, true)
})

test('isChallenge only accepts RK1 payloads', () => {
  assert.equal(isChallenge('RK1.abc.1760000000.mac_-1'), true)
  assert.equal(isChallenge('RA1.abc.1760000000.mac'), false)
  assert.equal(isChallenge('https://example.com'), false)
  assert.equal(isChallenge(null), false)
})

test('error codes map to friendly Spanish messages', () => {
  assert.match(phonePunchErrorMessage({ code: 'BAD_CHALLENGE', status: 400 }), /ya no es válido/)
  assert.match(phonePunchErrorMessage({ code: 'REPLAY', status: 409 }), /ya se usó/)
  assert.match(phonePunchErrorMessage({ code: 'UNKNOWN_PERSON' }), /ya no está autorizado/)
  assert.match(phonePunchErrorMessage({ code: 'BAD_SIGNATURE' }), /ya no está autorizado/)
  assert.equal(phonePunchErrorMessage({ code: 'NETWORK', status: 0 }), OFFLINE_MESSAGE)
  assert.match(phonePunchErrorMessage({ status: 429 }), /Demasiados intentos/)
  assert.match(phonePunchErrorMessage({}), /No se pudo registrar/)
})

test('currentPosition resolves null on timeout, denial or missing API', async () => {
  assert.equal(await currentPosition(20, undefined), null)
  assert.equal(await currentPosition(20, { getCurrentPosition: () => {} }), null)
  assert.equal(await currentPosition(20, { getCurrentPosition: (_ok, fail) => fail(new Error('denied')) }), null)
  assert.deepEqual(await currentPosition(20, { getCurrentPosition: (ok) => ok({ coords: { latitude: 1, longitude: 2 } }) }), { latitude: 1, longitude: 2 })
})
