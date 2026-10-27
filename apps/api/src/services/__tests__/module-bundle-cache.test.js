import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createModuleBundlerService } from '../module-bundler-service.js'

async function fixture(t, { fail = false } = {}) {
  const bundlesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runly-bundle-cache-'))
  t.after(() => fs.rm(bundlesDir, { recursive: true, force: true }))
  let downloads = 0
  let updates = 0
  const content = Buffer.from('export const release = "current";')
  const svc = createModuleBundlerService({
    bundlesDir,
    prisma: { runlyModule: {
      findMany: async ({ where }) => where.hasBundle ? [{ key: 'custom.cachetest', bundleHash: 'current' }] : [],
      update: async () => { updates++; },
    } },
    supabaseAdmin: { storage: { from: () => ({ download: async () => {
      downloads++
      await new Promise(resolve => setImmediate(resolve))
      return fail ? { error: new Error('temporary storage outage') } : { data: new Blob([content]) }
    } }) } },
  })
  return { svc, bundlesDir, content, downloads: () => downloads, updates: () => updates }
}

test('an old local bundle is refreshed despite the file already existing', async t => {
  const f = await fixture(t)
  await fs.writeFile(path.join(f.bundlesDir, 'custom.cachetest.js'), 'old starter without current components')
  assert.deepEqual(await f.svc.readPublishedBundle('custom.cachetest', 'current'), f.content)
  assert.equal(f.downloads(), 1)
  assert.deepEqual(await f.svc.readPublishedBundle('custom.cachetest', 'current'), f.content)
  assert.equal(f.downloads(), 1, 'a verified current cache avoids another download')
})

test('a second host refreshes its cache when the shared module version changes', async t => {
  const f = await fixture(t)
  await f.svc.readPublishedBundle('custom.cachetest', 'previous')
  await f.svc.readPublishedBundle('custom.cachetest', 'current')
  assert.equal(f.downloads(), 2)
})

test('boot repairs an existing obsolete file instead of only restoring missing files', async t => {
  const f = await fixture(t)
  const target = path.join(f.bundlesDir, 'custom.cachetest.js')
  await fs.writeFile(target, 'old starter')
  await f.svc.restoreModuleBundlesOnBoot()
  assert.deepEqual(await fs.readFile(target), f.content)
  assert.equal(f.updates(), 0)
})

test('a corrupted cache is never served under a current version tag', async t => {
  const f = await fixture(t)
  await f.svc.readPublishedBundle('custom.cachetest', 'current')
  await fs.writeFile(path.join(f.bundlesDir, 'custom.cachetest.js'), 'stale content')
  assert.deepEqual(await f.svc.readPublishedBundle('custom.cachetest', 'current'), f.content)
  assert.equal(f.downloads(), 2)
})

test('concurrent requests restore the same version once', async t => {
  const f = await fixture(t)
  const results = await Promise.all(Array.from({ length: 8 }, () => f.svc.readPublishedBundle('custom.cachetest', 'current')))
  for (const result of results) assert.deepEqual(result, f.content)
  assert.equal(f.downloads(), 1)
})

test('a temporary restore failure does not disable bundles in the shared database', async t => {
  const f = await fixture(t, { fail: true })
  await f.svc.restoreModuleBundlesOnBoot()
  assert.equal(f.updates(), 0)
  await assert.rejects(f.svc.readPublishedBundle('custom.cachetest', 'current'), /temporary storage outage/)
})
