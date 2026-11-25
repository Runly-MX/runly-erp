// F3.1/F3.2 login-path acceptance in Chromium. Usage: node auth-flow.mjs <base>   (needs E2E_USER_EMAIL/E2E_USER_PASSWORD, API behind <base>)
// Read-only against the data: login, reload, navigate, switch company (localStorage + reload), logout, /app/setup on an initialized instance.
import { chromium } from 'playwright'
const base = process.argv[2], A = 'runly-active-company'
const TEST_CO = process.env.PERF_COMPANY_ID, OTHER_CO = process.env.PERF_OTHER_COMPANY_ID
const results = []; const ok = (name, pass, info = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}`) }
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX' })
await ctx.addInitScript((id) => { try { if (!localStorage.getItem('runly-active-company') && id) localStorage.setItem('runly-active-company', id) } catch {} }, TEST_CO)
const page = await ctx.newPage()
const errs = [], media = [], companyHdr = new Set(); let phase = 'anon'
page.on('pageerror', (e) => errs.push(`[${phase}] pageerror: ${e.message.slice(0, 140)}`))
page.on('console', (m) => { if (m.type() === 'error' && /dynamically imported|Failed to fetch dynamically|ChunkLoad|Importing a module/i.test(m.text())) errs.push(`[${phase}] ${m.text().slice(0, 140)}`) })
page.on('requestfailed', (r) => { if (/\/assets\/.*\.(js|css)/.test(r.url())) errs.push(`[${phase}] asset failed: ${r.url()}`) })
page.on('request', (r) => { if (/\.mp3/.test(r.url())) media.push(`${phase}:${r.url().split('/').pop()}`); const h = r.headers()['x-runly-company-id']; if (h && phase === 'switched') companyHdr.add(h) })
const login = async () => { await page.locator('#identifier').fill(process.env.E2E_USER_EMAIL); await page.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD); await page.locator('button[type="submit"]').click() }
const inShell = async () => { try { await page.waitForURL((u) => !/login|setup/.test(u.pathname), { timeout: 60000 }); await page.waitForTimeout(4000); return !/\/login/.test(page.url()) } catch { return false } }

// 1. anonymous start
await page.goto(base + '/app'); await page.waitForSelector('#identifier', { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(3000)
ok('anonymous start shows login form', await page.locator('#identifier').count() === 1, page.url().replace(base, ''))
ok('no call sounds downloaded before login', media.length === 0, media.join(','))
// 2. login
phase = 'login'; await login(); ok('login reaches the shell', await inShell(), page.url().replace(base, ''))
await page.waitForTimeout(5000)
ok('call sounds downloaded after authenticating', media.filter((m) => m.startsWith('login')).length >= 1, [...new Set(media)].join(','))
// 3. restore session (hard reload, new tab-like load)
phase = 'restore'; await page.goto(base + '/app'); await page.waitForTimeout(6000)
ok('existing session restored without login form', !/\/login/.test(page.url()) && await page.locator('#identifier').count() === 0, page.url().replace(base, ''))
ok('sounds preloaded after restore', media.some((m) => m.startsWith('restore')), '')
// 4. initial navigation
phase = 'nav'
for (const r of ['/app/home', '/app/m/runly.calendar', '/app/m/runly.contacts']) { await page.goto(base + r); await page.waitForTimeout(4500); ok(`navigate ${r}`, (await page.locator('body').innerText()).trim().length > 80 && !/login/.test(page.url()), page.url().replace(base, '')) }
// 5. company switch
phase = 'switched'
if (OTHER_CO) { await page.evaluate(([k, id]) => localStorage.setItem(k, id), [A, OTHER_CO]); await page.goto(base + '/app/home'); await page.waitForTimeout(6000)
  ok('switching company sends the new company on API calls', companyHdr.has(OTHER_CO) && !companyHdr.has(TEST_CO), [...companyHdr].map((c) => c.slice(0, 8)).join(','))
  await page.evaluate(([k, id]) => localStorage.setItem(k, id), [A, TEST_CO]); await page.goto(base + '/app/home'); await page.waitForTimeout(3000) }
// 6. setup route on an initialized instance
phase = 'setup'; await page.goto(base + '/app/setup'); await page.waitForTimeout(4000)
ok('/app/setup on an initialized instance redirects (no wizard)', !/\/setup/.test(page.url()), page.url().replace(base, ''))
// 7. logout
phase = 'logout'; await page.goto(base + '/app/home'); await page.waitForTimeout(3000)
const menu = page.getByRole('button', { name: /usuario|cuenta|perfil|menú de usuario/i }).first()
let out = false
try { if (await page.getByText('Cerrar sesión').count() === 0) { await page.locator('header button, [data-user-menu], button[aria-haspopup="menu"]').last().click({ timeout: 5000 }) } await page.getByText('Cerrar sesión').first().click({ timeout: 8000 }); const confirm = page.getByRole('button', { name: /cerrar sesión|salir|confirmar/i }); if (await confirm.count()) await confirm.last().click().catch(() => {}); await page.waitForSelector('#identifier', { timeout: 20000 }); out = true } catch (e) { out = false }
ok('logout returns to the login form', out, page.url().replace(base, ''))
await page.reload(); await page.waitForTimeout(4000); ok('after logout a reload stays on login', await page.locator('#identifier').count() === 1)
ok('no dynamic-import / asset load errors in any phase', errs.length === 0, errs.slice(0, 4).join(' | '))
await b.close(); process.exit(results.every(Boolean) ? 0 : 1)
