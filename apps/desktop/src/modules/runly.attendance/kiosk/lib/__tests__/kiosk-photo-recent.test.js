import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { buildKioskChallenge, kioskChallengeMac } from '../kiosk-challenge.js'
import { createRecentFeed } from '../recent-feed.js'
import { photoRequired, isHeldForPhoto, splitForSync, selfieStatus } from '../photo-policy.js'

const nodeMac = (secret, kioskId, ts) => crypto.createHmac('sha256', String(secret)).update(`${kioskId}.${ts}`).digest('base64url').slice(0, 22)

test('challenge mac matches the server kioskChallengeMac', async () => {
  const id = '0199f0a2-1111-7222-8333-444455556666'
  for (const secret of ['s3cret', 'ñandú-ключ-🔑']) {
    assert.equal(await kioskChallengeMac(secret, id, 1_760_000_000), nodeMac(secret, id, 1_760_000_000))
  }
  const c = await buildKioskChallenge({ secret: 'abc', kioskId: id, now: 1_760_000_000_999 })
  assert.equal(c.text, `RK1.${id}.1760000000.${nodeMac('abc', id, 1_760_000_000)}`)
  assert.equal(await buildKioskChallenge({ secret: null, kioskId: id }), null)
})

test('recent feed de-duplicates and advances the cursor', () => {
  const feed = createRecentFeed({ now: Date.parse('2026-10-12T10:00:10Z') })
  assert.equal(feed.since(), '2026-10-12T10:00:05.000Z')
  const a = { id: 'a', receivedAt: '2026-10-12T10:00:12.000Z' }
  const b = { id: 'b', receivedAt: '2026-10-12T10:00:11.000Z' }
  assert.deepEqual(feed.ingest([a, b]).map((i) => i.id), ['b', 'a'])
  assert.equal(feed.since(), '2026-10-12T10:00:12.000Z')
  assert.deepEqual(feed.ingest([a, { id: 'c', receivedAt: '2026-10-12T10:00:12.000Z' }]).map((i) => i.id), ['c'])
  assert.deepEqual(feed.ingest(null), [])
})

test('photo policy', () => {
  assert.equal(photoRequired({ method: 'pin', kiosk: {}, settings: { requirePhotoForQr: true } }), false)
  assert.equal(photoRequired({ method: 'pin', kiosk: { requireSelfie: true }, settings: {} }), true)
  assert.equal(photoRequired({ method: 'phone_qr', kiosk: {}, settings: { requirePhotoForQr: true } }), true)
  assert.equal(photoRequired({ method: 'card', kiosk: {}, settings: { requirePhotoForQr: false } }), false)
  assert.equal(photoRequired({ method: 'card', kiosk: {}, settings: {} }), true)
})

test('pending selfie is held for ~8 s then sent as unavailable', () => {
  const now = Date.parse('2026-10-12T10:00:10Z')
  const fresh = { id: '1', selfie: 'pending', deviceTime: '2026-10-12T10:00:06Z' }
  const old = { id: '2', selfie: 'pending', deviceTime: '2026-10-12T10:00:00Z' }
  const done = { id: '3', selfie: 'captured', deviceTime: '2026-10-12T10:00:09Z' }
  assert.equal(isHeldForPhoto(fresh, now), true)
  assert.equal(isHeldForPhoto(old, now), false)
  const { ready, held } = splitForSync([fresh, old, done], now)
  assert.deepEqual(held.map((p) => p.id), ['1'])
  assert.deepEqual(ready.map((p) => p.id), ['2', '3'])
  assert.deepEqual([fresh, old, done, { id: '4' }].map(selfieStatus), ['unavailable', 'unavailable', 'captured', 'none'])
})
