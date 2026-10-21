import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createGuestTableTransport } from '../guest-table-transport.js'

const res = (status) => ({ status, ok: status < 400 })

describe('guest table transport', () => {
  it('signs as the guest and retries once with the renewed session after a 401', async () => {
    const seen = []
    const fetchImpl = async (url, init) => { seen.push(init.headers.Authorization); return res(init.headers.Authorization === 'Guest new' ? 200 : 401) }
    const transport = createGuestTableTransport({ sessionToken: 'old', onUnauthorized: async () => 'new', fetchImpl })
    assert.equal((await transport.fetch('/inventory/guest/items', { headers: { Authorization: 'Bearer x' } })).status, 200)
    assert.deepEqual(seen, ['Guest old', 'Guest new'])
  })
  it('reports the expiry when the session cannot be renewed', async () => {
    let expired = null
    const transport = createGuestTableTransport({ sessionToken: 'old', onUnauthorized: async () => null, onExpire: (e) => { expired = e }, fetchImpl: async () => res(401) })
    assert.equal((await transport.fetch('/inventory/guest/items')).status, 401)
    assert.equal(expired.code, 'SESSION_INVALID')
  })
  it('answers the user-only table preferences locally', async () => {
    const transport = createGuestTableTransport({ sessionToken: 'x', fetchImpl: async () => { throw new Error('no network') } })
    assert.deepEqual(await (await transport.fetch('http://api/profile/me/table-preferences/k')).json(), { data: null })
  })
})
