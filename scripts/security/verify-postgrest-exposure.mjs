#!/usr/bin/env node
// F1A/F1B acceptance for PostgREST exposure on a disposable Supabase stack
// (Docker required): every migration + seed, two fictitious companies, then
// real HTTP probes through Kong with the anon key and a company-A user JWT.
// Prints statuses and counts only, never row data.
//   node scripts/security/verify-postgrest-exposure.mjs [--keep]
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createStudioStack, command } from '../fixtures/studio/supabase-stack.mjs'
import { checks } from './lib/disposable-stack.mjs'

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
const jwt = (payload, secret) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), b = b64(payload); return `${h}.${b}.${createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url')}` }
// Tables PostgREST may serve to authenticated users on purpose (Realtime postgres_changes, RLS-governed).
const REALTIME_TABLES = ['call', 'call_participant', 'chat_attachments', 'chat_conversation_members', 'chat_conversations', 'chat_message_reads', 'chat_messages', 'notification']

const stack = await createStudioStack({ apiImage: 'runly-security-unused:local' })
const q = (sql, params) => stack.pool.query(sql, params)
const { check, report } = checks()
try {
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await stack.verifyTarget()
  const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
  const env = { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl }
  await command(process.execPath, [createRequire(resolve('package.json')).resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env, log: join(stack.directory, 'migrate.log') })
  await command(process.execPath, [resolve('prisma/seed.js')], { env, log: join(stack.directory, 'seed.log') })

  const authA = randomUUID()
  const [A, B] = (await q(`INSERT INTO company(name,slug,enabled,updated_at) VALUES ('Empresa A','empresa-a',true,now()),('Empresa B','empresa-b',true,now()) RETURNING id`)).rows
  const profile = (await q(`INSERT INTO user_profile(auth_user_id,email,display_name,enabled,updated_at) VALUES ($1,'a@example.com','Usuario A',true,now()) RETURNING id`, [authA])).rows[0]
  const role = (await q(`SELECT id FROM role WHERE key='runly.admin' LIMIT 1`)).rows[0]
  await q(`INSERT INTO membership(user_id,company_id,role_id,enabled,updated_at) VALUES ($1,$2,$3,true,now())`, [profile.id, A.id, role.id])
  for (const c of [A, B]) await q(`INSERT INTO contact(company_id,type,name,updated_at) VALUES ($1,'PERSON','Contacto',now())`, [c.id])

  const diagnostic = await stack.compose(['exec', '-T', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'], { input: await readFile(resolve('scripts/security/postgrest-exposure-diagnostic.sql'), 'utf8') })
  await writeFile(join(stack.directory, 'diagnostic.txt'), diagnostic)

  const anon = stack.secret.SUPABASE_ANON_KEY
  const user = jwt({ sub: authA, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 }, stack.secret.SUPABASE_JWT_SECRET)
  const rest = (pathname, bearer, init = {}) => fetch(`${stack.urls.kong}/rest/v1/${pathname}`, { ...init, headers: { apikey: anon, Authorization: `Bearer ${bearer}`, ...(init.body ? { 'content-type': 'application/json', Prefer: 'return=minimal' } : {}), ...init.headers } })
  const relations = (await q(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') ORDER BY 1`)).rows.map((r) => r.relname)
  const served = { anon: [], authenticated: [] }
  for (const table of relations) {
    if ((await rest(`${table}?select=*&limit=1`, anon)).status === 200) served.anon.push(table)
    if ((await rest(`${table}?select=*&limit=1`, user)).status === 200) served.authenticated.push(table)
  }

  await check(`anon key: none of the ${relations.length} public relations is served`, async () => assert.deepEqual(served.anon, []))
  await check('authenticated: only the RLS-governed Realtime tables are served', async () => assert.deepEqual(served.authenticated.filter((t) => !REALTIME_TABLES.includes(t)), []))
  await check('authenticated user of A cannot read company B contacts', async () => assert.notEqual((await rest(`contact?select=id&company_id=eq.${B.id}`, user)).status, 200))
  await check('anon cannot write business tables', async () => assert.ok([401, 403].includes((await rest('contact', anon, { method: 'POST', body: JSON.stringify({ company_id: B.id, type: 'PERSON', name: 'x' }) })).status)))
  await check('anon cannot write the migration history', async () => {
    const res = await rest('_prisma_migrations', anon, { method: 'POST', body: JSON.stringify({ id: randomUUID(), checksum: 'probe', migration_name: '29991231000000_probe', started_at: new Date().toISOString(), applied_steps_count: 1 }) })
    assert.ok([401, 403].includes(res.status), `status ${res.status}`)
    assert.equal((await q(`SELECT count(*)::int AS n FROM _prisma_migrations WHERE migration_name='29991231000000_probe'`)).rows[0].n, 0)
  })
  await check('anon cannot call the canvas access oracle', async () => assert.ok([401, 403, 404].includes((await rest('rpc/runly_canvas_user_access', anon, { method: 'POST', body: JSON.stringify({ p_board_id: randomUUID(), p_user_id: profile.id, p_edit: false }) })).status)))
  await check('diagnostic: no table exposed without RLS and history not insertable', async () => {
    assert.ok(!/EXPOSED_NO_RLS|RLS_PERMISSIVE_TRUE/.test(diagnostic), 'diagnostic section 4 lists an exposed relation')
    assert.match(diagnostic, /== 11\.[\s\S]*?\n\s*f\s*\|\s*f\s*\|/)
  })
} finally {
  report()
  if (!process.argv.includes('--keep')) await stack.close()
}
