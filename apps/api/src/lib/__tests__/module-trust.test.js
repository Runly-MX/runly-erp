// F1B.1: installed custom module code runs only when its exact bytes are trusted.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { configureModuleTrust, decideModuleTrust, isQuarantinedCustomModule, moduleTrustStatus, trustModulePackage, MODULE_TRUST_PREFIX } from '../module-trust.js'
import { loadModuleManifest } from '../../services/module-discovery-service.js'
import { importModuleFile } from '../module-import-revision.js'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const KEY = 'custom.trustprobe'

function fakePrisma() {
  const rows = new Map()
  return {
    rows,
    instanceConfig: {
      findUnique: async ({ where }) => (rows.has(where.key) ? { value: rows.get(where.key) } : null),
      upsert: async ({ where, create, update }) => { rows.set(where.key, rows.has(where.key) ? update.value : create.value) },
    },
  }
}

async function setup(t) {
  const modulesDir = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-trust-'))
  const prisma = fakePrisma()
  let clock = 0
  configureModuleTrust({ prisma, modulesDir, now: () => (clock += 60_000) }) // every read is past the record cache
  t.after(async () => { configureModuleTrust({ prisma: null, modulesDir: null }); await fs.rm(modulesDir, { recursive: true, force: true }) })
  const dir = path.join(modulesDir, KEY)
  const canary = path.join(modulesDir, 'ran.txt')
  await fs.mkdir(path.join(dir, 'api'), { recursive: true })
  // Inert canary: writes a marker only if the code is ever imported.
  const manifest = `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(canary)}, 'm')\nimport { defineRunlyModule } from '@runly/module-engine'\nexport default defineRunlyModule({ key: '${KEY}', name: 'Sonda', version: '0.1.0', kind: 'FEATURE', icon: 'Package', color: '#2563EB', pwa: { shortName: 'Sonda', startPath: '/inicio' }, dependencies: [], models: [], views: [], permissions: [], navigation: [] })\n`
  await fs.writeFile(path.join(dir, 'module.manifest.js'), manifest)
  await fs.writeFile(path.join(dir, 'api', 'index.js'), `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(canary)}, 'a')\nexport default () => null\n`)
  const ran = () => fs.readFile(canary, 'utf8').catch(() => '')
  return { prisma, modulesDir, dir, ran }
}

test('a module installed without a trust record is quarantined and its code never runs', async (t) => {
  const { dir, ran } = await setup(t)
  const loaded = await loadModuleManifest({ manifestPath: path.join(dir, 'module.manifest.js'), source: 'custom' })
  assert.equal(loaded.status, 'ERROR')
  assert.equal(loaded.error.code, 'MODULE_QUARANTINED')
  await assert.rejects(importModuleFile(path.join(dir, 'api', 'index.js'), dir), { code: 'MODULE_QUARANTINED' })
  assert.equal(await isQuarantinedCustomModule(KEY), true)
  assert.equal(await ran(), '')
})

test('trusted bytes run; any change on disk quarantines again; rollback to a trusted revision is allowed', async (t) => {
  const { dir, ran } = await setup(t)
  await trustModulePackage({ key: KEY, moduleDir: dir, authority: 'platform-owner', actorId: null })
  assert.equal((await loadModuleManifest({ manifestPath: path.join(dir, 'module.manifest.js'), source: 'custom' })).status, 'VALID')
  assert.equal(await ran(), 'm')
  const original = await fs.readFile(path.join(dir, 'api', 'index.js'), 'utf8')
  await fs.writeFile(path.join(dir, 'api', 'index.js'), original.replace("'a'", "'x'"))
  await fs.utimes(path.join(dir, 'api', 'index.js'), new Date(), new Date(Date.now() + 5000))
  assert.equal((await moduleTrustStatus(KEY, dir)).reason, 'CODE_CHANGED_SINCE_TRUSTED')
  await assert.rejects(importModuleFile(path.join(dir, 'api', 'index.js'), dir), { code: 'MODULE_QUARANTINED' })
  assert.equal(await ran(), 'm')
  await fs.writeFile(path.join(dir, 'api', 'index.js'), original)
  await fs.utimes(path.join(dir, 'api', 'index.js'), new Date(), new Date(Date.now() + 10000))
  assert.equal((await moduleTrustStatus(KEY, dir)).state, 'trusted')
})

test('the owner can quarantine and approve; staging copies are not gated', async (t) => {
  const { prisma, modulesDir, dir } = await setup(t)
  await trustModulePackage({ key: KEY, moduleDir: dir, authority: 'builder-compiler' })
  await decideModuleTrust({ key: KEY, decision: 'quarantine', actorId: null, reason: 'review' })
  assert.equal((await moduleTrustStatus(KEY, dir)).reason, 'review')
  assert.equal(JSON.parse(prisma.rows.get(MODULE_TRUST_PREFIX + KEY)).state, 'quarantined')
  await decideModuleTrust({ key: KEY, decision: 'approve', actorId: null })
  assert.equal((await moduleTrustStatus(KEY, dir)).state, 'trusted')
  // Staged packages already passed the staging code authority.
  const staged = path.join(modulesDir, '.staging', 'op', 'package')
  await fs.mkdir(staged, { recursive: true })
  await fs.writeFile(path.join(staged, 'x.js'), 'export const ok = 1\n')
  assert.equal((await importModuleFile(path.join(staged, 'x.js'), staged)).ok, 1)
})
