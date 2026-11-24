// Usage: node login-closure.mjs <base> [top=12] — cold-cache login page: JS files/bytes actually transferred, largest chunks.
import { chromium } from 'playwright'
const base = process.argv[2], top = Number(process.argv[3] ?? 12)
const b = await chromium.launch(); const ctx = await b.newContext(); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable')
const reqs = new Map(), done = []
cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, type: e.type }))
cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) done.push({ ...r, bytes: e.encodedDataLength }) })
await page.goto(base + '/app/login', { waitUntil: 'load' }); await page.locator('#identifier').waitFor({ timeout: 60000 }); await page.waitForTimeout(2500)
const js = done.filter(r => r.type === 'Script'), all = done.reduce((s, r) => s + r.bytes, 0)
const kb = (n) => Math.round(n / 1024)
console.log(JSON.stringify({ base, totalKB: kb(all), jsFiles: js.length, jsKB: kb(js.reduce((s, r) => s + r.bytes, 0)) }))
console.log(js.sort((x, y) => y.bytes - x.bytes).slice(0, top).map(r => `${kb(r.bytes)} KB  ${r.url.split('/assets/')[1]}`).join('\n'))
await b.close()
