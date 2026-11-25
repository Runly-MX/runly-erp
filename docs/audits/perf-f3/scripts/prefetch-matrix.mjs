// Usage: node prefetch-matrix.mjs <base> <strategy:none|idle|adaptive|selective> <scenario> [profile=desktop|mid]
// scenarios: visit-only (form visible, nobody interacts) | typing (focus, slow typing, submit) | immediate (fill and submit at once)
//            | savedata (typing with navigator.connection.saveData) | no-network-api (typing with the Network Information API removed)
// Prints one JSON line: JS/total KB at form visible, JS/total KB until the home screen is usable, submit-to-usable ms.
import { chromium } from 'playwright'

const [base, strategy, scenario, profile = 'desktop'] = process.argv.slice(2)
const P = { desktop: { cpu: 1, net: null }, mid: { cpu: 4, net: { d: 1.6e6, l: 150 } } }[profile]
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(([s, sc, id]) => {
  window.__runlyPrefetch = s
  try { localStorage.setItem('runly-active-company', id) } catch { /* ignore */ }
  if (sc === 'savedata') Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' }, configurable: true })
  if (sc === 'no-network-api') Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true })
}, [strategy, scenario, process.env.PERF_COMPANY_ID ?? ''])
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Network.enable')
if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu })
if (P.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: P.net.l, downloadThroughput: P.net.d / 8, uploadThroughput: P.net.d / 16 })
const reqs = new Map(), done = []
cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type }))
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) done.push({ ...r, bytes: e.encodedDataLength }) })
const kb = (n) => Math.round(n / 1024)
const sum = (pred) => kb(done.filter(pred).reduce((s, r) => s + r.bytes, 0))
const js = (r) => r.type === 'Script'

await page.goto(base + '/app/login', { waitUntil: 'load' })
await page.locator('#identifier').waitFor({ timeout: 90000 })
const atForm = { js: sum(js), total: sum(() => true) }
const out = { strategy, scenario, profile, atFormJsKB: atForm.js, atFormTotalKB: atForm.total }

if (scenario === 'visit-only') {
  await page.waitForTimeout(8000)
  out.after8sJsKB = sum(js); out.after8sTotalKB = sum(() => true)
} else {
  const email = process.env.E2E_USER_EMAIL, password = process.env.E2E_USER_PASSWORD
  if (scenario === 'immediate') {
    await page.locator('#identifier').fill(email); await page.locator('input[type="password"]').fill(password)
  } else {
    await page.locator('#identifier').click(); await page.waitForTimeout(2500)
    await page.locator('#identifier').pressSequentially(email, { delay: 40 }); await page.locator('input[type="password"]').pressSequentially(password, { delay: 40 })
  }
  out.beforeSubmitJsKB = sum(js)
  const t0 = Date.now()
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 90000 })
  await page.getByText('Todas las aplicaciones', { exact: false }).first().waitFor({ timeout: 120000 }).catch(() => {})
  out.submitToUsableMs = Date.now() - t0
  await page.waitForTimeout(1500)
  out.totalJsKB = sum(js); out.totalTransferKB = sum(() => true)
}
console.log(JSON.stringify(out))
await b.close()
