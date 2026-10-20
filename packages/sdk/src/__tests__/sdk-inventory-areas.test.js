import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

async function call(fn) {
  const fetchMock = mock.fn(async () => ({
    ok: true, status: 200, headers: { get: () => 'application/json' },
    json: async () => ({ data: [] }), text: async () => '{"data":[]}',
  }))
  const { createRunlyClient } = await import('../index.js')
  const client = createRunlyClient({ baseUrl: 'http://api' })
  globalThis.fetch = fetchMock
  await fn(client)
  const [url, opts] = fetchMock.mock.calls[0].arguments
  fetchMock.mock.restore()
  return { url, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : undefined }
}

describe('SDK - inventory areas', () => {
  it('lists and creates areas', async () => {
    assert.equal((await call((c) => c.inventory.listAreas('t'))).url, 'http://api/inventory/areas')
    const r = await call((c) => c.inventory.createArea({ name: 'Cocina', parentId: null }, 't'))
    assert.equal(r.method, 'POST')
    assert.deepEqual(r.body, { name: 'Cocina', parentId: null })
  })

  it('sets and removes a member', async () => {
    const put = await call((c) => c.inventory.setAreaMember('a1', 'u1', 'editor', 't'))
    assert.equal(put.url, 'http://api/inventory/areas/a1/members/u1')
    assert.deepEqual([put.method, put.body], ['PUT', { role: 'editor' }])
    assert.equal((await call((c) => c.inventory.removeAreaMember('a1', 'u1', 't'))).method, 'DELETE')
  })

  it('moves items to General with a null area and toggles the setting', async () => {
    const move = await call((c) => c.inventory.moveItems(['i1'], undefined, 't'))
    assert.deepEqual(move.body, { itemIds: ['i1'], areaId: null })
    const set = await call((c) => c.inventory.setAreasSettings(true, 't'))
    assert.deepEqual([set.url, set.method, set.body], ['http://api/inventory/areas-settings', 'PUT', { enabled: true }])
    const own = await call((c) => c.inventory.setAreasSettings({ includeOwn: false }, 't'))
    assert.deepEqual(own.body, { includeOwn: false })
  })

  it('manages supplier guests', async () => {
    assert.equal((await call((c) => c.inventory.listAreaGuests('a1', 't'))).url, 'http://api/inventory/areas/a1/guests')
    const inv = await call((c) => c.inventory.inviteAreaGuest('a1', { email: 'p@x.com', role: 'viewer' }, 't'))
    assert.equal(inv.method, 'POST')
    assert.deepEqual(inv.body, { email: 'p@x.com', role: 'viewer' })
    const del = await call((c) => c.inventory.removeAreaGuest('a1', 'g1', 't'))
    assert.equal(del.url, 'http://api/inventory/areas/a1/guests/g1')
    assert.equal(del.method, 'DELETE')
    const re = await call((c) => c.inventory.resendGuestInvite('g1', { requireCode: true }, 't'))
    assert.equal(re.url, 'http://api/inventory/guests/g1/resend')
    assert.deepEqual(re.body, { requireCode: true })
    assert.equal((await call((c) => c.inventory.revokeGuest('g1', 't'))).url, 'http://api/inventory/guests/g1/revoke')
  })
})
