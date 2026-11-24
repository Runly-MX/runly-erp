#!/usr/bin/env node
// F1B Stage 2: isolated frontend components in a real browser (Playwright
// Chromium). Two origins on loopback: a Runly-like host (with a fake session
// in localStorage and a cookie) and a frame origin serving sandboxed
// component documents. The host bridge forwards granted calls to a real
// gateway (in-memory store, two companies). Probes are inert.
//   node scripts/security/verify-isolated-frontend.mjs
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHostSigner } from '../../apps/api/src/secure-runtime/protocol.js'
import { createCapabilityGateway } from '../../apps/api/src/secure-runtime/gateway/gateway.js'
import { createMemoryStore } from '../../apps/api/src/secure-runtime/gateway/stores.js'
import { loadDeclarativeModule } from '../../apps/api/src/secure-runtime/declarative/schema.js'
import { renderIsolatedFrame } from '../../apps/api/src/secure-runtime/frontend/frame-document.js'
import { checks } from './lib/disposable-stack.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright')
const def = loadDeclarativeModule(JSON.parse(readFileSync(path.join(ROOT, 'apps/api/src/secure-runtime/fixtures/solicitudes/module.json'), 'utf8')))
const A = randomUUID(), B = randomUUID(), userA = randomUUID(), userB = randomUUID()
const gateway = createCapabilityGateway({ signer: createHostSigner(), store: createMemoryStore() })
gateway.register(def, { approvedCapabilities: def.capabilities, packageHash: 'fixture' })
const perms = new Set(Object.values(def.permissions))
const hostCall = (companyId, profileId, operation, args) => gateway.call({ operation, args, nonce: randomUUID().replaceAll('-', ''), idempotencyKey: randomUUID().replaceAll('-', ''),
  token: gateway.issueCallToken({ moduleKey: def.key, companyId, profileId, permissionSet: perms, capabilities: def.capabilities }) })
for (const [t, c, u] of [['Laptops', A, userA], ['Sillas', A, userA], ['Toner', B, userB]]) await hostCall(c, u, 'records.create', { entity: 'solicitud', data: { titulo: t, solicitante: u } })

const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)) })
const sources = {
  panel: readFileSync(path.join(ROOT, 'apps/api/src/secure-runtime/fixtures/solicitudes/frontend/panel.js'), 'utf8'),
  probe: readFileSync(path.join(ROOT, 'apps/api/src/secure-runtime/__tests__/probes/frontend/probe.js'), 'utf8'),
}
let hostOrigin = ''
const hostCalls = []
const frameServer = await listen((req, res) => {
  const name = req.url.split('/').pop()
  if (!Object.hasOwn(sources, name)) { res.writeHead(404); return res.end() }
  const frame = renderIsolatedFrame({ componentSource: sources[name], title: name, frameAncestors: [hostOrigin] })
  res.writeHead(200, frame.headers); res.end(frame.html)
})
const frameOrigin = `http://localhost:${frameServer.address().port}`
const bridgeSource = readFileSync(path.join(ROOT, 'packages/ui/src/secure-runtime/isolated-frame-host.js'), 'utf8')
const hostServer = await listen(async (req, res) => {
  if (req.url === '/bridge.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(bridgeSource) }
  if (req.url === '/host/call' && req.method === 'POST') {
    let body = ''; for await (const c of req) body += c
    const { op, args } = JSON.parse(body); hostCalls.push(op)
    // The host resolves company A for the signed-in user, never the component.
    try { const r = await hostCall(A, userA, op, args); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r.data)) } catch (e) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ code: e.code })) }
  }
  res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'runly_session=SECRET-COOKIE; Path=/' })
  res.end(`<!doctype html><title>Runly host</title><div id="panel" style="height:200px"></div><div id="probe" style="height:200px"></div>
<script type="module">
  import { mountIsolatedComponent } from '/bridge.js'
  localStorage.setItem('sb-runly-auth-token', 'SECRET-SESSION')
  const capabilities = { call: async (op, args) => { const r = await fetch('/host/call', { method: 'POST', body: JSON.stringify({ op, args }) }); const b = await r.json(); if (!r.ok) throw Object.assign(new Error(b.code), { code: b.code }); return b } }
  window.forgedSeen = 0
  window.addEventListener('message', (e) => { if (e.data && e.data.id === 'forged') window.forgedSeen++ })
  window.t0 = performance.now()
  window.panel = mountIsolatedComponent({ container: document.getElementById('panel'), src: '${frameOrigin}/frame/panel', title: 'Panel', capabilities, allowedOperations: ['records.list'] })
  window.probe = mountIsolatedComponent({ container: document.getElementById('probe'), src: '${frameOrigin}/frame/probe', title: 'Probe', capabilities, allowedOperations: ['records.list'] })
</script>`)
})
hostOrigin = `http://127.0.0.1:${hostServer.address().port}`

