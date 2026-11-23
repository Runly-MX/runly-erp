import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmCheckout, fetchMyOrders, formatOrderTotal, orderStatusLabel, sessionIdFromLocation } from './ordersPublicClient.js'

function withSite(fetchImpl, run) {
  const saved = { window: globalThis.window, fetch: globalThis.fetch }
  globalThis.window = { RUNLY_CONFIG: { apiUrl: 'https://shop.example.test', siteId: 'site-1' }, ATLAS_CONFIG: { apiUrl: 'https://shop.example.test', siteId: 'site-1' } }
  globalThis.fetch = fetchImpl
  return Promise.resolve(run()).finally(() => { globalThis.window = saved.window; globalThis.fetch = saved.fetch })
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

test('only well-formed Stripe session ids are taken from the thanks URL', () => {
  assert.equal(sessionIdFromLocation('?session_id=cs_test_a1B2c3D4e5F6'), 'cs_test_a1B2c3D4e5F6')
  for (const bad of ['', '?session_id=', '?session_id=../../etc', '?session_id=cs_x', '?other=cs_test_a1B2c3D4e5F6', '?session_id=cs_test_<script>']) assert.equal(sessionIdFromLocation(bad), null, bad)
})

test('confirmCheckout and fetchMyOrders call the site endpoints with the site header and cookie credentials', async () => {
  const calls = []
  await withSite(async (url, init) => { calls.push({ url, init }); return json(200, { data: { number: 7, status: 'paid' } }) }, async () => {
    assert.deepEqual(await confirmCheckout('cs_test_a1B2c3D4e5F6'), { number: 7, status: 'paid' })
    await fetchMyOrders()
  })
  assert.equal(calls[0].url, 'https://shop.example.test/public/website/checkout/confirm?session_id=cs_test_a1B2c3D4e5F6')
  assert.equal(calls[1].url, 'https://shop.example.test/public/website/orders/mine')
  for (const { init } of calls) assert.deepEqual([init.credentials, init.headers['X-Site-Id']], ['same-origin', 'site-1'])
})

test('errors keep status and code; a page without site config fails before any request', async () => {
  await withSite(async () => json(401, { error: 'Inicia sesión', code: 'UNAUTHENTICATED' }), async () => {
    await assert.rejects(fetchMyOrders(), { status: 401, code: 'UNAUTHENTICATED' })
  })
  const saved = globalThis.window
  globalThis.window = {}
  try { await assert.rejects(fetchMyOrders(), { code: 'CONFIG_MISSING' }) } finally { globalThis.window = saved }
})

test('labels and money formatting never throw', () => {
  assert.equal(orderStatusLabel('paid'), 'Pagado')
  assert.equal(orderStatusLabel('weird'), 'En proceso')
  assert.match(formatOrderTotal(240, 'mxn'), /240/)
  assert.doesNotThrow(() => formatOrderTotal(1, 'not-a-currency'))
  assert.match(formatOrderTotal(1, 'xx'), /1/)
})
