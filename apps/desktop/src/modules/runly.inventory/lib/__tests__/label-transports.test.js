import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createTransportRegistry, preparePrintPlan, resolvePrintPlan, runPrintPlan } from '../label-transports.js'

function fakeEnv({ popupBlocked = false } = {}) {
  const calls = []
  return {
    calls,
    objectUrl: () => 'blob:1',
    revokeLater: () => {},
    openUrl: (url) => { calls.push(['open', url]); return !popupBlocked },
    openBlank: () => (popupBlocked ? null : { id: 'tab' }),
    navigate: (handle, url) => calls.push(['navigate', url]),
    download: (blob, filename) => calls.push(['download', filename]),
  }
}

describe('label transports', () => {
  const registry = createTransportRegistry()

  it('defaults to browser PDF printing without a printer', () => {
    const plan = resolvePrintPlan(null, registry)
    assert.deepEqual([plan.transportId, plan.format, plan.available, plan.label], ['browser', 'pdf', true, 'Imprimir'])
  })
  it('downloads ZPL for browser printers and opens PDFs', async () => {
    const zpl = resolvePrintPlan({ transport: 'browser', format: 'zpl' }, registry)
    assert.equal(zpl.label, 'Descargar .zpl')
    const env = fakeEnv()
    assert.deepEqual(await runPrintPlan(zpl, { blob: {} }, registry, env), { ok: true, mode: 'download' })
    assert.match(env.calls[0][1], /\.zpl$/)
    const pdf = await runPrintPlan(resolvePrintPlan({ transport: 'browser', format: 'pdf' }, registry), { blob: {} }, registry, env)
    assert.equal(pdf.mode, 'open')
  })
  it('opens the tab on click and fills it after rendering', async () => {
    const env = fakeEnv()
    const plan = resolvePrintPlan(null, registry)
    const handle = preparePrintPlan(plan, registry, env)
    assert.deepEqual(handle, { id: 'tab' })
    assert.equal((await runPrintPlan(plan, { blob: {}, handle }, registry, env)).mode, 'open')
    assert.deepEqual(env.calls, [['navigate', 'blob:1']])
    assert.equal(preparePrintPlan(resolvePrintPlan({ transport: 'browser', format: 'zpl' }, registry), registry, env), null)
  })
  it('falls back to a download when the popup is blocked', async () => {
    const env = fakeEnv({ popupBlocked: true })
    const out = await runPrintPlan(resolvePrintPlan(null, registry), { blob: {} }, registry, env)
    assert.equal(out.mode, 'download')
  })
  it('downloads for network printers (the server cannot reach the LAN)', async () => {
    const plan = resolvePrintPlan({ transport: 'network', format: 'zpl' }, registry)
    assert.deepEqual([plan.available, plan.label], [true, 'Descargar .zpl'])
    assert.equal(resolvePrintPlan({ transport: 'network', format: 'png' }, registry).format, 'zpl')
    assert.equal((await runPrintPlan(plan, { blob: {} }, registry, fakeEnv())).mode, 'download')
  })
  it('enables bluetooth only inside the Android app and always sends ZPL', () => {
    const web = resolvePrintPlan({ transport: 'bluetooth', format: 'pdf' }, registry)
    assert.deepEqual([web.available, web.format], [false, 'zpl'])
    assert.match(web.reason, /app Android/)
    const app = resolvePrintPlan({ transport: 'bluetooth', format: 'pdf' }, registry, { bluetooth: { available: true } })
    assert.deepEqual([app.available, app.format, app.label], [true, 'zpl', 'Imprimir'])
  })
  it('sends the rendered bytes to the paired address and maps failures', async () => {
    const sent = []
    let result = { ok: true }
    const bluetooth = { available: true, print: async (address, bytes) => { sent.push([address, [...bytes]]); return result } }
    const env = { ...fakeEnv(), bluetooth }
    const blob = { arrayBuffer: async () => new Uint8Array([94, 88, 65]).buffer }
    const printer = { transport: 'bluetooth', address: 'aa:bb:cc:dd:ee:ff' }
    const plan = resolvePrintPlan(printer, registry, env)
    assert.deepEqual(await runPrintPlan(plan, { blob, printer }, registry, env), { ok: true, mode: 'bluetooth' })
    assert.deepEqual(sent[0], ['AA:BB:CC:DD:EE:FF', [94, 88, 65]])
    result = { ok: false, code: 'not_paired' }
    const failed = await runPrintPlan(plan, { blob, printer }, registry, env)
    assert.deepEqual([failed.ok, failed.code], [false, 'not_paired'])
    assert.match(failed.message, /emparejada/)
    const bad = await runPrintPlan(plan, { blob, printer: { ...printer, address: 'x' } }, registry, env)
    assert.equal(bad.code, 'invalid_address')
    assert.equal(sent.length, 2)
  })
})
