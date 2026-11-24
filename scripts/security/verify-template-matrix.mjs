#!/usr/bin/env node
// F1B Stage 4: the six Builder templates, each through the whole path on a
// disposable stack: publish (existing runtime) -> dry-run conversion ->
// explicit activation -> create/read/update/transition-free CRUD/soft delete/
// restore through the declarative runtime -> the existing runtime sees the
// same rows -> company isolation -> rollback. Output is a JSON matrix.
//   node scripts/security/verify-template-matrix.mjs [--out file.json] [--keep]
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootSecurityStack } from './lib/disposable-stack.mjs'
import { convertModuleDefinition } from '../../apps/api/src/secure-runtime/converter.js'

const TEMPLATES = ['visitas', 'prestamo-herramientas', 'mantenimiento', 'solicitudes', 'inventory-lite', 'simple-crud']
const outIndex = process.argv.indexOf('--out')
const base = await mkdtemp(resolve('.tmp-template-matrix-'))
const runtimeDir = join(base, 'secure-modules')
const modulesDir = join(base, 'external-modules')
await mkdir(runtimeDir, { recursive: true }); await mkdir(modulesDir, { recursive: true })
await mkdir(join(base, 'root', 'modules'), { recursive: true })
await writeFile(join(base, 'root', 'package.json'), '{}'); await writeFile(join(base, 'root', 'pnpm-workspace.yaml'), '')
Object.assign(process.env, { RUNLY_SECURE_RUNTIME: 'experimental', RUNLY_SECURE_RUNTIME_MODULES_DIR: runtimeDir, RUNLY_SECURE_RUNTIME_FRAME_ANCESTORS: 'http://127.0.0.1:5173', RUNLY_PROJECT_ROOT: join(base, 'root') })
const s = await bootSecurityStack({ modulesDir }).catch(async (e) => { await rm(base, { recursive: true, force: true }); throw e })
const matrix = []

const sampleFor = (field, seeds) => {
  if (field.options?.length) return field.options[0].value
  switch (field.type) {
    case 'number': case 'decimal': return 3
    case 'boolean': return true
    case 'date': return '2026-01-15'
    case 'datetime': return '2026-01-15T10:00:00.000Z'
    case 'email': return 'prueba@example.com'
    case 'phone': return '5551234567'
    case 'relation': return seeds[field.targetExternal] ?? null
    default: return `Valor ${field.key}`
  }
}

