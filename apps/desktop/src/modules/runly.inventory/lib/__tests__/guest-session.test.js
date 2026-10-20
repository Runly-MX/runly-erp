import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPortalUrl, createSessionStore, guestErrorMessage, guestSessionKey, guestStatusLabel, isSessionExpired, msUntilRefresh, tokenFromLink,
} from '../guest-session.js'

const memoryStorage = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}

describe('guest portal session helpers', () => {
  it('builds and parses the portal URL', () => {
    const url = buildPortalUrl('https://app.example.com/', 'abc_123')
    assert.equal(url, 'https://app.example.com/app/p/inventory/abc_123')
    assert.equal(tokenFromLink(url + '?x=1'), 'abc_123')
    assert.equal(tokenFromLink('nope'), null)
  })

  it('detects expiry and schedules the refresh ahead of it', () => {
    const now = Date.parse('2026-10-20T10:00:00Z')
    assert.equal(isSessionExpired({ sessionToken: 's', expiresAt: '2026-10-20T09:00:00Z' }, now), true)
    assert.equal(isSessionExpired({ sessionToken: 's', expiresAt: '2026-10-20T11:00:00Z' }, now), false)
    assert.equal(isSessionExpired({ expiresAt: '2026-10-20T11:00:00Z' }, now), true)
    assert.equal(msUntilRefresh({ expiresAt: '2026-10-20T11:00:00Z' }, now), 55 * 60 * 1000)
    assert.equal(msUntilRefresh({ expiresAt: '2026-10-20T10:01:00Z' }, now), 30 * 1000)
  })

  it('stores per token, survives blocked storage and clears', () => {
    const store = memoryStorage()
    const s = createSessionStore(store)
    s.write('t1', { sessionToken: 'a', expiresAt: 'x' })
    assert.equal(s.read('t1').sessionToken, 'a')
    assert.equal(s.read('t2'), null)
    assert.ok(store.getItem(guestSessionKey('t1')))
    s.clear('t1')
    assert.equal(s.read('t1'), null)

    const blocked = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
    const fallback = createSessionStore(blocked)
    fallback.write('t', { sessionToken: 'm' })
    assert.equal(fallback.read('t').sessionToken, 'm')
  })

  it('maps statuses and errors to Spanish', () => {
    assert.equal(guestStatusLabel('pending'), 'Pendiente')
    assert.equal(guestStatusLabel('revoked'), 'Revocado')
    assert.match(guestErrorMessage({ code: 'SESSION_INVALID' }), /enlace de tu correo/)
    assert.equal(guestErrorMessage({ message: 'boom' }), 'boom')
  })
})
