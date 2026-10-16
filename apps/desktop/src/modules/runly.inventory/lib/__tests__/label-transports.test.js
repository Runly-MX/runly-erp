import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createTransportRegistry, normalizeTransport, preparePrintPlan, resolvePrintPlan, runPrintPlan, transportOptions } from '../label-transports.js'

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
    assert.deepEqual([plan.transportId, plan.format, plan.label, plan.note], ['browser', 'pdf', 'Imprimir', null])
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
  it('reads legacy network printers as file (ZPL) or browser (PDF/PNG)', () => {
    assert.equal(normalizeTransport('network', 'zpl'), 'file')
    assert.equal(normalizeTransport('network', 'pdf'), 'browser')
    assert.equal(normalizeTransport('carrier-pigeon'), 'browser')
    assert.equal(registry.get('network'), null)
    const plan = resolvePrintPlan({ transport: 'network', format: 'zpl' }, registry)
    assert.deepEqual([plan.transportId, plan.label], ['file', 'Descargar .zpl'])
  })
  it('offers bluetooth only inside the Android app', () => {
    const ids = (env, current) => transportOptions(env, current).map((o) => o.value)
    assert.deepEqual(ids(null), ['browser', 'file'])
    assert.deepEqual(ids({ bluetooth: { available: true } }), ['browser', 'file', 'bluetooth'])
    const legacy = transportOptions(null, 'bluetooth').at(-1)
    assert.deepEqual([legacy.value, legacy.label], ['bluetooth', 'Bluetooth (solo en la app)'])
  })
  it('bluetooth prints in the app and downloads the .zpl elsewhere', async () => {
    const web = resolvePrintPlan({ transport: 'bluetooth', format: 'pdf' }, registry)
    assert.deepEqual([web.transportId, web.format, web.label], ['file', 'zpl', 'Descargar .zpl'])
    assert.match(web.note, /app Android/)
    assert.equal((await runPrintPlan(web, { blob: {} }, registry, fakeEnv())).mode, 'download')
    const app = resolvePrintPlan({ transport: 'bluetooth', format: 'pdf' }, registry, { bluetooth: { available: true } })
    assert.deepEqual([app.transportId, app.format, app.label, app.note], ['bluetooth', 'zpl', 'Imprimir', null])
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
