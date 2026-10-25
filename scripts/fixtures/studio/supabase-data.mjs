import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
const { createClient } = createRequire(new URL('../../../apps/api/package.json', import.meta.url))('@supabase/supabase-js')

export async function seedStudioScenario(stack) {
  const { pool, name } = stack
  assert.equal((await pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id, name)
  const admin = createClient(stack.urls.kong, stack.secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const password = `Test-${randomBytes(18).toString('hex')}!`
  const users = []
  for (const label of ['owner', 'denied', 'peer', 'foreign']) {
    const email = `${label}@studio.example.test`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    const profile = (await pool.query(`INSERT INTO public.user_profile(id,auth_user_id,display_name,email,updated_at)
      VALUES (uuidv7(),$1,$2,$3,now()) RETURNING id`, [data.user.id, `Studio ${label}`, email])).rows[0]
    users.push({ ...profile, authId: data.user.id, email, password })
  }
  const companies = []
  for (const label of ['A', 'B']) {
    const company = (await pool.query(`INSERT INTO public.company(id,name,slug,updated_at)
      VALUES(uuidv7(),$1,$2,now()) RETURNING id,name`, [`Studio Test ${label}`, `studio-test-${label.toLowerCase()}`])).rows[0]
    const role = (await pool.query(`INSERT INTO public.role(id,company_id,key,name,updated_at)
      VALUES(uuidv7(),$1,'studio.test.editor','Editor de pruebas',now()) RETURNING id`, [company.id])).rows[0]
    await pool.query(`INSERT INTO public.role_permission(id,role_id,permission_id)
      SELECT uuidv7(),$1,id FROM public.permission WHERE key LIKE 'studio.%' OR key IN ('files.access','files.assets.read','files.assets.create')`, [role.id])
    await pool.query(`INSERT INTO public.membership(id,company_id,user_id,role_id,updated_at)
      VALUES(uuidv7(),$1,$2,$3,now())`, [company.id, users[0].id, role.id])
    companies.push({ ...company, roleId: role.id })
  }
  for (const [index, roleId] of [[1, null], [2, companies[0].roleId]]) await pool.query(`INSERT INTO public.membership(id,company_id,user_id,role_id,updated_at)
    VALUES(uuidv7(),$1,$2,$3,now())`, [companies[0].id, users[index].id, roleId])
  await pool.query(`INSERT INTO public.membership(id,company_id,user_id,role_id,updated_at)
    VALUES(uuidv7(),$1,$2,$3,now())`, [companies[1].id, users[3].id, companies[1].roleId])
  await pool.query(`UPDATE public.runly_module SET enabled=true,status='INSTALLED' WHERE key IN ('runly.studio','runly.files')`)
  await pool.query(`INSERT INTO public.instance_config(key,value,updated_at) VALUES ('initialized','true',now())
    ON CONFLICT(key) DO UPDATE SET value='true'`)
  return { users, companies, admin }
}
