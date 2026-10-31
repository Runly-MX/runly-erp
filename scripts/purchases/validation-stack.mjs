// Disposable full stack for Compras UI/E2E runs: Supabase in Docker (never
// the regular database), every migration + seed, API and web of the working
// tree on their own ports. Nothing here touches port 4010/5173.
//   const s = await bootPurchasesStack(); ... await s.close()
import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { createStudioStack, command } from '../fixtures/studio/supabase-stack.mjs'

// skipMigrations: migration folder names left out (an instance before them).
export async function bootPurchasesStack({ keep = process.argv.includes('--keep'), skipMigrations = [] } = {}) {
  const stack = await createStudioStack({ apiImage: 'runly-studio-combined:api' })
  if (Object.values(stack.ports).includes(4010) || Object.values(stack.ports).includes(5173)) throw new Error('SHARED_PORT_FORBIDDEN')
  const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
  const q = (sql, params) => stack.pool.query(sql, params)
  let api, web, browser
  const close = async () => {
    await browser?.close().catch(() => {})
    if (web) { web.httpServer.closeAllConnections(); await new Promise(done => web.httpServer.close(done)) }
    api?.kill()
    if (!keep) await stack.close()
  }
  try {
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
    await stack.verifyTarget()
    const prismaCli = createRequire(resolve('package.json')).resolve('prisma/build/index.js')
    const env = { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl }
    if (skipMigrations.length) {
      const pre = join(stack.directory, 'prisma-pre')
      await rm(pre, { recursive: true, force: true }); await mkdir(join(pre, 'migrations'), { recursive: true })
      for (const name of await readdir(resolve('prisma/migrations'))) if (!skipMigrations.includes(name)) await cp(resolve('prisma/migrations', name), join(pre, 'migrations', name), { recursive: true })
      await cp(resolve('prisma/schema.prisma'), join(pre, 'schema.prisma'))
      await writeFile(join(pre, 'prisma.config.ts'), `import { defineConfig, env } from "prisma/config";
export default defineConfig({ schema: "schema.prisma", migrations: { path: "migrations" }, datasource: { url: env("DIRECT_URL") } });
`)
      await command(process.execPath, [prismaCli, 'migrate', 'deploy', '--config', join(pre, 'prisma.config.ts')], { env, log: join(stack.directory, 'migrate.log') })
    } else {
      await command(process.execPath, [prismaCli, 'migrate', 'deploy'], { env, log: join(stack.directory, 'migrate.log') })
    }
    const applied = (await q('SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL ORDER BY started_at')).rows.map(row => row.migration_name)
    if (JSON.stringify(applied) !== JSON.stringify([...applied].sort()) ||
      applied.includes('20261216120000_purchase_documentary') === skipMigrations.includes('20261216120000_purchase_documentary')) throw new Error('MIGRATION_ORDER_OR_DOCUMENTARY_STATE_INVALID')
    console.log('Verified migration order:', applied.length, 'documentary:', applied.includes('20261216120000_purchase_documentary'))
    await command(process.execPath, [resolve('prisma/seed.js')], { env, log: join(stack.directory, 'seed.log') })
    await q(`UPDATE runly_module SET enabled = true, status = 'INSTALLED' WHERE key IN ('runly.purchases','runly.contacts','runly.files','runly.inventory')`)
    await q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('initialized','true',now()) ON CONFLICT(key) DO UPDATE SET value='true'`)
    await stack.compose(['exec', '-T', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
      `CREATE OR REPLACE FUNCTION storage.runly_notes_require_private_bucket() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS
      'BEGIN IF NEW.id IN (''runly-notes'',''atlas-notes'') AND NEW.public THEN RAISE EXCEPTION ''NOTES_BUCKET_MUST_REMAIN_PRIVATE''; END IF; RETURN NEW; END;';
      CREATE TRIGGER runly_notes_bucket_private_v1 BEFORE INSERT OR UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.runly_notes_require_private_bucket();`], { log: join(stack.directory, 'notes-guard.log') })

    const apiEnv = {
      NODE_ENV: 'production', RUNLY_API_PORT: String(stack.ports.api), DATABASE_URL: dbUrl, DIRECT_URL: dbUrl,
      SUPABASE_URL: stack.urls.kong, RUNLY_SUPABASE_PUBLIC_URL: stack.urls.kong, SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: stack.secret.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET,
      JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET, RUNLY_SKIP_DB_INIT: '1', CORS_ORIGIN: stack.urls.web, RUNLY_MCP_ENABLED: 'false',
      GROQ_API_KEY: '', TAVILY_API_KEY: '', LIVEKIT_URL: '', SMTP_HOST: '',
    }
    api = spawn(process.execPath, [resolve('apps/api/src/index.js')], { env: { ...process.env, ...apiEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
    const apiLog = []
    api.stdout.on('data', chunk => apiLog.push(String(chunk))); api.stderr.on('data', chunk => apiLog.push(String(chunk)))
    for (let i = 0; i < 120; i++) { try { if ((await fetch(`${stack.urls.api}/health`)).ok) break } catch { /* booting */ } await new Promise(r => setTimeout(r, 500)) }
    await writeFile(join(stack.directory, 'api.log'), apiLog.join(''))

    const require = createRequire(resolve('apps/desktop/package.json'))
    for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
    const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
    const config = { base: '/', root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: stack.directory, logLevel: 'error',
      define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
      build: { outDir: join(stack.directory, 'web'), emptyOutDir: true }, preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true } }
    await build(config); web = await preview(config)
  } catch (error) { await close(); throw error }

  const { createClient } = createRequire(resolve('apps/api/package.json'))('@supabase/supabase-js')
  const admin = createClient(stack.urls.kong, stack.secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // Company with a default workflow (CUSTOM until a preset is applied).
  async function createCompany(name, { id = null, capabilities, stages, policies = [] } = {}) {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now() % 100000}`
    const row = (await q(`INSERT INTO company(id,name,slug,updated_at) VALUES(COALESCE($1::uuid, uuidv7()),$2,$3,now()) RETURNING id`, [id, name, slug])).rows[0]
    if (capabilities) {
      await q(`INSERT INTO purchase_workflow (id, company_id, name, preset, is_default, capabilities, stages, policies, numbering, enabled, updated_at)
        VALUES (uuidv7(), $1, 'Flujo', 'CUSTOM', true, $2, $3, $4, '{}', true, now())`, [row.id, JSON.stringify(capabilities), JSON.stringify(stages), JSON.stringify(policies)])
    }
    return row.id
  }
  // permissions: array of keys, or a LIKE pattern such as 'purchases.%' / '%'.
  async function createRole(companyId, key, permissions) {
    const row = (await q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,$2,$2,now()) RETURNING id`, [companyId, key])).rows[0]
    if (Array.isArray(permissions)) await q(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key = ANY($2::text[])`, [row.id, permissions])
    else await q(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE $2`, [row.id, permissions])
    return row.id
  }
  const users = new Map()
  async function createUser(email, password, memberships) {
    let profileId = users.get(email)
    if (!profileId) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) throw error
      profileId = (await q(`INSERT INTO user_profile(id,auth_user_id,display_name,email,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id`, [data.user.id, email.split('@')[0], email])).rows[0].id
      users.set(email, profileId)
    }
    for (const [companyId, roleId] of memberships) await q(`INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())`, [companyId, profileId, roleId])
    return { email, password, id: profileId }
  }
  async function login(who) {
    const res = await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: who.email, password: who.password }) })
    return (await res.json()).data?.access_token
  }
  function client(token, companyId) {
    return async (method, path, data) => {
      const response = await fetch(`${stack.urls.api}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': companyId, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) })
      return { status: response.status, body: await response.json().catch(() => null) }
    }
  }
  const errors = []
  // Logged-in page; theme through the app's own persisted store.
  async function open(who, companyId, { viewport = { width: 1440, height: 950 }, dark = false } = {}) {
    browser ??= await chromium.launch()
    const phone = viewport.width < 500
    const context = await browser.newContext({ viewport, locale: 'es-MX', colorScheme: dark ? 'dark' : 'light', ...(phone ? { isMobile: true, hasTouch: true } : {}) })
    await context.addInitScript(([id, isDark]) => { try { localStorage.setItem('runly-active-company', id); localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark }, version: 0 })) } catch { /* ignore */ } }, [companyId, dark])
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', res => { if (res.url().startsWith(stack.urls.api) && res.status() >= 500) errors.push(`${res.status()} ${res.url()}`) })
    await page.goto(`${stack.urls.web}/app/login`)
    await page.locator('#identifier').fill(who.email); await page.locator('#password').fill(who.password)
    await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 60000 })
    return { context, page }
  }

  async function assertDisposable() {
    if (!stack.name.startsWith('runly-studio-e2e-') || Object.values(stack.ports).includes(4010)) throw new Error('DISPOSABLE_TARGET_REQUIRED')
    const marker = await q('SELECT id FROM runly_studio_test.environment')
    if (marker.rows[0]?.id !== stack.name) throw new Error('DISPOSABLE_IDENTITY_MISMATCH')
    console.log('Verified disposable target:', stack.name, JSON.stringify(stack.ports))
  }
  await assertDisposable()
  return { assertDisposable, stack, q, urls: stack.urls, close, createCompany, createRole, createUser, login, client, open, errors, root: `${stack.urls.web}/app/m/runly.purchases/purchases` }
}

