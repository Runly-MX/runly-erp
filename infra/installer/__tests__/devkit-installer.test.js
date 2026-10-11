import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function importInstallerTools() {
  try {
    return await import('../lib/devkit-installer.mjs')
  } catch (error) {
    return { __importError: error }
  }
}

test('Dev Kit uses the new directory and reuses legacy installations without moving files', async (t) => {
  const { resolveDevKitDir } = await importInstallerTools()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runly-devkit-paths-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const current = path.join(root, '_runly-devkit')
  const legacy = path.join(root, '_atlas-devkit')
  assert.equal(resolveDevKitDir(root), current)
  await fs.mkdir(legacy)
  await fs.writeFile(path.join(legacy, 'local-notes.txt'), 'keep me')
  assert.equal(resolveDevKitDir(root), legacy)
  await fs.mkdir(current)
  assert.equal(resolveDevKitDir(root), current)
  assert.equal(await fs.readFile(path.join(legacy, 'local-notes.txt'), 'utf8'), 'keep me')
})

test('installer devkit downloader uses the exported manifest and writes nested files into _atlas-devkit', async () => {
  const mod = await importInstallerTools()
  assert.ok(!mod.__importError, mod.__importError?.message ?? 'infra/installer/lib/devkit-installer.mjs must exist')
  assert.equal(typeof mod.downloadDevKitSnapshot, 'function', 'downloadDevKitSnapshot must be exported')
  assert.equal(typeof mod.getDevKitManifestRepoPath, 'function', 'getDevKitManifestRepoPath must be exported')

  const files = {
    'infra/installer/devkit-export/manifest.json': JSON.stringify({
      version: 1,
      files: [
        'README.md',
        'capabilities.runtime.json',
        'docs/ai-context/rme3-runtime-capabilities.md',
        'golden-path-module/module.manifest.js',
      ],
    }),
    'infra/installer/devkit-export/README.md': '# Devkit\n',
    'infra/installer/devkit-export/capabilities.runtime.json': '{"ok":true}\n',
    'infra/installer/devkit-export/docs/ai-context/rme3-runtime-capabilities.md': '# Runtime\n',
    'infra/installer/devkit-export/golden-path-module/module.manifest.js': 'export default {}\n',
  }

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-devkit-installer-'))
  const docsRawBase = 'https://raw.githubusercontent.com/Runly-MX/runly-erp/main'
  const requests = []

  const result = await mod.downloadDevKitSnapshot({
    devKitDir: outDir,
    docsRawBase,
    fetchImpl: async (url) => {
      requests.push(url)
      const relativePath = url.replace(`${docsRawBase}/`, '')
      const body = files[relativePath]
      if (!body) {
        return { ok: false, status: 404 }
      }
      return {
        ok: true,
        status: 200,
        async text() {
          return body
        },
      }
    },
  })

  assert.equal(result.downloadedFiles.length, 4)
  assert.equal(result.failedFiles.length, 0)
  assert.deepEqual(
    requests.map((entry) => entry.replace(`${docsRawBase}/`, '')),
    [
      'infra/installer/devkit-export/manifest.json',
      'infra/installer/devkit-export/README.md',
      'infra/installer/devkit-export/capabilities.runtime.json',
      'infra/installer/devkit-export/docs/ai-context/rme3-runtime-capabilities.md',
      'infra/installer/devkit-export/golden-path-module/module.manifest.js',
    ]
  )

  assert.match(await fs.readFile(path.join(outDir, 'README.md'), 'utf8'), /Devkit/)
  assert.match(await fs.readFile(path.join(outDir, 'capabilities.runtime.json'), 'utf8'), /ok/)
  assert.match(
    await fs.readFile(path.join(outDir, 'docs', 'ai-context', 'rme3-runtime-capabilities.md'), 'utf8'),
    /Runtime/
  )
  assert.match(
    await fs.readFile(path.join(outDir, 'golden-path-module', 'module.manifest.js'), 'utf8'),
    /export default/
  )

  await fs.rm(outDir, { recursive: true, force: true })
})
