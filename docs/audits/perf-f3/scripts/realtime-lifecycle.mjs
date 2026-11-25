// Tracks Realtime (phoenix) joins/leaves per topic while: login -> in-app company switch -> logout -> login again.
// Usage: node realtime-lifecycle.mjs <base>   env: E2E_USER_*, PERF_COMPANY_ID (start company), PERF_OTHER_COMPANY_NAME
import { chromium } from 'playwright'
const base = process.argv[2]; const other = process.env.PERF_OTHER_COMPANY_NAME
const live = new Map() // `${wsId}|${topic}` -> true while joined
let wsSeq = 0, openSockets = 0; const errs = []
const results = []; const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  [' + i + ']' : ''}`) }
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript((id) => { try { localStorage.setItem('runly-active-company', id) } catch {} }, process.env.PERF_COMPANY_ID)
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)))
p.on('websocket', (ws) => {
  if (!/realtime/.test(ws.url())) return
  const id = ++wsSeq; openSockets++
  const track = (raw, dir) => { try { const m = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); const topic = m[2] ?? m.topic, ev = m[3] ?? m.event
    if (dir === 'out' && ev === 'phx_join') live.set(`${id}|${topic}`, true); if (dir === 'out' && ev === 'phx_leave') live.delete(`${id}|${topic}`) } catch {} }
  ws.on('framesent', (f) => track(f.payload, 'out'))
  ws.on('close', () => { openSockets--; for (const k of [...live.keys()]) if (k.startsWith(`${id}|`)) live.delete(k) })
})
const topicsNow = () => [...live.keys()].map((k) => k.split('|')[1]).filter((t) => !/^realtime:(phoenix)$/.test(t))
const companyTopics = (id) => topicsNow().filter((t) => t.includes(id))
const login = async () => { await p.locator('#identifier').fill(process.env.E2E_USER_EMAIL); await p.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD); await p.locator('button[type="submit"]').click(); await p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 60000 }); await p.waitForTimeout(7000) }
await p.goto(base + '/app/login'); await login()
const first = process.env.PERF_COMPANY_ID
const t1 = topicsNow(); ok('after login the user is subscribed (user + first company topics)', t1.length > 0 && companyTopics(first).length > 0, `${t1.length} topics`)
// in-app company switch through the topbar selector
await p.locator('button[title]').filter({ hasText: /Pruebas|empresa|Empresa/i }).first().click().catch(() => {})
await p.getByText(other, { exact: false }).last().click({ timeout: 8000 }).catch((e) => console.log('switch click failed', e.message.slice(0, 80)))
await p.waitForTimeout(8000)
ok('after switching company no topic of the previous company stays joined', companyTopics(first).length === 0, companyTopics(first).join(',').slice(0, 120))
const t2 = topicsNow(); ok('after switching, the new company has its own topics', t2.some((t) => /company:/.test(t) && !t.includes(first)), `${t2.length} topics`)
// logout
await p.locator('button[aria-haspopup="menu"], header button').last().click().catch(() => {}); await p.getByText('Cerrar sesión').first().click({ timeout: 8000 }).catch(() => {})
const c = p.getByRole('button', { name: /cerrar sesión|salir|confirmar/i }); if (await c.count()) await c.last().click().catch(() => {})
await p.waitForSelector('#identifier', { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(4000)
ok('logout leaves no joined topic', topicsNow().length === 0, topicsNow().join(',').slice(0, 160))
ok('logout raises no page error (teardown)', !errs.some((e) => /teardown/.test(e)), errs.join(' | ').slice(0, 160))
// login again: nothing from the previous session survives, only fresh joins
await p.evaluate((id) => localStorage.setItem('runly-active-company', id), first); await login()
const t3 = topicsNow(); ok('re-login subscribes again from a clean state', t3.length > 0 && new Set(t3).size === t3.length, `${t3.length} topics, no duplicates`)
ok('re-login does not carry the company selected before logout', companyTopics(first).length > 0)
ok('no page errors in the whole run', errs.length === 0, errs.join(' | ').slice(0, 160))
await b.close(); process.exit(results.every(Boolean) ? 0 : 1)
