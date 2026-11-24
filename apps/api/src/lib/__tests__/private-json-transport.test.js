import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { privateJsonTransport } from '../private-json-transport.js'

const big = (user) => ({ user, rows: Array.from({ length: 400 }, (_, i) => ({ id: i, name: `module-${i}` })) })
const app = new Hono()
app.use('/x', ...privateJsonTransport())
app.get('/x', (c) => c.json(big(c.req.header('x-user') ?? 'a')))
app.get('/y', (c) => c.json(big('a')))

const get = (path, headers = {}) => app.request(path, { headers: { 'accept-encoding': 'gzip', ...headers } })

test('large per-user JSON is gzipped, private and revalidated; other routes are untouched', async () => {
  const res = await get('/x')
  assert.equal(res.headers.get('content-encoding'), 'gzip')
  assert.equal(res.headers.get('cache-control'), 'private, no-cache')
  assert.match(res.headers.get('vary'), /Authorization/i)
  assert.match(res.headers.get('etag'), /^W\//)
  const other = await get('/y')
  assert.equal(other.headers.get('content-encoding'), null)
  assert.equal(other.headers.get('etag'), null)
})

test('a 304 happens only for a byte-identical body: another user never matches', async () => {
  const first = await get('/x', { 'x-user': 'a' })
  const tag = first.headers.get('etag')
  assert.equal((await get('/x', { 'x-user': 'a', 'if-none-match': tag })).status, 304)
  const other = await get('/x', { 'x-user': 'b', 'if-none-match': tag })
  assert.equal(other.status, 200)
  assert.notEqual(other.headers.get('etag'), tag)
})
