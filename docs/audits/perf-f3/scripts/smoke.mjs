// Usage: node smoke.mjs <base> — logs in and opens representative screens; fails on page errors, failed requests or empty screens.
import { chromium } from 'playwright'
const base = process.argv[2]
const routes = ['/app/home', '/app/work', '/app/profile', '/app/help', '/app/m/runly.notes', '/app/m/runly.inventory/inventory', '/app/m/runly.calendar', '/app/m/runly.chat', '/app/m/runly.website', '/app/m/runly.studio', '/app/m/runly.files', '/app/m/runly.pfm']
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript((id) => { try { localStorage.setItem('runly-active-company', id) } catch {} }, process.env.PERF_COMPANY_ID ?? '')
const page = await ctx.newPage(); const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_BLOCKED|Failed to load resource.*(40[134]|5\d\d)/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
page.on('requestfailed', (r) => { if (/\/assets\/.*\.js/.test(r.url())) errs.push('asset failed: ' + r.url()) })
await page.goto(base + '/app/login'); await page.locator('#identifier').fill(process.env.E2E_USER_EMAIL); await page.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD); await page.locator('button[type="submit"]').click()
await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 60000 })
const res = []
for (const r of routes) {
  const before = errs.length
  await page.goto(base + r, { waitUntil: 'load' }); await page.waitForTimeout(5000)
  const text = (await page.locator('body').innerText()).trim().length
  res.push({ r, chars: text, newErrors: errs.slice(before) })
}
console.log(JSON.stringify(res, null, 1)); console.log(errs.length ? 'ERRORS' : 'CLEAN'); await b.close(); process.exit(errs.length ? 1 : 0)
