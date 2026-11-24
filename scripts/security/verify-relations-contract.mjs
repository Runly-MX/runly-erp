#!/usr/bin/env node
// F1B Stage 4: the relation contract of the declarative runtime against the
// REAL relation-targets service on a disposable stack: Contacts, HR and
// Inventory resolve through the owning module's own permission and company
// scope, never through its tables.
//   node scripts/security/verify-relations-contract.mjs [--keep]
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootSecurityStack, checks } from './lib/disposable-stack.mjs'

const KEY = 'custom.rel_probe'
const base = await mkdtemp(resolve('.tmp-relations-contract-'))
const runtimeDir = join(base, 'secure-modules')
await mkdir(runtimeDir, { recursive: true })
Object.assign(process.env, { RUNLY_SECURE_RUNTIME: 'experimental', RUNLY_SECURE_RUNTIME_MODULES_DIR: runtimeDir, RUNLY_SECURE_RUNTIME_FRAME_ANCESTORS: 'http://127.0.0.1:5173' })
const s = await bootSecurityStack().catch(async (e) => { await rm(base, { recursive: true, force: true }); throw e })
const { check, report } = checks()

const def = JSON.parse(readFileSync(new URL('../../apps/api/src/secure-runtime/fixtures/solicitudes/module.json', import.meta.url), 'utf8'))
def.key = KEY
def.name = 'Sonda de relaciones'
const px = 'rel_probe.solicitud'
def.permissions = { read: `${px}.read`, create: `${px}.create`, update: `${px}.update`, approve: `${px}.approve`, delete: `${px}.delete` }
def.entities[0].fields = [
  { key: 'titulo', type: 'text', label: 'Título', required: true },
  { key: 'contacto', type: 'relation', label: 'Contacto', target: 'external:contact' },
  { key: 'colaborador', type: 'relation', label: 'Colaborador', target: 'external:hr_employee' },
  { key: 'activo', type: 'relation', label: 'Activo', target: 'external:inventory_item' },
]
def.entities[0].states = undefined
delete def.entities[0].states
delete def.entities[0].automations
delete def.entities[0].validations
def.entities[0].views = { list: { columns: ['titulo'] }, form: { sections: [{ title: 'Solicitud', fields: ['titulo', 'contacto', 'colaborador', 'activo'] }] }, detail: { fields: ['titulo', 'contacto', 'colaborador', 'activo'] } }
delete def.extensions
delete def.navigation
def.capabilities = ['records.read', 'records.write', 'relations.resolve']

