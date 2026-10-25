import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDnd, isInDnd, passesDnd, normalizeStatus, activeStatus } from '../dnd.js'

const at = (iso) => new Date(iso)

test('an explicit "until" holds notifications until it passes and is capped at 30 days', () => {
  const now = at('2026-11-04T12:00:00Z')
  assert.equal(isInDnd({ until: '2026-11-04T13:00:00Z' }, now), true)
  assert.equal(isInDnd({ until: '2026-11-04T11:00:00Z' }, now), false)
  assert.equal(normalizeDnd({ until: '2027-12-01T00:00:00Z' }, now).until, '2026-12-04T12:00:00.000Z')
})

test('quiet hours across midnight belong to the weekday they start on', () => {
  const quiet = { enabled: true, from: '22:00', to: '07:00', days: [1], timezone: 'UTC' } // Mondays 22:00 -> Tuesday 07:00
  assert.equal(isInDnd({ quiet }, at('2026-11-02T23:00:00Z')), true) // Monday 23:00
  assert.equal(isInDnd({ quiet }, at('2026-11-03T06:00:00Z')), true) // Tuesday 06:00
  assert.equal(isInDnd({ quiet }, at('2026-11-03T08:00:00Z')), false)
  assert.equal(isInDnd({ quiet }, at('2026-11-03T23:00:00Z')), false) // Tuesday night is not listed
  assert.equal(isInDnd({ quiet }, at('2026-11-02T12:00:00Z')), false)
})

test('same-day quiet hours and time zones', () => {
  const quiet = { enabled: true, from: '13:00', to: '15:00', timezone: 'America/Mexico_City' } // UTC-6
  assert.equal(isInDnd({ quiet }, at('2026-11-04T20:00:00Z')), true) // 14:00 local
  assert.equal(isInDnd({ quiet }, at('2026-11-04T14:00:00Z')), false) // 08:00 local
  assert.equal(isInDnd({ quiet: { ...quiet, enabled: false } }, at('2026-11-04T20:00:00Z')), false)
})

test('bad input becomes safe defaults', () => {
  const n = normalizeDnd({ quiet: { enabled: true, from: '25:00', to: 'x', days: [9, 'a', 2], timezone: 'Mars/Base' } })
  assert.deepEqual([n.quiet.from, n.quiet.to, n.quiet.days, n.quiet.timezone], ['22:00', '07:00', [2], 'UTC'])
  assert.equal(isInDnd(null), false)
})

test('only critical or listed events pass DND', () => {
  assert.equal(passesDnd({ priority: 'critical', eventType: 'x' }), true)
  assert.equal(passesDnd({ priority: 'high', eventType: 'chat.call.incoming' }), false)
  assert.equal(passesDnd({ priority: 'medium', eventType: 'security.alert' }), true)
})

test('status: one emoji, trimmed text, future expiry; empty or expired is none', () => {
  const now = at('2026-11-04T12:00:00Z')
  assert.deepEqual(normalizeStatus({ emoji: '🍽️ extra', text: '  Comiendo  ', expiresAt: '2026-11-04T13:00:00Z' }, now), { emoji: '🍽️', text: 'Comiendo', expiresAt: '2026-11-04T13:00:00.000Z' })
  assert.equal(normalizeStatus({ emoji: '', text: '  ' }, now), null)
  assert.equal(normalizeStatus({ text: 'x', expiresAt: '2026-11-04T11:00:00Z' }, now), null)
  assert.equal(activeStatus({ text: 'x', expiresAt: '2026-11-04T11:00:00Z' }, now), null)
  assert.equal(activeStatus({ text: 'x', expiresAt: null }, now).text, 'x')
})