try {
  const adminRole = await s.adminRole()
  const A = await s.createCompany('Empresa A'), B = await s.createCompany('Empresa B')
  const adminA = await s.createUser('admin-a@example.com', 'Prueba-Tm-1', [[A, adminRole]])
  const adminB = await s.createUser('admin-b@example.com', 'Prueba-Tm-2', [[B, adminRole]])
  const owner = await s.createUser('owner@example.com', 'Prueba-Tm-3', [[B, adminRole]])
  await s.q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('platform_owner_profile_id',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1`, [owner.id])
  const tA = await s.login(adminA), tB = await s.login(adminB), tOwner = await s.login(owner)
  const apiA = s.client(tA, A), apiOwner = s.client(tOwner, B)
  const seed = async (table, cols, vals) => (await s.q(`INSERT INTO ${table}(id,${cols.join(',')},updated_at) VALUES(uuidv7(),${vals.map((_, i) => `$${i + 1}`).join(',')},now()) RETURNING id`, vals)).rows[0].id
  const seeds = {
    contact: await seed('contact', ['company_id', 'name', 'type'], [A, 'Contacto de prueba', 'person']),
    hr_employee: await seed('hr_employee', ['company_id', 'first_name', 'last_name'], [A, 'Ana', 'Prueba']),
    inventory_item: await seed('inv_item', ['company_id', 'name'], [A, 'Artículo de prueba']),
  }
  await s.q(`UPDATE runly_module SET status='INSTALLED', enabled=true WHERE key = ANY($1)`, [['runly.contacts', 'runly.hr', 'runly.inventory']])
  const rt = (key, token, companyId, operation, args) => fetch(`${s.urls.api}/secure-runtime/v1/modules/${key}/call`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': companyId, 'content-type': 'application/json' }, body: JSON.stringify({ operation, args }) }).then(async (r) => ({ status: r.status, body: await r.json() }))

  for (const [index, template] of TEMPLATES.entries()) {
    const slug = `tm_${index}`, key = `custom.${slug}`
    const row = { template, classification: null, install: null, preserved: 0, transformed: 0, review: [], unsupported: [], execution: null, legacyParity: null, isolation: null, rollback: null, failures: [] }
    matrix.push(row)
    const step = async (name, fn) => { try { return await fn() } catch (error) { row.failures.push(`${name}: ${String(error?.message ?? error).slice(0, 220)}`); return null } }
    const project = await step('crear proyecto', async () => (await apiA('POST', '/module-builder/projects', { name: `Matriz ${template}`, moduleKey: key, template })).body.data)
    if (!project) continue
    const published = await step('publicar', async () => apiA('POST', `/module-builder/projects/${project.id}/publish`, {}))
    row.install = published?.status === 200 ? 'ok' : `HTTP ${published?.status}`
    const tables = (await s.q(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE $1`, [`${slug}\\_%`])).rows.length
    if (!tables) row.failures.push('instalación sin tablas')
    const definition = (await apiA('GET', `/module-builder/projects/${project.id}`)).body.data.definition
    const converted = convertModuleDefinition(definition)
    row.classification = converted.classification
    for (const r of converted.report) { if (r.kind === 'preserved') row.preserved++; else if (r.kind === 'transformed') row.transformed++; else if (r.kind === 'review') row.review.push(`${r.path}: ${r.detail}`); else row.unsupported.push(`${r.path}: ${r.detail}`) }
    if (!converted.declarative) continue
    const entity = definition.entities[0]
    const data = Object.fromEntries(entity.fields.filter((f) => f.type !== 'file').map((f) => [f.key, sampleFor(f, seeds)]).filter(([, v]) => v !== null && v !== undefined))
    const legacyBase = `/${slug}/${entity.key}s`
    const legacyList = async (api) => { const r = await api('GET', legacyBase); return r.body?.data?.items ?? r.body?.data ?? [] }

    await mkdir(join(runtimeDir, key), { recursive: true })
    await writeFile(join(runtimeDir, key, 'module.json'), JSON.stringify(converted.declarative, null, 2))
    await promisify(execFile)(process.execPath, ['scripts/security/module-trust.mjs', 'approve', key, '--reviewed'], { env: { ...process.env, DIRECT_URL: s.dbUrl, RUNLY_MODULES_DIR: runtimeDir } })
    await apiOwner('PUT', `/secure-runtime/v1/modules/${key}/grants`, { capabilities: converted.declarative.capabilities })
    const E = converted.declarative.entities[0].key

    await step('ejecución', async () => {
      const created = await rt(key, tA, A, 'records.create', { entity: E, data })
      assert.equal(created.status, 200, `create ${created.status} ${JSON.stringify(created.body).slice(0, 160)}`)
      const id = created.body.data.id
      assert.equal((await rt(key, tA, A, 'records.get', { entity: E, id })).status, 200)
      const upd = await rt(key, tA, A, 'records.update', { entity: E, id, data: {}, expectedVersion: created.body.data.version })
      assert.equal(upd.status, 200, `update ${upd.status} ${JSON.stringify(upd.body).slice(0, 160)}`)
      assert.equal((await rt(key, tA, A, 'records.list', { entity: E })).body.data.length, 1)
      row.legacyParity = (await legacyList(apiA)).some((r) => r.id === id) ? 'ok' : 'el runtime actual no ve el registro'
      const del = await rt(key, tA, A, 'records.delete', { entity: E, id })
      assert.equal(del.status, 200, `delete ${del.status} ${JSON.stringify(del.body).slice(0, 160)}`)
      assert.ok(!(await legacyList(apiA)).some((r) => r.id === id), 'el runtime actual sigue listando el eliminado')
      assert.equal((await rt(key, tA, A, 'records.restore', { entity: E, id })).status, 200)
      assert.ok((await legacyList(apiA)).some((r) => r.id === id), 'restaurado no visible en el runtime actual')
      row.execution = 'ok'
      row.isolation = await step('aislamiento', async () => {
        const list = await rt(key, tB, B, 'records.list', { entity: E })
        const get = await rt(key, tB, B, 'records.get', { entity: E, id })
        const del = await rt(key, tB, B, 'records.delete', { entity: E, id })
        assert.deepEqual(list.body.data, []); assert.equal(get.body.error, 'NOT_FOUND'); assert.equal(del.body.error, 'NOT_FOUND')
        return 'ok'
      })
    })
    await step('rollback', async () => {
      await rm(join(runtimeDir, key), { recursive: true, force: true })
      assert.equal((await rt(key, tA, A, 'records.list', { entity: E })).body.error, 'MODULE_NOT_AVAILABLE')
      assert.equal((await legacyList(apiA)).length, 1)
      row.rollback = 'ok'
    })
  }
} finally {
  console.log(JSON.stringify(matrix, null, 2))
  if (outIndex > 0) await writeFile(process.argv[outIndex + 1], JSON.stringify(matrix, null, 2))
  await s.close()
  await rm(base, { recursive: true, force: true })
}
const bad = matrix.filter((r) => r.failures.length)
console.log(`${matrix.length - bad.length}/${matrix.length} templates without failures`)
process.exitCode = bad.length ? 1 : 0
