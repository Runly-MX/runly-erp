import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDwgConverter, DWG_MAX_BYTES } from '../canvas-dwg.js'
import { createCanvasRouter } from '../canvas-routes.js'

const dwg = Buffer.concat([Buffer.from('AC1032'), Buffer.alloc(64)])
const respond = (status, body = '') => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body })

describe('Canvas DWG converter proxy', () => {
  it('is unavailable until DWG_CONVERTER_URL is set', async () => {
    const converter = createDwgConverter({ env: {}, fetchImpl: respond(200) })
    assert.equal(converter.isConfigured(), false)
    await assert.rejects(() => converter.convert(dwg), (error) => error.status === 503)
  })
  it('rejects files that are not DWG or exceed the limit before calling the service', async () => {
    let called = false
    const converter = createDwgConverter({ env: { DWG_CONVERTER_URL: 'http://dwg:8091/' }, fetchImpl: async () => { called = true } })
    await assert.rejects(() => converter.convert(Buffer.from('0\nSECTION\n')), (error) => error.status === 422)
    await assert.rejects(() => converter.convert(Buffer.alloc(DWG_MAX_BYTES + 1, 'A')), (error) => error.status === 413)
    assert.equal(called, false)
  })
  it('posts the bytes and returns the DXF text', async () => {
    const calls = []
    const fetchImpl = async (url, init) => { calls.push({ url, method: init.method, size: init.body.length }); return respond(200, '0\nSECTION\n')() }
    const converter = createDwgConverter({ env: { DWG_CONVERTER_URL: 'http://dwg:8091/' }, fetchImpl })
    assert.equal(await converter.convert(dwg), '0\nSECTION\n')
    assert.deepEqual(calls, [{ url: 'http://dwg:8091/convert', method: 'POST', size: dwg.length }])
  })
  it('maps converter failures to client-safe statuses', async () => {
    const env = { DWG_CONVERTER_URL: 'http://dwg:8091' }
    await assert.rejects(() => createDwgConverter({ env, fetchImpl: respond(422) }).convert(dwg), (error) => error.status === 422)
    await assert.rejects(() => createDwgConverter({ env, fetchImpl: respond(504) }).convert(dwg), (error) => error.status === 502)
    await assert.rejects(() => createDwgConverter({ env, fetchImpl: async () => { throw new Error('ECONNREFUSED') } }).convert(dwg), (error) => error.status === 502)
  })
  it('exposes status (canvas.view) and convert (canvas.edit) routes', async () => {
    const permissions = []
    const requirePermission = (key) => { permissions.push(key); return async (c, next) => next() }
    const dwgConverter = createDwgConverter({ env: { DWG_CONVERTER_URL: 'http://dwg:8091' }, fetchImpl: respond(200, 'DXF') })
    const app = createCanvasRouter({ requirePermission, service: {}, dwgConverter })
    const status = await app.request('http://localhost/canvas/dwg/status')
    assert.deepEqual(await status.json(), { data: { enabled: true } })
    const ok = await app.request('http://localhost/canvas/dwg/convert', { method: 'POST', body: dwg })
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), 'DXF')
    const bad = await app.request('http://localhost/canvas/dwg/convert', { method: 'POST', body: Buffer.from('not a dwg file') })
    assert.equal(bad.status, 422)
    assert.ok(permissions.includes('canvas.view') && permissions.includes('canvas.edit'))
  })
})
