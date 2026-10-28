import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { prepareDisposableNotesStorageOwner } from './fixtures/realtime-2/notes-storage-owner.mjs'

// Local-only benchmark of runly.notifications against a disposable Supabase.
// The built web app and API image must come from the same commit as --label.
//   node scripts/measure-notifications.mjs --api-image=runly-notifications:api-<sha> --label=before --users=1,5,10
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const image = arg('api-image'), label = arg('label', 'run')
const counts = arg('users', '1').split(',').map(Number), windowMs = Number(arg('window', '45')) * 1000
const only = arg('only', '').split(',').filter(Boolean)
assert.match(image ?? '', /^runly-notifications:api-[a-f0-9]+$/)
assert.ok(counts.every(n => Number.isInteger(n) && n >= 1 && n <= 20))
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const output = resolve('.artifacts/notifications', `${label}-${Date.now()}`)
await mkdir(output, { recursive: true })
const require = createRequire(resolve('apps/api/package.json'))
const { createClient } = require('@supabase/supabase-js')
const wait = ms => new Promise(r => setTimeout(r, ms))
const pct = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null
const routeKey = request => `${request.method()} ${new URL(request.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`
const BELL = 'button[title="Notificaciones"]'

async function runCount(n) {
  const stack = await createStudioStack({ apiImage: image })
  const results = [], errors = []
  let browser, web
  try {
    const kongPath = join(stack.directory, 'kong.yml')
    await writeFile(kongPath, (await readFile(kongPath, 'utf8')).replace(/(  - name: realtime-v1-ws[\s\S]*?read_timeout:) 3000/, '$1 60000'))
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(output, `startup-${n}.log`) })
    await stack.verifyTarget(); await stack.initialize(); await prepareDisposableNotesStorageOwner(stack)
    await stack.pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements')
    const { companies, admin } = await seedStudioScenario(stack), company = companies[0]
    await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'notifications.%' ON CONFLICT DO NOTHING", [company.roleId])
    await stack.pool.query("UPDATE runly_module SET enabled=true,status='INSTALLED' WHERE key='runly.notifications'")
    const password = `Test-${Math.random().toString(16).slice(2)}-Aa1!`, users = []
    for (let i = 0; i < n; i++) {
      const email = `bench${i}@notifications.example.test`
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(error, null)
      const profile = (await stack.pool.query('INSERT INTO user_profile(id,auth_user_id,display_name,email,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id', [data.user.id, `Bench ${i}`, email])).rows[0]
      await stack.pool.query('INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())', [company.id, profile.id, company.roleId])
      const client = createClient(stack.urls.kong, stack.secret.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const signed = await client.auth.signInWithPassword({ email, password }); assert.equal(signed.error, null)
      users.push({ id: profile.id, email, password, token: signed.data.session.access_token })
    }
    await stack.compose(['up', '-d', 'runly-api'], { log: join(output, `api-${n}.log`) })
    for (let i = 0; i < 120; i++) { try { if ((await fetch(stack.urls.api + '/health')).ok) break } catch {} await wait(250) }

    const directory = join(stack.directory, 'web')
    for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
    const { build, preview } = await import(pathToFileURL(createRequire(resolve('apps/desktop/package.json')).resolve('vite')).href)
    const config = { root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: directory, base: '/', logLevel: 'error',
      define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
      build: { outDir: directory, emptyOutDir: true }, preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true } }
    await build(config); web = await preview(config)
    browser = await chromium.launch({ channel: 'chrome', headless: true })

    const meters = new Map() // page -> counters
    async function openPage(user, context) {
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
      const meter = { http: new Map(), frames: { inCount: 0, outCount: 0, inBytes: 0, outBytes: 0, broadcastNew: 0, pgChangeInsert: 0, joinErrors: 0 } }
      meters.set(page, meter)
      page.on('request', r => { if (r.url().startsWith(stack.urls.api)) meter.http.set(routeKey(r), (meter.http.get(routeKey(r)) ?? 0) + 1) })
      const cdp = await context.newCDPSession(page); await cdp.send('Network.enable')
      cdp.on('Network.webSocketFrameReceived', e => { const d = e.response.payloadData; if (process.env.DEBUG_FRAMES === '2') console.log('WS<', d.slice(0, 220)); meter.frames.inCount++; meter.frames.inBytes += d.length; if (d.includes('notification.new')) meter.frames.broadcastNew++; if (d.includes('"INSERT"') && d.includes('postgres_changes')) meter.frames.pgChangeInsert++; if (d.includes('phx_reply') && d.includes('"status":"error"')) { meter.frames.joinErrors++; if (process.env.DEBUG_FRAMES) console.log(d.slice(0, 300)) } })
      cdp.on('Network.webSocketFrameSent', e => { if (process.env.DEBUG_FRAMES === '2') console.log('WS>', e.response.payloadData.slice(0, 220)); meter.frames.outCount++; meter.frames.outBytes += e.response.payloadData.length })
      await page.addInitScript(() => {
        window.__toasts = []
        window.__badgeAt = {}
        const readBadge = () => { const t = document.querySelector('button[title="Notificaciones"] span')?.textContent?.trim() ?? ''; return t === '9+' ? 10 : Number(t || 0) }
        const markBadge = () => { const v = readBadge(); for (let i = 1; i <= v; i++) if (window.__badgeAt[i] === undefined) window.__badgeAt[i] = Date.now() }
        document.addEventListener('DOMContentLoaded', () => new MutationObserver(markBadge).observe(document.body, { childList: true, subtree: true, characterData: true }))
        new MutationObserver(list => { for (const m of list) for (const node of m.addedNodes) {
          const toast = node.nodeType === 1 && (node.matches?.('[data-sonner-toast]') ? node : node.querySelector?.('[data-sonner-toast]'))
          if (toast) window.__toasts.push({ at: Date.now(), text: toast.textContent })
        } }).observe(document, { childList: true, subtree: true })
      })
      if (user) {
        await page.goto(stack.urls.web + '/app/login'); await page.locator('#identifier').fill(user.email); await page.locator('#password').fill(user.password)
        await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click(); await page.waitForURL(url => !url.pathname.includes('/login'))
      }
      return page
    }
    async function contextFor() {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      await context.route('**/*', route => { const u = new URL(route.request().url()); return /^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname) ? route.abort() : route.continue() })
      await context.addInitScript(id => localStorage.setItem('runly-active-company', id), company.id)
      return context
    }
    const pages = []
    for (const user of users) pages.push(await openPage(user, await contextFor()))
    const publishAs = async (title, extra = {}) => (await fetch(stack.urls.api + '/notifications/publish', { method: 'POST',
      headers: { Authorization: `Bearer ${users[0].token}`, 'X-Runly-Company-Id': company.id, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'system.benchmark', title, body: 'benchmark', recipients: { userIds: users.map(u => u.id) }, dedupeKey: `bench:${title}:${Math.random()}`, ...extra }) })).status
    async function reset() {
      await stack.pool.query('UPDATE notification SET read_at=now() WHERE read_at IS NULL')
      for (const p of pages) await p.goto(stack.urls.web + '/app')
      await wait(3000)
      for (const p of pages) await p.evaluate(() => { window.__toasts.length = 0; window.__badgeAt = {} })
    }
    async function cpu() {
      const out = {}
      for (const service of ['runly-api', 'supabase-db', 'supabase-realtime']) {
        const id = await stack.compose(['ps', '-q', service])
        out[service] = Number(execFileSync('docker', ['exec', id, 'cat', '/sys/fs/cgroup/cpu.stat'], { encoding: 'utf8' }).match(/usage_usec (\d+)/)[1]) / 1e6
      }
      return out
    }
    const sqlNow = async () => (await stack.pool.query("SELECT query,calls::float8,total_exec_time FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT ILIKE '%pg_stat_%'")).rows
    async function measure(name, action) {
      if (only.length && !only.includes(name.split('_')[0])) return
      await reset()
      for (const m of meters.values()) { m.http.clear(); Object.keys(m.frames).forEach(k => { m.frames[k] = 0 }) }
      const [c0, q0, t0] = [await cpu(), await sqlNow(), Date.now()]
      const extra = await action()
      const [c1, q1, t1] = [await cpu(), await sqlNow(), Date.now()]
      const http = {}; for (const m of meters.values()) for (const [k, v] of m.http) http[k] = (http[k] ?? 0) + v
      const frames = [...meters.values()].reduce((a, m) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] + m.frames[k]])), { inCount: 0, outCount: 0, inBytes: 0, outBytes: 0, broadcastNew: 0, pgChangeInsert: 0, joinErrors: 0 })
      const before = new Map(q0.map(r => [r.query, r]))
      const sql = q1.map(r => ({ query: r.query.replace(/\s+/g, ' ').slice(0, 160), calls: r.calls - (before.get(r.query)?.calls ?? 0), ms: r.total_exec_time - (before.get(r.query)?.total_exec_time ?? 0) })).filter(r => r.calls > 0).sort((a, b) => b.calls - a.calls)
      const toasts = await Promise.all(pages.map(p => p.evaluate(() => window.__toasts.map(t => t.text))))
      const record = { scenario: name, users: n, seconds: (t1 - t0) / 1000, httpTotal: Object.values(http).reduce((a, b) => a + b, 0), http, ws: frames,
        sqlCalls: sql.reduce((a, r) => a + r.calls, 0), sqlTop: sql.slice(0, 12), cpuSeconds: Object.fromEntries(Object.keys(c1).map(k => [k, +(c1[k] - c0[k]).toFixed(3)])),
        toastsPerPage: toasts.map(t => t.length), toastTexts: toasts[0] ?? [], ...extra }
      results.push(record); console.log(JSON.stringify({ n, scenario: name, httpTotal: record.httpTotal, sqlCalls: record.sqlCalls, ws: frames.inCount + frames.outCount, cpu: record.cpuSeconds, latency: record.latency }))
    }
    // The bell caps its badge at "9+"; an in-page observer stamps the first time it shows >= v, so polling
    // delivery and event delivery are measured the same way without blocking the publisher.
    const badgeAt = (page, v) => page.evaluate(x => window.__badgeAt[x] ?? null, v)
    const latencyOf = async (page, v, startedAt, timeout = 40000) => {
      try { await page.waitForFunction(x => window.__badgeAt[x] !== undefined, v, { timeout, polling: 100 }) } catch { return null }
      return Math.max(0, (await badgeAt(page, v)) - startedAt)
    }
    const summarize = values => ({ p50: pct(values.filter(Boolean), 0.5), p95: pct(values.filter(Boolean), 0.95), lost: values.filter(v => v == null).length, samples: values.length })

    await measure('A_idle_bell_closed', () => wait(windowMs))
    await measure('C_bell_open', async () => { for (const p of pages) await p.locator(BELL).click(); await wait(windowMs); for (const p of pages) await p.keyboard.press('Escape') })
    await measure('D_inbox_screen', async () => { for (const p of pages) await p.goto(stack.urls.web + '/app/m/runly.notifications'); await wait(windowMs) })
    await measure('E_nine_notifications', async () => {
      const gap = windowMs / 9, published = []
      for (let i = 1; i <= 9; i++) { published.push(Date.now()); assert.equal(await publishAs(`E-${i}`), 201); await wait(gap) }
      await wait(35000)
      const latencies = []
      for (const page of pages) for (let i = 1; i <= 9; i++) { const at = await badgeAt(page, i); latencies.push(at == null ? null : Math.max(0, at - published[i - 1])) }
      return { latency: summarize(latencies) }
    })
    await measure('F_burst_100', async () => {
      const started = Date.now(); let next = 0
      await Promise.all(Array.from({ length: 10 }, async () => { while (next < 100) { const i = ++next; if (i > 100) break; await publishAs(`F-${i}`) } }))
      const latest = (await stack.pool.query('SELECT title FROM notification ORDER BY id DESC LIMIT 1')).rows[0].title
      const seen = await Promise.all(pages.map(async p => { await p.locator(BELL).click(); try { await p.getByText(new RegExp(`^${latest}$`)).first().waitFor({ timeout: 60000 }); return Date.now() - started } catch { return null } }))
      return { latency: summarize(seen), publishedRows: Number((await stack.pool.query("SELECT count(*) FROM notification WHERE title LIKE 'F-%'")).rows[0].count) }
    })
    await measure('H_two_tabs', async () => {
      const second = await openPage(null, pages[0].context()); await second.goto(stack.urls.web + '/app'); await wait(3000)
      await second.evaluate(() => { window.__badgeAt = {}; window.__toasts.length = 0 })
      const started = Date.now(); await publishAs('H-1'); const l = await Promise.all([latencyOf(pages[0], 1, started), latencyOf(second, 1, started)]); await wait(windowMs / 2)
      const toasts = await Promise.all([pages[0], second].map(p => p.evaluate(() => window.__toasts.filter(t => t.text.includes('H-1')).length)))
      await second.close(); meters.delete(second); return { latency: summarize(l), duplicateToastsPerTab: toasts }
    })
    await measure('J_realtime_outage', async () => {
      await stack.compose(['stop', 'supabase-realtime']); for (let i = 1; i <= 3; i++) await publishAs(`J-${i}`)
      await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-realtime']); const started = Date.now()
      const l = await Promise.all(pages.map(p => latencyOf(p, 3, started, 90000)))
      return { latency: summarize(l), note: 'ms from Realtime restart until the bell shows the 3 notifications missed during the outage; Realtime CPU delta is invalid (container restarted)' }
    })
    await writeFile(join(output, `n${n}.json`), JSON.stringify({ label, sourceSha, image, users: n, windowSeconds: windowMs / 1000, errors, results }, null, 2))
  } finally {
    await browser?.close().catch(() => {}); await web?.close?.().catch(() => {}); await stack.close()
  }
}
for (const n of counts) await runCount(n)
console.log(`written ${output}`)
