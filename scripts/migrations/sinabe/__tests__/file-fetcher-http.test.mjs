import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { createFileFetcher } from '../file-fetcher.mjs'

const body = Buffer.from('contenido de prueba')
let flaky = 0
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url)
  if (path === '/api/uploads/a/ficha%201.pdf' || path === '/api/uploads/a/ficha 1.pdf') { res.end(body); return }
  if (path === '/api/uploads/flaky.bin') { if (flaky++ === 0) { res.statusCode = 502; res.end(); return } res.end(body); return }
  if (path === '/api/uploads/broken.bin') { res.statusCode = 500; res.end(); return }
  res.statusCode = 404; res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}/api/uploads/`
test.after(() => server.close())

test('http: downloads with sha256, encodes the key and tolerates a trailing slash', async () => {
  const f = createFileFetcher({ mode: 'http', baseUrl })
  const out = await f.fetch('a/ficha 1.pdf')
  assert.equal(out.sha256, createHash('sha256').update(body).digest('hex'))
  assert.equal(out.size, body.length)
})

test('http: 404 is FILE_NOT_FOUND without retry; 5xx retries once', async () => {
  const f = createFileFetcher({ mode: 'http', baseUrl, pauseMs: 0 })
  await assert.rejects(f.fetch('missing.bin'), { code: 'FILE_NOT_FOUND' })
  assert.equal((await f.fetch('flaky.bin')).size, body.length)
  await assert.rejects(f.fetch('broken.bin'), { code: 'FILE_HTTP_ERROR' })
})

test('http: refuses to leak the key in error messages', async () => {
  const f = createFileFetcher({ mode: 'http', baseUrl })
  await assert.rejects(f.fetch('secret-name.bin'), (e) => !e.message.includes('secret-name'))
})