const browser = await chromium.launch()
const { check, report } = checks()
const metrics = {}
try {
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto(hostOrigin)
  const frameFor = (name) => page.frames().find((f) => f.url().endsWith(`/frame/${name}`))
  await page.waitForFunction(() => document.querySelectorAll('iframe').length === 2)
  await page.waitForTimeout(200)
  const waitState = async (name, state) => { for (let i = 0; i < 80; i++) { const f = frameFor(name); const s = f && await f.locator('#root').getAttribute('data-state').catch(() => null); if (s === state) return; await page.waitForTimeout(100) } throw new Error(`${name} never reached ${state}`) }
  await waitState('panel', 'ready')
  metrics.panelReadyMs = Math.round(await page.evaluate(() => performance.now() - window.t0))
  await waitState('probe', 'probed')
  const probe = JSON.parse(await frameFor('probe').locator('#root').textContent())
  metrics.probe = probe

  await check('legit component renders through the bridge with the host company only (A=2)', async () => {
    assert.equal(await frameFor('panel').locator('h2').textContent(), 'Solicitudes: 2')
  })
  await check('frame has an opaque origin and cannot read the host DOM or location', async () => {
    assert.equal(probe.origin, 'null'); assert.equal(probe.parentDom.ok, false); assert.equal(probe.topLocation.ok, false)
  })
  await check('no access to Runly storage, cookies, IndexedDB or session globals', async () => {
    for (const k of ['localStorage', 'sessionStorage', 'parentStorage', 'cookie', 'indexedDb']) assert.equal(probe[k].ok, false, k)
    assert.deepEqual(probe.globalsWithToken, [])
    assert.equal(await page.evaluate(() => localStorage.getItem('sb-runly-auth-token')), 'SECRET-SESSION', 'host storage untouched')
  })
  await check('CSP blocks network, popups and top navigation', async () => {
    assert.equal(probe.fetchHost.ok, false); assert.equal(probe.popup.ok, false)
    assert.equal(page.url(), `${hostOrigin}/`)
  })
  await check('bridge: ungranted operation denied, granted one served, forged window messages ignored', async () => {
    assert.equal(probe.deniedOperation.code, 'CAPABILITY_DENIED'); assert.equal(probe.allowedOperation.value, '2')
    assert.ok(!hostCalls.includes('records.create'), 'denied call never reached the host API')
    assert.equal(await page.evaluate(() => window.forgedSeen), 1, 'the forged message arrived at window level')
    assert.ok(hostCalls.every((op) => op === 'records.list'))
  })
  await check('the frame URL opened directly is still sandboxed', async () => {
    const direct = await browser.newPage()
    await direct.goto(`${frameOrigin}/frame/probe`)
    assert.equal(await direct.evaluate(() => String(window.origin)), 'null')
    assert.equal(await direct.evaluate(() => { try { localStorage.length; return 'readable' } catch (e) { return e.name } }), 'SecurityError')
    await direct.close()
  })
  await check('revocation removes the frame and closes its channel', async () => {
    const before = hostCalls.length
    await page.evaluate(() => { window.panel.revoke(); window.probe.revoke() })
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0)
    assert.equal(await page.evaluate(() => window.panel.revoked && window.probe.revoked), true)
    await page.waitForTimeout(300)
    assert.equal(hostCalls.length, before)
  })
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  metrics.hostHeapMb = Math.round(m.JSHeapUsedSize / 1024 / 1024 * 10) / 10
  metrics.frames = m.Frames
} finally {
  report()
  console.log(JSON.stringify({ ...metrics, probe: undefined }))
  await browser.close()
  hostServer.close(); frameServer.close()
}