// In-page scan (pass to page.evaluate): visible text inside <main> against
// what is painted under it; colors resolved through a canvas (oklch/lab ok).
// WCAG AA: 4.5, or 3 for large text.
export function contrastScan(rootSelector = null) {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255] }
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) }
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
  const backdrop = (el, rect) => {
    const chain = []
    for (const node of document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) {
      if (node !== el && el.contains(node)) continue
      const s = getComputedStyle(node)
      // A floating overlay (chat bubble) over the text at this scroll position: not a contrast pair.
      if (!node.contains(el) && (s.position === 'fixed' || node.closest('.chat-glass-theme'))) return null
      if (s.backgroundImage && s.backgroundImage !== 'none' && !s.backgroundImage.includes('gradient')) return null
      const c = rgba(s.backgroundColor); c[3] *= Number(s.opacity)
      if (c[3] > 0) chain.push(c)
      if (c[3] >= 1) break
    }
    let base = rgba(getComputedStyle(document.body).backgroundColor)
    if (base[3] < 1) base = [255, 255, 255, 1]
    for (const c of chain.reverse()) base = over(c, base)
    return base
  }
  const probe = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '*{pointer-events:auto!important}' }))
  const scrolled = [...document.querySelectorAll('*')].filter((n) => n.scrollTop).map((n) => [n, n.scrollTop])
  const walker = document.createTreeWalker((rootSelector && document.querySelector(rootSelector)) || document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set(), failures = []
  let scanned = 0
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement
    const text = walker.currentNode.textContent.trim()
    if (!text || !el || seen.has(el)) continue
    seen.add(el)
    let rect = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    if (!rect.width || !rect.height || s.visibility === 'hidden' || el.closest('[aria-hidden="true"],.sr-only,[disabled],.recharts-wrapper')) continue
    let opacity = 1
    for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity)
    if (opacity < 0.2) continue
    if (rect.bottom < 0 || rect.top > window.innerHeight) { el.scrollIntoView({ block: 'center' }); rect = el.getBoundingClientRect() }
    const bg = backdrop(el, rect)
    if (!bg) continue
    const fg = rgba(s.color); fg[3] *= opacity
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
    const value = ratio(over(fg, bg), bg)
    scanned++
    if (value < need) failures.push(`${value.toFixed(2)}<${need} "${text.slice(0, 40)}" <${el.tagName.toLowerCase()} ${String(el.className).slice(0, 70)}>`)
  }
  probe.remove()
  window.scrollTo(0, 0)
  for (const node of document.querySelectorAll('*')) if (node.scrollTop) node.scrollTop = 0
  for (const [node, top] of scrolled) node.scrollTop = top
  return { scanned, failures }
}

export const overflowX = () => document.scrollingElement.scrollWidth - window.innerWidth
