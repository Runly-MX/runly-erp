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
  it('keeps bluetooth and network disabled until a transport is registered', async () => {
    const plan = resolvePrintPlan({ transport: 'bluetooth', format: 'zpl' }, registry)
    assert.equal(plan.available, false)
    assert.match(plan.reason, /Disponible en la app/)
    assert.equal((await runPrintPlan(plan, { blob: {} }, registry, fakeEnv())).ok, false)
    const local = createTransportRegistry()
    local.register('bluetooth', { formats: ['zpl'], isAvailable: () => true, actionLabel: () => 'Imprimir', send: async () => ({ ok: true, mode: 'bluetooth' }) })
    const ready = resolvePrintPlan({ transport: 'bluetooth', format: 'pdf' }, local)
    assert.deepEqual([ready.available, ready.format], [true, 'zpl'])
    assert.equal((await runPrintPlan(ready, { blob: {} }, local, fakeEnv())).mode, 'bluetooth')
  })
})