try {
  const adminRole = await s.adminRole()
  const A = await s.createCompany('Empresa A'), B = await s.createCompany('Empresa B')
  const adminA = await s.createUser('admin-a@example.com', 'Prueba-Rl-1', [[A, adminRole]])
  const owner = await s.createUser('owner@example.com', 'Prueba-Rl-2', [[B, adminRole]])
  await s.q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('platform_owner_profile_id',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1`, [owner.id])
  const tA = await s.login(adminA), tOwner = await s.login(owner)

  // A restricted role: the probe module's read permission only (no Contacts, HR or Inventory read).
  for (const key of Object.values(def.permissions)) await s.q(`INSERT INTO permission(id,key,name,active) VALUES(uuidv7(),$1,$1,true) ON CONFLICT(key) DO NOTHING`, [key])
  const roleWith = async (name, keys) => {
    const id = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,$2,$2,now()) RETURNING id`, [A, name])).rows[0].id
    for (const key of keys) await s.q(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key=$2`, [id, key])
    return id
  }
  const narrow = await s.createUser('estrecho@example.com', 'Prueba-Rl-3', [[A, await roleWith('rel_narrow', [def.permissions.read, def.permissions.create])]])
  const wide = await s.createUser('amplio@example.com', 'Prueba-Rl-4', [[A, await roleWith('rel_wide', [def.permissions.read, def.permissions.create, 'contacts.contacts.read', 'hr.employee.read', 'inventory.item.read'])]])
  const tN = await s.login(narrow), tW = await s.login(wide)

  // Directory data written straight to the owning tables (what those modules' own screens would create).
  const ins = async (table, cols, vals) => (await s.q(`INSERT INTO ${table}(id,${cols.join(',')},updated_at) VALUES(uuidv7(),${vals.map((_, i) => `$${i + 1}`).join(',')},now()) RETURNING id`, vals)).rows[0].id
  const contactA = await ins('contact', ['company_id', 'name', 'type'], [A, 'Proveedor Alfa', 'supplier'])
  const contactB = await ins('contact', ['company_id', 'name', 'type'], [B, 'Proveedor Beta (B)', 'supplier'])
  const empA = await ins('hr_employee', ['company_id', 'first_name', 'last_name'], [A, 'Ana', 'Ruiz'])
  const empGone = await ins('hr_employee', ['company_id', 'first_name', 'last_name'], [A, 'Baja', 'Lógica'])
  await s.q(`UPDATE hr_employee SET enabled=false WHERE id=$1`, [empGone])
  const empB = await ins('hr_employee', ['company_id', 'first_name', 'last_name'], [B, 'Beto', 'Otro'])
  const itemA = await ins('inv_item', ['company_id', 'name'], [A, 'Laptop de prueba'])
  const itemB = await ins('inv_item', ['company_id', 'name'], [B, 'Laptop de B'])
  await s.q(`INSERT INTO company_module(id,company_id,module_id,enabled,updated_at) SELECT uuidv7(),c,id,true,now() FROM runly_module, unnest($1::uuid[]) c WHERE key = ANY($2) ON CONFLICT DO NOTHING`, [[A, B], ['runly.contacts', 'runly.hr', 'runly.inventory']])
  await s.q(`UPDATE runly_module SET status='INSTALLED', enabled=true WHERE key = ANY($1)`, [['runly.contacts', 'runly.hr', 'runly.inventory']])

  await mkdir(join(runtimeDir, KEY), { recursive: true })
  await writeFile(join(runtimeDir, KEY, 'module.json'), JSON.stringify(def, null, 2))
  await promisify(execFile)(process.execPath, ['scripts/security/module-trust.mjs', 'approve', KEY, '--reviewed'], { env: { ...process.env, DIRECT_URL: s.dbUrl, RUNLY_MODULES_DIR: runtimeDir } })
  assert.equal((await s.client(tOwner, B)('PUT', `/secure-runtime/v1/modules/${KEY}/grants`, { capabilities: def.capabilities })).status, 200)
  const rt = (token, companyId, operation, args) => fetch(`${s.urls.api}/secure-runtime/v1/modules/${KEY}/call`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': companyId, 'content-type': 'application/json' }, body: JSON.stringify({ operation, args }) }).then(async (r) => ({ status: r.status, body: await r.json() }))
  const resolveOf = (token, company, field, ids) => rt(token, company, 'relations.resolve', { entity: 'solicitud', field, ids })

  await check('Contacts: own company resolves with id, label and subtitle only; another company does not', async () => {
    const r = await resolveOf(tW, A, 'contacto', [contactA, contactB])
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.deepEqual(r.body.data.map((x) => x.id), [contactA])
    assert.deepEqual(Object.keys(r.body.data[0]).sort(), ['id', 'label', 'subtitle'])
  })
  await check('HR: resolves active employees; deleted and other-company employees do not resolve', async () => {
    const r = await resolveOf(tW, A, 'colaborador', [empA, empGone, empB])
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.deepEqual(r.body.data.map((x) => x.id), [empA])
  })
  await check('Inventory: resolves own items only', async () => {
    const r = await resolveOf(tW, A, 'activo', [itemA, itemB])
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.deepEqual(r.body.data.map((x) => x.id), [itemA])
  })
  await check('search: filtered by text and bounded by limit', async () => {
    const hit = await rt(tW, A, 'relations.search', { entity: 'solicitud', field: 'colaborador', q: 'Ana', limit: 5 })
    assert.equal(hit.status, 200, JSON.stringify(hit.body)); assert.deepEqual(hit.body.data.map((x) => x.id), [empA])
    assert.deepEqual((await rt(tW, A, 'relations.search', { entity: 'solicitud', field: 'colaborador', q: 'Beto' })).body.data, [])
    assert.equal((await rt(tW, A, 'relations.search', { entity: 'solicitud', field: 'colaborador', q: '', limit: 51 })).status, 422)
  })
  await check('the consumer module permission and the target permission are both required', async () => {
    for (const field of ['contacto', 'colaborador', 'activo']) {
      // The owning module's resolver hides what the user cannot see: nothing leaves, not even existence.
      const r = await resolveOf(tN, A, field, [contactA, empA, itemA])
      assert.equal(r.status, 200, `${field}: ${JSON.stringify(r.body)}`)
      assert.deepEqual(r.body.data, [], `${field} leaked data`)
      const search = await rt(tN, A, 'relations.search', { entity: 'solicitud', field, q: '' })
      assert.equal(search.status, 403, `${field} search: ${JSON.stringify(search.body)}`)
    }
    // The consumer module permission is checked first: without its read permission nothing runs.
    const noModulePerm = await s.createUser('sin-modulo@example.com', 'Prueba-Rl-5', [[A, await roleWith('rel_none', ['contacts.contacts.read'])]])
    assert.equal((await resolveOf(await s.login(noModulePerm), A, 'contacto', [contactA])).status, 403)
  })
  await check('a target module disabled for the company, or not installed, is refused', async () => {
    await s.q(`UPDATE company_module SET enabled=false WHERE company_id=$1 AND module_id=(SELECT id FROM runly_module WHERE key='runly.hr')`, [A])
    const off = await resolveOf(tW, A, 'colaborador', [empA])
    assert.equal(off.status, 409); assert.equal(off.body.error, 'RELATION_TARGET_UNAVAILABLE')
    await s.q(`UPDATE company_module SET enabled=true WHERE company_id=$1 AND module_id=(SELECT id FROM runly_module WHERE key='runly.hr')`, [A])
    await s.q(`UPDATE runly_module SET status='DISABLED' WHERE key='runly.inventory'`)
    assert.equal((await resolveOf(tW, A, 'activo', [itemA])).body.error, 'RELATION_TARGET_UNAVAILABLE')
    await s.q(`UPDATE runly_module SET status='INSTALLED' WHERE key='runly.inventory'`)
    assert.equal((await resolveOf(tW, A, 'activo', [itemA])).status, 200)
  })
  await check('revoking the target permission applies on the next call', async () => {
    await s.q(`DELETE FROM role_permission WHERE role_id=(SELECT id FROM role WHERE key='rel_wide' AND company_id=$1) AND permission_id=(SELECT id FROM permission WHERE key='hr.employee.read')`, [A])
    assert.deepEqual((await resolveOf(tW, A, 'colaborador', [empA])).body.data, [])
    assert.equal((await rt(tW, A, 'relations.search', { entity: 'solicitud', field: 'colaborador', q: '' })).status, 403)
    assert.deepEqual((await resolveOf(tW, A, 'contacto', [contactA])).body.data.map((x) => x.id), [contactA])
  })
  await check('a relation field cannot be pointed at an arbitrary table or an undeclared target', async () => {
    assert.equal((await rt(tA, A, 'relations.resolve', { entity: 'solicitud', field: 'titulo', ids: [contactA] })).status, 422)
    assert.equal((await rt(tA, A, 'relations.resolve', { entity: 'solicitud', field: 'contacto', ids: [contactA], table: 'user_profile' })).status, 422)
  })
} finally {
  report()
  await s.close()
  await rm(base, { recursive: true, force: true })
}
