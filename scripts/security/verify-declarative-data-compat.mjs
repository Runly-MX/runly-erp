#!/usr/bin/env node
// F1B Stage 3: data compatibility of the declarative runtime on a REAL
// Builder-published module (disposable Supabase + real API, flag on).
// The converted module reads and writes the module's existing RME3 table:
// same ids and rows from both runtimes, no copy, no second source of truth.
//   node scripts/security/verify-declarative-data-compat.mjs [--keep]
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootSecurityStack, checks } from './lib/disposable-stack.mjs'
import { convertModuleDefinition } from '../../apps/api/src/secure-runtime/converter.js'

const KEY = 'custom.dc_items', SLUG = 'dc_items'
const base = await mkdtemp(resolve('.tmp-declarative-compat-'))
const runtimeDir = join(base, 'secure-modules')
await mkdir(runtimeDir, { recursive: true })
Object.assign(process.env, { RUNLY_SECURE_RUNTIME: 'experimental', RUNLY_SECURE_RUNTIME_MODULES_DIR: runtimeDir, RUNLY_SECURE_RUNTIME_FRAME_ANCESTORS: 'http://127.0.0.1:5173' })
// Modules live OUTSIDE the project root (RUNLY_MODULES_DIR), like a supported
// external configuration: install must find the folder, create the tables and
// never report success without them (F1B Stage 4 regression).
const modulesDir = join(base, 'external-modules')
process.env.RUNLY_PROJECT_ROOT = join(base, 'root')
await mkdir(join(base, 'root', 'modules'), { recursive: true })
await writeFile(join(base, 'root', 'package.json'), '{}')
await writeFile(join(base, 'root', 'pnpm-workspace.yaml'), '')
await mkdir(modulesDir, { recursive: true })
const s = await bootSecurityStack({ modulesDir }).catch(async (e) => { await rm(base, { recursive: true, force: true }); throw e })
const { check, report } = checks()
try {
  const adminRole = await s.adminRole()
  const A = await s.createCompany('Empresa A'), B = await s.createCompany('Empresa B')
  const adminA = await s.createUser('admin-a@example.com', 'Prueba-Dc-1', [[A, adminRole]])
  const adminB = await s.createUser('admin-b@example.com', 'Prueba-Dc-2', [[B, adminRole]])
  const owner = await s.createUser('owner@example.com', 'Prueba-Dc-3', [[B, adminRole]])
  await s.q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('platform_owner_profile_id',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1`, [owner.id])
  const tA = await s.login(adminA), tB = await s.login(adminB), tOwner = await s.login(owner)
  const apiA = s.client(tA, A), apiB = s.client(tB, B)
  const rt = (token, companyId, operation, args, headers = {}) => fetch(`${s.urls.api}/secure-runtime/v1/modules/${KEY}/call`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': companyId, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ operation, args }) }).then(async (r) => ({ status: r.status, body: await r.json() }))

  // 1. A real Builder module with data written by the existing runtime.
  const project = (await apiA('POST', '/module-builder/projects', { name: 'Artículos DC', moduleKey: KEY, template: 'simple-crud' })).body.data
  assert.equal((await apiA('POST', `/module-builder/projects/${project.id}/publish`, {})).status, 200)
  const definition = (await apiA('GET', `/module-builder/projects/${project.id}`)).body.data.definition
  const entity = definition.entities[0]
  const textField = entity.fields.find((f) => f.type === 'text').key
  const oldList = async (api) => { const r = await api('GET', `/${SLUG}/${entity.key}s`); return r.body?.data?.items ?? r.body?.data ?? [] }
  await s.q(`INSERT INTO company_module(company_id,module_id,enabled) SELECT $1,id,true FROM runly_module WHERE key=$2 ON CONFLICT DO NOTHING`, [B, KEY])
  for (const title of ['Uno', 'Dos']) { const r = await apiA('POST', `/${SLUG}/${entity.key}s`, { [textField]: title }); assert.ok(r.status < 300, `existing runtime create: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`) }
  const before = await oldList(apiA)
  const companyModulesBefore = (await s.q(`SELECT cm.company_id, cm.enabled FROM company_module cm JOIN runly_module m ON m.id=cm.module_id WHERE m.key=$1 ORDER BY cm.company_id`, [KEY])).rows
  const rowsBefore = (await s.q(`SELECT count(*)::int AS n FROM ${SLUG}_${entity.key}`)).rows[0].n

  // 2. Dry-run conversion (pure), then explicit activation: package + review + grant.
  const converted = convertModuleDefinition(definition)
  await check('dry-run conversion is pure and classifies the module', async () => {
    assert.ok(['FULLY_DECLARATIVE', 'DECLARATIVE_WITH_REVIEW'].includes(converted.classification), converted.classification)
    assert.equal((await s.q(`SELECT count(*)::int AS n FROM ${SLUG}_${entity.key}`)).rows[0].n, rowsBefore)
    assert.equal(converted.declarative.entities[0].table, `${SLUG}_${entity.key}`)
  })
  await mkdir(join(runtimeDir, KEY), { recursive: true })
  await writeFile(join(runtimeDir, KEY, 'module.json'), JSON.stringify(converted.declarative, null, 2))
  await promisify(execFile)(process.execPath, ['scripts/security/module-trust.mjs', 'approve', KEY, '--reviewed'], { env: { ...process.env, DIRECT_URL: s.dbUrl, RUNLY_MODULES_DIR: runtimeDir } })
  assert.equal((await s.client(tOwner, B)('PUT', `/secure-runtime/v1/modules/${KEY}/grants`, { capabilities: ['records.read', 'records.write'] })).status, 200)

  await check('same rows and ids through both runtimes (existing table, no copy)', async () => {
    const viaRuntime = (await rt(tA, A, 'records.list', { entity: entity.key, limit: 50 })).body.data
    assert.deepEqual(viaRuntime.map((r) => r.id).sort(), before.map((r) => r.id).sort())
    assert.deepEqual(viaRuntime.map((r) => r.data[textField]).sort(), ['Dos', 'Uno'])
  })
  let createdId
  await check('a write through the declarative runtime is visible to the existing runtime, and back', async () => {
    const created = await rt(tA, A, 'records.create', { entity: entity.key, data: { [textField]: 'Tres' } })
    assert.equal(created.status, 200, JSON.stringify(created.body)); createdId = created.body.data.id
    assert.ok((await oldList(apiA)).some((r) => r.id === createdId && r[textField] === 'Tres'))
    const v = created.body.data.version
    assert.equal((await rt(tA, A, 'records.update', { entity: entity.key, id: createdId, data: { [textField]: 'Tres bis' }, expectedVersion: v })).status, 200)
    assert.ok((await oldList(apiA)).some((r) => r.id === createdId && r[textField] === 'Tres bis'))
    assert.equal((await apiA('PATCH', `/${SLUG}/${entity.key}s/${createdId}`, { [textField]: 'Tres desde la API anterior' })).status < 300, true)
    assert.equal((await rt(tA, A, 'records.get', { entity: entity.key, id: createdId })).body.data.data[textField], 'Tres desde la API anterior')
  })
  await check('optimistic concurrency: a stale version is refused', async () => {
    const r = await rt(tA, A, 'records.update', { entity: entity.key, id: createdId, data: { [textField]: 'x' }, expectedVersion: '2000-01-01T00:00:00.000000Z' })
    assert.equal(r.status, 409); assert.equal(r.body.error, 'VERSION_CONFLICT')
  })
  await check('company isolation holds on the shared table', async () => {
    assert.equal((await rt(tB, B, 'records.list', { entity: entity.key })).body.data.length, 0)
    assert.equal((await rt(tB, B, 'records.get', { entity: entity.key, id: createdId })).body.error, 'NOT_FOUND')
    const own = await rt(tB, B, 'records.create', { entity: entity.key, data: { [textField]: 'De B' } })
    assert.equal(own.status, 200)
    assert.ok(!(await oldList(apiA)).some((r) => r.id === own.body.data.id))
  })
  await check('permissions match the existing runtime (same permission keys)', async () => {
    const readKey = converted.declarative.entities[0].permissions.read
    const viewerRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'dc_viewer','Lector',now()) RETURNING id`, [A])).rows[0].id
    await s.q(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key=$2`, [viewerRole, readKey])
    const viewer = await s.createUser('lector-a@example.com', 'Prueba-Dc-4', [[A, viewerRole]])
    const tV = await s.login(viewer)
    assert.equal((await rt(tV, A, 'records.list', { entity: entity.key })).status, 200)
    assert.equal((await rt(tV, A, 'records.create', { entity: entity.key, data: { [textField]: 'x' } })).body.error, 'PERMISSION_DENIED')
    assert.equal((await s.client(tV, A)('POST', `/${SLUG}/${entity.key}s`, { [textField]: 'x' })).status, 403)
  })
  await check('company settings are untouched', async () => {
    const after = (await s.q(`SELECT cm.company_id, cm.enabled FROM company_module cm JOIN runly_module m ON m.id=cm.module_id WHERE m.key=$1 ORDER BY cm.company_id`, [KEY])).rows
    assert.deepEqual(after, companyModulesBefore)
  })
  await check('soft delete and restore on the existing table, with business history and correlated audit', async () => {
    const tmp = (await rt(tA, A, 'records.create', { entity: entity.key, data: { [textField]: 'Para borrar' } })).body.data
    const del = await rt(tA, A, 'records.delete', { entity: entity.key, id: tmp.id, expectedVersion: tmp.version })
    assert.equal(del.status, 200, JSON.stringify(del.body))
    assert.match(del.body.correlationId, /^[0-9a-f-]{36}$/)
    assert.equal((await rt(tA, A, 'records.get', { entity: entity.key, id: tmp.id })).body.error, 'NOT_FOUND')
    assert.ok(!(await oldList(apiA)).some((r) => r.id === tmp.id), 'the existing runtime no longer lists it')
    const row = (await s.q(`SELECT enabled FROM ${SLUG}_${entity.key} WHERE id=$1`, [tmp.id])).rows[0]
    assert.equal(row.enabled, false, 'the row stays, enabled = false')
    assert.equal((await rt(tB, B, 'records.restore', { entity: entity.key, id: tmp.id })).body.error, 'NOT_FOUND', 'another company cannot restore it')
    assert.equal((await rt(tA, A, 'records.restore', { entity: entity.key, id: tmp.id })).status, 200)
    assert.ok((await oldList(apiA)).some((r) => r.id === tmp.id), 'visible again in the existing runtime')
    const audit = (await s.q(`SELECT action, after FROM audit_log WHERE module_key=$1 AND action IN ('runtime.records.delete','runtime.records.restore') AND company_id=$2`, [KEY, A])).rows
    assert.equal(audit.length, 2)
    for (const a of audit) { const d = typeof a.after === 'string' ? JSON.parse(a.after) : a.after; assert.equal(d.result, 'ok'); assert.ok(d.correlationId && d.moduleRevision && d.at) }
    const activity = (await s.q(`SELECT type, entity_id, actor_id FROM activity WHERE company_id=$1 AND type LIKE $2 AND entity_id=$3`, [A, `module.${KEY}.%`, tmp.id])).rows
    assert.deepEqual(activity.map((r) => r.type).sort(), ['create', 'delete', 'restore'].map((v) => `module.${KEY}.${entity.key}.${v}`).sort())
    assert.ok(activity.every((r) => r.actor_id === adminA.id), 'the actor is the real user, set by the host')
    await rt(tA, A, 'records.delete', { entity: entity.key, id: tmp.id }) // leave the table as the rollback check expects
  })
  await check('rollback: removing the declarative package keeps every row and the existing runtime', async () => {
    await rm(join(runtimeDir, KEY), { recursive: true, force: true })
    assert.equal((await rt(tA, A, 'records.list', { entity: entity.key })).body.error, 'MODULE_NOT_AVAILABLE')
    const rows = await oldList(apiA)
    assert.ok(rows.some((r) => r.id === createdId))
    assert.equal(rows.length, 3)
    assert.equal((await s.q(`SELECT count(*)::int AS n FROM ${SLUG}_${entity.key}`)).rows[0].n, 5)
  })
} finally {
  report()
  await s.close()
  await rm(base, { recursive: true, force: true })
}
