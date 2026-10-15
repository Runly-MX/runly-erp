import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { generatePhoneKey } from '../phone-key.js'
import {
  signSelf, selfServiceErrorMessage, formatMinutes, formatDayLabel, formatSchedule, hoursPreview, buildOccurredAt, OFFLINE_MESSAGE,
  buildDayOptions, buildMinuteOptions, defaultTimeParts, isRevokedError,
} from '../self-service.js'

const verify = (publicJwk, message, sig) => crypto.verify('sha256', Buffer.from(message), { key: crypto.createPublicKey({ key: publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))

test('signSelf signs `<action>|<personId>|<ts>|extra...` (p1363)', async () => {
  const { privateKey, publicJwk } = await generatePhoneKey()
  const pid = '0194b3a0-1111-7222-8333-444455556666'
  const me = await signSelf('me', pid, 1760000000, [], privateKey)
  assert.match(me, /^[A-Za-z0-9_-]{86}$/)
  assert.equal(verify(publicJwk, `me|${pid}|1760000000`, me), true)
  const iso = '2026-10-10T14:30:00.000Z'
  const corr = await signSelf('corr', pid, 1760000000, ['in', iso], privateKey)
  assert.equal(verify(publicJwk, `corr|${pid}|1760000000|in|${iso}`, corr), true)
  assert.equal(verify(publicJwk, `corr|${pid}|1760000000|out|${iso}`, corr), false)
})

test('error mapping', () => {
  assert.match(selfServiceErrorMessage({ code: 'BAD_SIGNATURE' }), /ya no está autorizado/)
  assert.match(selfServiceErrorMessage({ code: 'CORRECTIONS_OFF' }), /no permite/)
  assert.equal(selfServiceErrorMessage({ code: 'NETWORK', status: 0 }), OFFLINE_MESSAGE)
  assert.match(selfServiceErrorMessage({ status: 429 }), /Demasiados/)
})

test('formatting helpers', () => {
  assert.equal(formatMinutes(1930), '32:10')
  assert.equal(formatMinutes(5), '0:05')
  assert.equal(formatMinutes(null), '0:00')
  assert.equal(formatDayLabel('2026-10-12'), 'Lun 12 oct')
  const day = { start: '08:00', end: '18:00' }
  assert.equal(
    formatSchedule({ dayHours: { 1: day, 2: day, 3: day, 4: day, 5: { start: '08:00', end: '14:00' } } }),
    'Lun-Jue 08:00-18:00 · Vie 08:00-14:00',
  )
  assert.equal(formatSchedule({ startTime: '09:00', endTime: '17:00', days: [1, 2, 3] }), 'Lun, Mar, Mié 09:00-17:00')
  assert.equal(hoursPreview({ week: { totals: { workedMinutes: 1930, overtimeMinutes: 120 } } }), 'Esta semana 32:10 h · 2:00 extra')
})

test('buildOccurredAt validates future and 14-day window', () => {
  const now = new Date(2026, 9, 12, 12, 0, 0)
  assert.ok(buildOccurredAt('2026-10-12', '08:00', now).iso)
  assert.match(buildOccurredAt('2026-10-12', '13:00', now).error, /futura/)
  assert.match(buildOccurredAt('2026-09-20', '08:00', now).error, /14 días/)
  assert.match(buildOccurredAt('', '', now).error, /fecha/)
})

test('buildDayOptions lists today, yesterday and 14 days back with local values', () => {
  const options = buildDayOptions(new Date(2026, 9, 12, 12, 0, 0))
  assert.equal(options.length, 15)
  assert.deepEqual(options[0], { value: '2026-10-12', label: 'Hoy' })
  assert.deepEqual(options[1], { value: '2026-10-11', label: 'Ayer' })
  assert.deepEqual(options[2], { value: '2026-10-10', label: 'Sáb 10 oct' })
  assert.equal(options[14].value, '2026-09-28')
})

test('time helpers round to 5 and keep an exact minute selectable', () => {
  assert.deepEqual(defaultTimeParts(new Date(2026, 9, 12, 9, 7)), { hour: '09', minute: '05' })
  assert.deepEqual(defaultTimeParts(new Date(2026, 9, 12, 9, 7), true), { hour: '09', minute: '07' })
  assert.equal(buildMinuteOptions().length, 12)
  assert.deepEqual(buildMinuteOptions('07').slice(0, 3), ['00', '05', '07'])
})

test('isRevokedError detects revoked or replaced phones', () => {
  assert.equal(isRevokedError({ status: 403, code: 'BAD_SIGNATURE' }), true)
  assert.equal(isRevokedError({ status: 404, code: 'UNKNOWN_PERSON' }), true)
  assert.equal(isRevokedError({ status: 0, code: 'NETWORK' }), false)
  assert.equal(isRevokedError({ status: 429 }), false)
  assert.equal(isRevokedError(null), false)
})

test('groupRequests separates pending from answered and flags unseen answers', async () => {
  const { groupRequests } = await import('../self-service.js')
  const list = [
    { id: 'a', status: 'pending', requestedAt: '2026-10-14T10:00:00Z' },
    { id: 'b', status: 'approved', requestedAt: '2026-10-10T10:00:00Z', resolvedAt: '2026-10-11T10:00:00Z' },
    { id: 'c', status: 'rejected', requestedAt: '2026-10-12T10:00:00Z', resolvedAt: '2026-10-13T10:00:00Z' },
  ]
  const grouped = groupRequests(list, ['b'])
  assert.deepEqual(grouped.pending.map((r) => r.id), ['a'])
  assert.deepEqual(grouped.resolved.map((r) => r.id), ['c', 'b'])
  assert.deepEqual(grouped.unseen.map((r) => r.id), ['c'])
  assert.deepEqual(groupRequests(undefined).pending, [])
})
