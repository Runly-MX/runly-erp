import { chromium } from 'playwright'
const base = process.argv[2]
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX' })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable')
const reqs = new Map(), done = []
cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, type: e.type }))
cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.enc = e.response.headers['content-encoding'] || '' } })
cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; done.push(r) } })
await p.goto(base + '/app/login', { waitUntil: 'load' })
await p.waitForSelector('input', { timeout: 20000 }).catch(() => {})
await p.waitForTimeout(6000)
const by = {}
for (const r of done) { const k = r.type; by[k] ??= { n: 0, b: 0 }; by[k].n++; by[k].b += r.bytes }
console.log(Object.entries(by).map(([k, v]) => `${k}: ${v.n} req ${(v.b / 1024) | 0} KB`).join('\n'))
console.log('TOTAL', (done.reduce((a, r) => a + r.bytes, 0) / 1024) | 0, 'KB')
console.log(done.filter(r => r.type !== 'Script').sort((a, b) => b.bytes - a.bytes).slice(0, 25).map(r => `${(r.bytes / 1024).toFixed(1)} KB ${r.type} ${r.status} ${r.url.replace(base, '').slice(0, 90)}`).join('\n'))
await b.close()
