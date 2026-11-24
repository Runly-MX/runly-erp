import { chromium } from 'playwright'
const base = process.argv[2] ?? 'http://localhost:4174'
const out = (process.env.PERF_OUT ?? '.') + '/'
const b = await chromium.launch()
const res = []
for (const [name, vp, dsf, mobile, scheme] of [['desk-light', {width:1440,height:900},1,false,'light'], ['desk-dark',{width:1440,height:900},2,false,'dark'], ['mob-light',{width:390,height:844},3,true,'light'], ['mob-dark',{width:390,height:844},3,true,'dark']]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile, colorScheme: scheme })
  await ctx.addInitScript((s) => { localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark: s === 'dark' }, version: 0 })) }, scheme)
  const page = await ctx.newPage()
  const reqs = []; page.on('response', r => { if (/\/runly\//.test(r.url())) reqs.push(r.url().split('/runly/')[1] + ' ' + (r.headers()['content-length'] ?? '?')) })
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('requestfailed', r => errs.push('FAILED ' + r.url()))
  // hold /instance/status so the real loader is on screen
  let release; const gate = new Promise(r => release = r)
  await page.route('**/instance/status', async route => { await gate; route.continue() })
  await page.goto(base + '/app/login', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: out + name + '-1-boot.png' })
  release(); await page.waitForTimeout(400)
  await page.screenshot({ path: out + name + '-2-loader.png' })
  await page.waitForSelector('input', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: out + name + '-3-login.png' })
  const cls = await page.evaluate(() => new Promise(r => { let v = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) v += e.value })).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => r(v), 300) }))
  res.push({ name, runlyAssets: [...new Set(reqs)], cls: +cls.toFixed(3), errs })
  await ctx.close()
}
console.log(JSON.stringify(res, null, 1)); await b.close()
