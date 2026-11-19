// Disposable full stack for runly.bookings verification: Supabase in Docker
// (never the regular database), every migration + the regular seed, and the API
// and web of the working tree on their own ports. Nothing touches 4010/5173.
//   const s = await bootBookingsStack(); ...; await s.close()
// env: extra API variables, or a function of the stack (its ports) returning them.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { createStudioStack, command } from '../studio/supabase-stack.mjs'

export const LINK_SECRET = 'bookings-verification-link-secret'

export async function bootBookingsStack({ keep = false, env: extraEnv = {} } = {}) {
  const stack = await createStudioStack({ apiImage: process.env.RUNLY_STACK_API_IMAGE || 'runly-studio-combined:api' })
  const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
  const q = (sql, params) => stack.pool.query(sql, params)
  let api, web, browser
  const apiLog = []
  const close = async () => {
    await browser?.close().catch(() => {})
    if (web) { web.httpServer.closeAllConnections(); await new Promise((done) => web.httpServer.close(done)) }
    api?.kill()
    if (!keep) await stack.close()
  }
  const apiEnv = {
    NODE_ENV: 'production', RUNLY_API_PORT: String(stack.ports.api), DATABASE_URL: dbUrl, DIRECT_URL: dbUrl,
    SUPABASE_URL: stack.urls.kong, RUNLY_SUPABASE_PUBLIC_URL: stack.urls.kong, SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: stack.secret.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET,
    JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET, BOOKINGS_LINK_SECRET: LINK_SECRET, RUNLY_SKIP_DB_INIT: '1',
    CORS_ORIGIN: stack.urls.web, PUBLIC_APP_URL: stack.urls.web, RUNLY_MCP_ENABLED: 'false',
    GROQ_API_KEY: '', TAVILY_API_KEY: '', LIVEKIT_URL: '', SMTP_HOST: '', ...(typeof extraEnv === 'function' ? extraEnv(stack) : extraEnv),
  }
  try {
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
    await stack.verifyTarget()
    const prismaCli = createRequire(resolve('package.json')).resolve('prisma/build/index.js')
    const env = { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl }
    await command(process.execPath, [prismaCli, 'migrate', 'deploy'], { env, log: join(stack.directory, 'migrate.log') })
    await command(process.execPath, [resolve('prisma/seed.js')], { env, log: join(stack.directory, 'seed.log') })
    await q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('initialized','true',now()) ON CONFLICT(key) DO UPDATE SET value='true'`)
    await stack.compose(['exec', '-T', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
      `CREATE OR REPLACE FUNCTION storage.runly_notes_require_private_bucket() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS
      'BEGIN IF NEW.id IN (''runly-notes'',''atlas-notes'') AND NEW.public THEN RAISE EXCEPTION ''NOTES_BUCKET_MUST_REMAIN_PRIVATE''; END IF; RETURN NEW; END;';
      CREATE TRIGGER runly_notes_bucket_private_v1 BEFORE INSERT OR UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.runly_notes_require_private_bucket();`], { log: join(stack.directory, 'notes-guard.log') })

    api = spawn(process.execPath, [resolve('apps/api/src/index.js')], { env: { ...process.env, ...apiEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
    api.stdout.on('data', (chunk) => apiLog.push(String(chunk))); api.stderr.on('data', (chunk) => apiLog.push(String(chunk)))
    let up = false
    for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(`${stack.urls.api}/health`)).ok } catch { /* booting */ } if (!up) await new Promise((r) => setTimeout(r, 500)) }
    if (!up) throw new Error(`API did not start:\n${apiLog.join('').slice(-2000)}`)

    const require = createRequire(resolve('apps/desktop/package.json'))
    for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
    const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
    const config = {
      base: '/', root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: stack.directory, logLevel: 'error',
      define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
      build: { outDir: join(stack.directory, 'web'), emptyOutDir: true }, preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true },
    }
    await build(config); web = await preview(config)
  } catch (error) { await close(); throw error }

  const { createClient } = createRequire(resolve('apps/api/package.json'))('@supabase/supabase-js')
  const admin = createClient(stack.urls.kong, stack.secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const run = Date.now() % 100000

  async function createCompany(name) {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${run}`
    return (await q(`INSERT INTO company(id,name,slug,updated_at) VALUES(uuidv7(),$1,$2,now()) RETURNING id`, [name, slug])).rows[0].id
  }
  async function createRole(companyId, key, permissions) {
    const id = (await q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,$2,$2,now()) RETURNING id`, [companyId, `${key}-${run}`])).rows[0].id
    if (permissions.length) await q(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key = ANY($2::text[])`, [id, permissions])
    return id
  }
  async function createUser(email, password, companyId, roleId, name) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    const id = (await q(`INSERT INTO user_profile(id,auth_user_id,display_name,email,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id`, [data.user.id, name, email])).rows[0].id
    await q(`INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())`, [companyId, id, roleId])
    return { id, email, password, name }
  }
  async function login(who) {
    const res = await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: who.email, password: who.password }) })
    return (await res.json()).data?.access_token
  }
  function client(token, companyId) {
    return async (method, path, data, headers = {}) => {
      const res = await fetch(`${stack.urls.api}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(companyId ? { 'X-Runly-Company-Id': companyId } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) })
      return { status: res.status, body: await res.json().catch(() => null) }
    }
  }
  async function newContext({ phone = false, dark = false } = {}) {
    browser ??= await chromium.launch()
    return browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 950 }, locale: 'es-MX', timezoneId: 'America/Mexico_City',
      colorScheme: dark ? 'dark' : 'light', ...(phone ? { isMobile: true, hasTouch: true } : {}),
    })
  }
  async function loginPage(who, companyId, options = {}) {
    const context = await newContext(options)
    await context.addInitScript(([id, isDark]) => { try { localStorage.setItem('runly-active-company', id); localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark }, version: 0 })) } catch { /* ignore */ } }, [companyId, Boolean(options.dark)])
    const page = await context.newPage()
    await page.goto(`${stack.urls.web}/app/login`)
    await page.locator('#identifier').fill(who.email); await page.locator('#password').fill(who.password)
    await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
    return page
  }

  return { stack, dbUrl, q, urls: stack.urls, apiEnv, apiLog, close, createCompany, createRole, createUser, login, client, newContext, loginPage, run }
}
