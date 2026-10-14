import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

function makeFetch() {
  return mock.fn(async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ url }),
    text: async () => JSON.stringify({ url }),
  }))
}

async function call(fn) {
  const fetchMock = makeFetch()
  const { createRunlyClient } = await import('../index.js')
  const client = createRunlyClient({ baseUrl: 'http://api' })
  globalThis.fetch = fetchMock
  await fn(client)
  const [url, opts] = fetchMock.mock.calls[0].arguments
  fetchMock.mock.restore()
  return { url, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : undefined }
}

describe('SDK — custody revision 2 and saved signature', () => {
  it('lists deliverers', async () => {
    const r = await call((c) => c.inventory.custodies.deliverers('tok'))
    assert.equal(r.url, 'http://api/inventory/custodies/deliverers')
  })

  it('applies the saved deliverer signature', async () => {
    const r = await call((c) => c.inventory.custodies.sign('c-1', { role: 'deliverer', useSaved: true }, 'tok'))
    assert.equal(r.url, 'http://api/inventory/custodies/c-1/signatures')
    assert.deepEqual(r.body, { role: 'deliverer', useSaved: true })
  })

  it('requests the public link with e-mail', async () => {
    const r = await call((c) => c.inventory.custodies.publicLink('c-1', { sendEmail: true }, 'tok'))
    assert.equal(r.method, 'POST')
    assert.deepEqual(r.body, { sendEmail: true })
  })

  it('saves, patches and deletes the profile signature', async () => {
    const put = await call((c) => c.profile.saveSignature({ pngBase64: 'AAAA', allowDelegation: true }, 'tok'))
    assert.equal(put.url, 'http://api/profile/me/signature')
    assert.equal(put.method, 'PUT')
    assert.deepEqual(put.body, { pngBase64: 'AAAA', allowDelegation: true })
    const patch = await call((c) => c.profile.updateSignature({ allowDelegation: false }, 'tok'))
    assert.equal(patch.method, 'PATCH')
    assert.deepEqual(patch.body, { allowDelegation: false })
    const del = await call((c) => c.profile.deleteSignature('tok'))
    assert.equal(del.method, 'DELETE')
  })
})
