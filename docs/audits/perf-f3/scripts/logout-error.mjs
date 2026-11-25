// Logs in, logs out through the user menu and prints any page error with its stack. Usage: node logout-error.mjs <base>
import { chromium } from 'playwright'
const base = process.argv[2]
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript((id) => { Error.stackTraceLimit = 50; try { localStorage.setItem('runly-active-company', id) } catch {} }, process.env.PERF_COMPANY_ID)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', (e) => errs.push(`${e.message}\n${(e.stack || '').split('\n').slice(0, 14).join('\n')}`))
await p.goto(base + '/app/login'); await p.locator('#identifier').fill(process.env.E2E_USER_EMAIL); await p.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD); await p.locator('button[type="submit"]').click()
await p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 60000 }); await p.waitForTimeout(6000)
const before = errs.length
await p.locator('button[aria-haspopup="menu"], header button').last().click().catch(() => {}); await p.getByText('Cerrar sesión').first().click({ timeout: 8000 }).catch((e) => console.log('menu click failed', e.message.slice(0, 80)))
const confirm = p.getByRole('button', { name: /cerrar sesión|salir|confirmar/i }); if (await confirm.count()) await confirm.last().click().catch(() => {})
await p.waitForSelector('#identifier', { timeout: 20000 }).catch(() => console.log('no login form after logout')); await p.waitForTimeout(3000)
console.log('errors before logout:', before, '| errors after:', errs.length - before); errs.slice(before).forEach((e) => console.log('---\n' + e))
await b.close()
