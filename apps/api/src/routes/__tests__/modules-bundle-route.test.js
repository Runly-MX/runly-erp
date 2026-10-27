import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createModulesRouter } from '../modules.js'
import { createModuleBundlerService } from '../../services/module-bundler-service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..')
const FIXTURE_ROOT = path.join(REPO_ROOT, 'scripts', 'fixtures', 'rme3-devkit', 'custom.goldenpath')
const BUNDLE_PATH = path.join(REPO_ROOT, 'apps', 'api', 'bundles', 'custom.goldenpath.js')

async function copyDir(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath)
    } else {
      await fs.copyFile(sourcePath, targetPath)
    }
  }
}

test('bundle requests use the current persisted version instead of an unrelated local cache', async () => {
  const row = { key: 'custom.cachetest', status: 'INSTALLED', enabled: true, hasBundle: true, bundleHash: 'current-hash' }
  const app = createModulesRouter({
    prisma: { runlyModule: { findUnique: async () => row } },
    authMiddleware: async (_c, next) => next(),
    requirePermission: () => async (_c, next) => next(),
    bundlerSvc: { ...createModuleBundlerService({ prisma: null, supabaseAdmin: null }), readPublishedBundle: async (key, hash) => {
      assert.equal(key, row.key)
      assert.equal(hash, row.bundleHash)
      return Buffer.from('export const current = true')
    } },
  })
  const response = await app.request('/custom.cachetest/bundle.js')
  assert.equal(response.status, 200)
  assert.match(await response.text(), /current = true/)
})

test('a bundle retrieval outage returns a retryable error without changing module metadata', async () => {
  const row = { key: 'custom.cachetest', status: 'INSTALLED', enabled: true, hasBundle: true, bundleHash: 'current-hash' }
  const app = createModulesRouter({
    prisma: { runlyModule: { findUnique: async () => row } },
    authMiddleware: async (_c, next) => next(),
    requirePermission: () => async (_c, next) => next(),
    bundlerSvc: { ...createModuleBundlerService({ prisma: null, supabaseAdmin: null }), readPublishedBundle: async () => { throw new Error('unavailable') } },
  })
  const response = await app.request('/custom.cachetest/bundle.js')
  assert.equal(response.status, 503)
  assert.equal(row.hasBundle, true)
})

test('GET /modules/:key/bundle.js serves a built bundle for the installer-mode golden path fixture', async () => {
  const externalRoot = await fs.mkdtemp(path.join(REPO_ROOT, '.tmp-ame3-golden-'))
  const moduleDir = path.join(externalRoot, 'custom.goldenpath')
  const previousModulesDir = process.env.RUNLY_MODULES_DIR
  await copyDir(FIXTURE_ROOT, moduleDir)
  process.env.RUNLY_MODULES_DIR = externalRoot

  let persistedBundleHash = 'fixture-hash'
  const prisma = {
    runlyModule: {
      async findUnique({ where, select }) {
        if (where.key !== 'custom.goldenpath') return null
        const row = {
          key: 'custom.goldenpath',
          status: 'INSTALLED',
          enabled: true,
          hasBundle: true,
          bundleHash: persistedBundleHash,
        }
        if (!select) return row
        return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]]))
      },
      async update({ data }) {
        if (data.bundleHash) persistedBundleHash = data.bundleHash
        return {}
      },
    },
  }

  const supabaseAdmin = {
    storage: {
      listBuckets: async () => ({ data: [{ name: 'module-bundles' }] }),
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  }

  const bundler = createModuleBundlerService({ prisma, supabaseAdmin })
  const buildResult = await bundler.buildModuleBundle('custom.goldenpath', { force: true })
  assert.equal(buildResult.built, true)

  const app = createModulesRouter({
    prisma,
    authMiddleware: async (_c, next) => next(),
    requirePermission: () => async (_c, next) => next(),
    bundlerSvc: bundler,
  })

  const response = await app.fetch(new Request('http://localhost/custom.goldenpath/bundle.js'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /application\/javascript/)
  const bundleSource = await response.text()
  assert.match(bundleSource, /register/)
  assert.match(bundleSource, /custom\.goldenpath:ModuleDashboard/)

  if (typeof previousModulesDir === 'string') {
    process.env.RUNLY_MODULES_DIR = previousModulesDir
  } else {
    delete process.env.RUNLY_MODULES_DIR
  }
  await fs.rm(externalRoot, { recursive: true, force: true })
  await fs.rm(BUNDLE_PATH, { force: true }).catch(() => {})
  await fs.rm(`${BUNDLE_PATH}.json`, { force: true }).catch(() => {})
})
