#!/usr/bin/env node
// F1A + F1B acceptance for module code authority and quarantine, on a
// disposable stack (Docker required). Usage:
//   node scripts/security/verify-module-security.mjs [--keep]
// Every "canary" is inert: it only appends a letter to a file in a temporary
// directory if module code is ever executed, so a run proves what did and did
// not execute without doing anything harmful.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootSecurityStack, checks } from './lib/disposable-stack.mjs'

const JSZip = createRequire(resolve('apps/api/package.json'))('jszip')
const modulesDir = await mkdtemp(resolve('.tmp-security-modules-'))
const canary = join(modulesDir, 'canary.txt')
const ran = () => readFile(canary, 'utf8').catch(() => '')
const LEGACY = 'custom.legacyprobe'
const manifestSource = (key, mark) => `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(canary)}, '${mark}')\nimport { defineRunlyModule } from '@runly/module-engine'\nexport default defineRunlyModule({ key: '${key}', name: 'Sonda', version: '0.1.0', kind: 'FEATURE', icon: 'Package', color: '#2563EB', pwa: { shortName: 'Sonda', startPath: '/inicio' }, dependencies: [], models: [], views: [], permissions: [], navigation: [] })\n`

const s = await bootSecurityStack({
  modulesDir,
  // A module installed before F1A/F1B: code on disk, rows in the database, no trust record.
  beforeApi: async ({ q }) => {
    await mkdir(join(modulesDir, LEGACY, 'api'), { recursive: true })
    await writeFile(join(modulesDir, LEGACY, 'module.manifest.js'), manifestSource(LEGACY, 'L'))
    await writeFile(join(modulesDir, LEGACY, 'api', 'index.js'), `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(canary)}, 'R')\nimport { Hono } from 'hono'\nexport default () => { const app = new Hono(); app.get('/legacyprobe/ping', (c) => c.json({ ok: true })); return app }\n`)
    const manifest = { key: LEGACY, name: 'Sonda', version: '0.1.0', kind: 'FEATURE', permissions: [], navigation: [], dependencies: [] }
    await q(`INSERT INTO runly_module(id,key,name,version,kind,status,enabled,manifest,updated_at) VALUES (uuidv7(),$1,'Sonda','0.1.0','FEATURE','INSTALLED',true,$2,now())`, [LEGACY, JSON.stringify(manifest)])
  },
}).catch(async (error) => { await rm(modulesDir, { recursive: true, force: true }); throw error })
const { check, report } = checks()
try {
  const adminRole = await s.adminRole()
  const A = await s.createCompany('Empresa A'), B = await s.createCompany('Empresa B')
  await s.q(`INSERT INTO company_module(company_id,module_id,enabled) SELECT $1,id,true FROM runly_module WHERE key=$2`, [A, LEGACY])
  const adminA = await s.createUser('admin-a@example.com', 'Prueba-Seg-1', [[A, adminRole]])
  const owner = await s.createUser('owner@example.com', 'Prueba-Seg-2', [[B, adminRole]])
  await s.q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('platform_owner_profile_id',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1`, [owner.id])
  await s.q(`INSERT INTO contact(id,company_id,type,name,updated_at) VALUES (uuidv7(),$1,'PERSON','Contacto A',now()),(uuidv7(),$2,'PERSON','Contacto B',now())`, [A, B])
  const apiA = s.client(await s.login(adminA), A)
  const apiOwner = s.client(await s.login(owner), B)
  const upload = async (token, companyId, key, route = 'upload') => {
    const zip = new JSZip(); zip.file('module.manifest.js', manifestSource(key, 'U'))
    const form = new FormData(); form.append('file', new Blob([await zip.generateAsync({ type: 'nodebuffer' })], { type: 'application/zip' }), `${key}.zip`)
    const res = await fetch(`${s.urls.api}/modules/${key}/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': companyId }, body: form })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const tokenA = await s.login(adminA), tokenOwner = await s.login(owner)

  await check('legacy module: quarantined at boot, none of its code ran', async () => {
    assert.equal(await ran(), '')
    const trust = await apiA('GET', `/modules/${LEGACY}/trust`)
    assert.equal(trust.status, 200); assert.equal(trust.body.data.state, 'quarantined'); assert.equal(trust.body.data.reason, 'NO_TRUST_RECORD')
  })
  await check('legacy module: its routes are not mounted and its bundle is not served', async () => {
    assert.notEqual((await apiA('GET', '/legacyprobe/ping')).status, 200)
    assert.equal((await fetch(`${s.urls.api}/modules/${LEGACY}/bundle.js`)).status, 423)
  })
  await check('legacy module: data and installation are preserved', async () => {
    const row = (await s.q(`SELECT status::text, enabled FROM runly_module WHERE key=$1`, [LEGACY])).rows[0]
    assert.equal(row.status, 'INSTALLED'); assert.equal(row.enabled, true)
    assert.equal((await s.q(`SELECT count(*)::int AS n FROM company_module cm JOIN runly_module m ON m.id=cm.module_id WHERE m.key=$1 AND cm.enabled`, [LEGACY])).rows[0].n, 1)
  })
  await check('inventory tool classifies the legacy module for owner review without running it', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/security/module-trust.mjs', 'inventory', '--json'], { env: { ...process.env, DIRECT_URL: s.dbUrl, RUNLY_MODULES_DIR: modulesDir } })
    const row = JSON.parse(stdout).find((r) => r.key === LEGACY)
    assert.equal(row.verdict, 'OWNER_CODE_REVIEW'); assert.deepEqual(row.backendCode, ['api/index.js']); assert.equal(row.companiesEnabled, 1)
    assert.equal(await ran(), '')
  })
  await check('company admin cannot approve a quarantined module', async () => {
    const r = await apiA('POST', `/modules/${LEGACY}/trust`, { decision: 'approve' })
    assert.equal(r.status, 403); assert.equal(r.body.error, 'MODULE_CODE_AUTHORITY_REQUIRED'); assert.equal(await ran(), '')
  })
  await check('company admin: ZIP upload and check are 403 and the package never runs', async () => {
    for (const route of ['upload', 'upload/check']) {
      const r = await upload(tokenA, A, 'custom.adminprobe', route)
      assert.equal(r.status, 403); assert.equal(r.body.error, 'MODULE_CODE_AUTHORITY_REQUIRED')
    }
    assert.ok(!(await ran()).includes('U'))
  })
  let projectId
  await check('company admin: declarative Builder module publishes and is trusted as compiler output', async () => {
    const created = await apiA('POST', '/module-builder/projects', { name: 'Registro', moduleKey: 'custom.sec_registro', template: 'simple-crud' })
    assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 300)); projectId = created.body.data.id
    const published = await apiA('POST', `/module-builder/projects/${projectId}/publish`, {})
    assert.equal(published.status, 200, JSON.stringify(published.body).slice(0, 300))
    const trust = await apiA('GET', '/modules/custom.sec_registro/trust')
    assert.equal(trust.body.data.state, 'trusted'); assert.equal(trust.body.data.authority, 'builder-compiler')
  })
  await check('Builder: a client cannot add extension code (server-imported custom view)', async () => {
    const project = (await apiA('GET', `/module-builder/projects/${projectId}`)).body.data
    const definition = { ...project.definition, extensions: { files: [{ path: 'views/x.custom.js', content: `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(canary)}, 'X')\nexport default {}\n` }], views: [{ file: 'views/x.custom.js' }] } }
    const r = await apiA('PATCH', `/module-builder/projects/${projectId}`, { definition })
    assert.equal(r.status, 403); assert.equal(r.body.error ?? r.body.code, 'BUILDER_EXTENSIONS_READ_ONLY')
    assert.ok(!(await ran()).includes('X'))
  })
  await check('Builder: a quote-closing field default stays data (no code at staging)', async () => {
    const project = (await apiA('GET', `/module-builder/projects/${projectId}`)).body.data
    const definition = structuredClone(project.definition)
    definition.entities[0].fields[0].default = `x' + (await import('node:fs')).appendFileSync(${JSON.stringify(canary)}, 'D') + '`
    assert.equal((await apiA('PATCH', `/module-builder/projects/${projectId}`, { definition })).status, 200)
    const published = await apiA('POST', `/module-builder/projects/${projectId}/publish`, {})
    assert.ok([200, 409, 422].includes(published.status), `publish ${published.status}`)
    assert.ok(!(await ran()).includes('D'))
  })
  await check('platform owner: ZIP upload is accepted and trusted', async () => {
    const r = await upload(tokenOwner, B, 'custom.ownerprobe')
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300))
    assert.equal((await apiOwner('GET', '/modules/custom.ownerprobe/trust')).body.data.authority, 'platform-owner')
  })
  await check('platform owner: approving the reviewed legacy module lets it run again', async () => {
    const r = await apiOwner('POST', `/modules/${LEGACY}/trust`, { decision: 'approve' })
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.data.state, 'trusted')
    assert.match(await ran(), /R/)
  })
  await check('official modules keep working', async () => {
    assert.equal((await apiA('GET', '/modules')).status, 200)
    assert.equal((await apiA('GET', '/runtime/modules')).status, 200)
  })
  await check('two companies: admin A cannot select company B and only sees A contacts', async () => {
    assert.ok([400, 403].includes((await s.client(tokenA, B)('GET', '/contacts')).status))
    const body = (await apiA('GET', '/contacts')).body; const rows = body.data?.items ?? body.data ?? []
    assert.ok(rows.some((c) => c.name === 'Contacto A')); assert.ok(!rows.some((c) => c.name === 'Contacto B'))
  })
} finally {
  report()
  await s.close()
  await rm(modulesDir, { recursive: true, force: true })
}
