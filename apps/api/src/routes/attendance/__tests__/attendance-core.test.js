import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  hashPin, verifyPin, normalizeUid, verifyPhonePayload, phonePayloadMessage, resolvePunchTime,
  buildSessions, presentAt, nextDirection, computeCompliance, parsePhonePayload,
} from '../attendance-core.js'

const t = (iso) => new Date(iso)

test('pin hash verifies only the right pin', () => {
  const stored = hashPin('4821')
  assert.equal(verifyPin('4821', stored), true)
  assert.equal(verifyPin('4822', stored), false)
  assert.equal(verifyPin('4821', null), false)
})

test('card uid is normalized', () => {
  assert.equal(normalizeUid('04:a2-1f 9C'), '04A21F9C')
})

test('phone payload: valid, expired and tampered', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const personId = '0194b3a0-1111-7222-8333-444455556666'
  const now = Date.now()
  const ts = Math.floor(now / 1000)
  const sig = crypto.sign('sha256', Buffer.from(phonePayloadMessage(personId, ts)), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  const payload = `RA1.${personId}.${ts}.${sig}`
  assert.equal(verifyPhonePayload({ payload, jwk, now }).ok, true)
  assert.equal(verifyPhonePayload({ payload, jwk, now: now + 120_000 }).reason, 'expired')
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
  assert.equal(verifyPhonePayload({ payload, jwk: other, now }).reason, 'bad_signature')
  assert.equal(parsePhonePayload('nope'), null)
})

test('skewed device clock is corrected and flagged; small drift is not', () => {
  const serverNow = t('2026-10-11T12:00:00Z')
  const small = resolvePunchTime({ deviceTime: '2026-10-11T11:59:00Z', offsetMs: 30_000, serverNow })
  assert.deepEqual(small.flags, [])
  const big = resolvePunchTime({ deviceTime: '2026-10-11T10:00:00Z', offsetMs: 3_600_000, serverNow })
  assert.deepEqual(big.flags, ['clock_skew'])
  assert.equal(big.occurredAt.toISOString(), '2026-10-11T11:00:00.000Z')
})

test('sessions pair in/out, keep open ones and ignore voided', () => {
  const punches = [
    { personId: 'a', direction: 'in', occurredAt: '2026-10-11T08:00:00Z' },
    { personId: 'a', direction: 'out', occurredAt: '2026-10-11T12:30:00Z' },
    { personId: 'a', direction: 'in', occurredAt: '2026-10-11T13:00:00Z' },
    { personId: 'b', direction: 'in', occurredAt: '2026-10-11T09:00:00Z', status: 'voided' },
  ]
  const sessions = buildSessions(punches)
  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].minutes, 270)
  assert.equal(sessions[1].open, true)
})

test('direction toggles from the last punch and respects fixed modes', () => {
  const now = t('2026-10-11T12:00:00Z')
  assert.equal(nextDirection(null, 'both', now), 'in')
  assert.equal(nextDirection({ direction: 'in', occurredAt: '2026-10-11T08:00:00Z' }, 'both', now), 'out')
  assert.equal(nextDirection({ direction: 'in', occurredAt: '2026-10-09T08:00:00Z' }, 'both', now), 'in')
  assert.equal(nextDirection({ direction: 'in', occurredAt: '2026-10-11T08:00:00Z' }, 'in', now), 'in')
})

test('compliance counts people inside per group/category', () => {
  const people = [
    { id: 'p1', groupId: 'g1', categoryId: 'c1' }, { id: 'p2', groupId: 'g1', categoryId: 'c1' },
    { id: 'p3', groupId: 'g1', categoryId: 'c2' }, { id: 'p4', groupId: 'g2', categoryId: 'c1' },
  ]
  const punches = [
    { personId: 'p1', direction: 'in', occurredAt: '2026-10-12T08:00:00Z' },
    { personId: 'p2', direction: 'in', occurredAt: '2026-10-12T08:05:00Z' },
    { personId: 'p2', direction: 'out', occurredAt: '2026-10-12T09:00:00Z' },
    { personId: 'p4', direction: 'in', occurredAt: '2026-10-12T08:10:00Z' },
  ]
  const quotas = [{ id: 'q1', groupId: 'g1', categoryId: 'c1', minCount: 2, days: [1] }]
  const at = t('2026-10-12T10:00:00Z') // Monday
  const [row] = computeCompliance({ quotas, people, punches, at, from: '2026-10-12T00:00:00Z', to: '2026-10-12T23:59:59Z' })
  assert.equal(row.present, 1)
  assert.equal(row.attended, 2)
  assert.equal(row.missing, 1)
  assert.equal(row.ok, false)
  assert.equal(presentAt(punches, at).length, 2)
})
