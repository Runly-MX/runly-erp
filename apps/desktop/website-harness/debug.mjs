import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createFixture } from './fixture-api.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = resolve(here, '..')
const BASE = 'http://127.0.0.1:5199'
const vite = spawn(process.execPath, [resolve(desktop, 'node_modules/vite/bin/vite.js'), '--config', 'website-harness/vite.config.js'], { cwd: desktop, stdio: 'ignore' })
for (let i = 0; i < 120; i += 1) { try { if ((await fetch(BASE)).ok) break } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)) }
const fixture = createFixture()
fixture.addSite({ name: 'Demo' })
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.addInitScript(() => { window.__HARNESS_PERMS__ = ['website.access', 'website.site.read', 'website.site.update', 'website.pages.read'] })
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('console.' + m.type(), m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 400)))
page.on('requestfailed', (r) => console.log('requestfailed', r.url().slice(0, 150)))
await page.route((url) => url.origin === BASE && /^\/(website|company)\//.test(url.pathname), async (route) => {
  const request = route.request(); const url = new URL(request.url())
  const out = fixture.handle(request.method(), url.pathname, url.searchParams, {}, request.headers())
  await route.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) })
})
await page.goto(`${BASE}/app/m/runly.website`)
await page.waitForTimeout(8000)
console.log('BODY:', (await page.locator('body').innerText()).slice(0, 600))
await browser.close(); vite.kill(); process.exit(0)
