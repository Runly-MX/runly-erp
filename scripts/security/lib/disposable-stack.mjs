// Disposable Supabase + real API for security verification (F1B.0.8).
// Supabase runs in Docker (never the regular database), every migration and
// the seed are applied, and the API of this working tree starts on its own
// port. Nothing here touches ports 4010/5173. No web build, no browser.
//   const s = await bootSecurityStack({ modulesDir }); ...; await s.close()
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createStudioStack, command } from '../../fixtures/studio/supabase-stack.mjs'

const SERVICES = ['supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong']

export async function bootSecurityStack({ modulesDir = null, beforeApi = null, keep = process.argv.includes('--keep') } = {}) {
  const stack = await createStudioStack({ apiImage: 'runly-security-unused:local' })
  const q = (sql, params) => stack.pool.query(sql, params)
  let api = null
  const apiLog = []
  const close = async () => {
    api?.kill()
    await writeFile(join(stack.directory, 'api.log'), apiLog.join('')).catch(() => {})
    if (!keep) await stack.close()
  }
  try {
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', ...SERVICES], { log: join(stack.directory, 'startup.log') })
    await stack.verifyTarget()
    const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
    const env = { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl }
    const prismaCli = createRequire(resolve('package.json')).resolve('prisma/build/index.js')
    await command(process.execPath, [prismaCli, 'migrate', 'deploy'], { env, log: join(stack.directory, 'migrate.log') })
    await command(process.execPath, [resolve('prisma/seed.js')], { env, log: join(stack.directory, 'seed.log') })
    await q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('initialized','true',now()) ON CONFLICT(key) DO UPDATE SET value='true'`)
    // The installer prepares this storage guard as supabase_admin; the API refuses to boot without it.
    await stack.compose(['exec', '-T', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
      `CREATE OR REPLACE FUNCTION storage.runly_notes_require_private_bucket() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS
      'BEGIN IF NEW.id IN (''runly-notes'',''atlas-notes'') AND NEW.public THEN RAISE EXCEPTION ''NOTES_BUCKET_MUST_REMAIN_PRIVATE''; END IF; RETURN NEW; END;';
      CREATE TRIGGER runly_notes_bucket_private_v1 BEFORE INSERT OR UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.runly_notes_require_private_bucket();`], { log: join(stack.directory, 'notes-guard.log') })
    const { createClient } = createRequire(resolve('apps/api/package.json'))('@supabase/supabase-js')
    const admin = createClient(stack.urls.kong, stack.secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const ctx = { stack, q, dbUrl, admin }
    if (beforeApi) await beforeApi(ctx)
    const apiEnv = {
      NODE_ENV: 'production', RUNLY_API_PORT: String(stack.ports.api), DATABASE_URL: dbUrl, DIRECT_URL: dbUrl,
      SUPABASE_URL: stack.urls.kong, RUNLY_SUPABASE_PUBLIC_URL: stack.urls.kong, SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: stack.secret.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET,
      JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET, RUNLY_SKIP_DB_INIT: '1', CORS_ORIGIN: stack.urls.web, RUNLY_MCP_ENABLED: 'false',
      GROQ_API_KEY: '', TAVILY_API_KEY: '', LIVEKIT_URL: '', SMTP_HOST: '',
      ...(modulesDir ? { RUNLY_MODULES_DIR: modulesDir } : {}),
    }
    api = spawn(process.execPath, [resolve('apps/api/src/index.js')], { env: { ...process.env, ...apiEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
    api.stdout.on('data', (chunk) => apiLog.push(String(chunk))); api.stderr.on('data', (chunk) => apiLog.push(String(chunk)))
    let up = false
    for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(`${stack.urls.api}/health`)).ok } catch { /* booting */ } if (!up) await new Promise((r) => setTimeout(r, 500)) }
    if (!up) throw Error('API_DID_NOT_START (see api.log in the private stack directory)')

    async function createCompany(name) {
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now() % 100000}`
      return (await q(`INSERT INTO company(id,name,slug,updated_at) VALUES(uuidv7(),$1,$2,now()) RETURNING id`, [name, slug])).rows[0].id
    }
    const adminRole = async () => (await q(`SELECT id FROM role WHERE key='runly.admin' AND company_id IS NULL LIMIT 1`)).rows[0]?.id
    async function createUser(email, password, memberships) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) throw error
      const id = (await q(`INSERT INTO user_profile(id,auth_user_id,display_name,email,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id`, [data.user.id, email.split('@')[0], email])).rows[0].id
      for (const [companyId, roleId] of memberships) await q(`INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())`, [companyId, id, roleId])
      return { email, password, id }
    }
    async function login(who) {
      const res = await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: who.email, password: who.password }) })
      return (await res.json()).data?.access_token
    }
    function client(token, companyId) {
      return async (method, path, data) => {
        const res = await fetch(`${stack.urls.api}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': companyId, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) })
        return { status: res.status, body: await res.json().catch(() => null) }
      }
    }
    return { ...ctx, urls: stack.urls, close, createCompany, adminRole, createUser, login, client, apiLog }
  } catch (error) { await close(); throw error }
}

// Tiny PASS/FAIL runner shared by the verify scripts.
export function checks() {
  const results = []
  return {
    results,
    async check(name, fn) { try { await fn(); results.push(['PASS', name]) } catch (error) { results.push(['FAIL', name, String(error?.message ?? error).slice(0, 400)]) } },
    report() { for (const r of results) console.log(r.join(' | ')); const failed = results.filter((r) => r[0] === 'FAIL').length; console.log(`${results.length - failed}/${results.length} PASS`); if (failed) process.exitCode = 1 },
  }
}
