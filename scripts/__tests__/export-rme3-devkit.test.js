import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function importDevkitTools() {
  try {
    return await import('../lib/rme3-devkit.js')
  } catch (error) {
    return { __importError: error }
  }
}

test('RME3 devkit helpers derive machine-readable capabilities from code and export a devkit bundle', async () => {
  const mod = await importDevkitTools()
  assert.ok(!mod.__importError, mod.__importError?.message ?? 'scripts/lib/rme3-devkit.js must exist')
  assert.equal(typeof mod.buildRme3RuntimeContract, 'function', 'buildRme3RuntimeContract must be exported')
  assert.equal(typeof mod.exportRme3Devkit, 'function', 'exportRme3Devkit must be exported')

  const contract = await mod.buildRme3RuntimeContract()
  assert.ok(!contract.promptStarter.includes('\r'), 'generated prompt must use canonical LF on every platform')
  assert.ok(Array.isArray(contract.externals), 'runtime contract must include externals[]')
  assert.ok(contract.externals.includes('sonner'), 'runtime contract must include sonner external')
  assert.ok(Array.isArray(contract.atlasUiExports), 'runtime contract must include atlasUiExports[]')
  assert.ok(contract.atlasUiExports.includes('PageHeader'), 'runtime contract must include PageHeader export')
  assert.deepEqual(contract.runlyUiExports, contract.atlasUiExports)
  assert.ok(contract.runlyUiExports.includes('RunlyTable'))
  assert.ok(contract.runlyUiExports.includes('RunlyTable'))
  assert.equal(contract.legacyImportAliases['@atlas/ui'], '@runly/ui')
  assert.ok(contract.externals.includes('@atlas/ui'))
  assert.ok(contract.externals.includes('@runly/ui'))
  assert.ok(Array.isArray(contract.customView.requiredFiles), 'runtime contract must describe CUSTOM view required files')
  assert.ok(contract.customView.requiredFiles.includes('components/index.js'))

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-devkit-export-'))
  await mod.exportRme3Devkit({ outDir })

  const manifestPath = path.join(outDir, 'manifest.json')
  const agentsPath = path.join(outDir, 'AGENTS.md')
  const readmePath = path.join(outDir, 'README.md')
  const capabilitiesPath = path.join(outDir, 'capabilities.runtime.json')
  const docsPath = path.join(outDir, 'docs', 'ai-context', 'rme3-runtime-capabilities.md')
  const customModulesGuidePath = path.join(outDir, 'docs', '03_custom_modules.md')
  const promptPath = path.join(outDir, 'prompt-starter.txt')
  const goldenPathManifest = path.join(outDir, 'golden-path-module', 'module.manifest.js')

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const capabilities = JSON.parse(await fs.readFile(capabilitiesPath, 'utf8'))
  assert.ok(Array.isArray(manifest.files), 'manifest.json must list exported files')
  assert.ok(manifest.files.includes('AGENTS.md'))
  assert.ok(manifest.files.includes('README.md'))
  assert.ok(manifest.files.includes('docs/ai-context/rme3-runtime-capabilities.md'))
  assert.ok(manifest.files.includes('golden-path-module/module.manifest.js'))
  assert.ok(!manifest.files.includes('docs/TASKS.md'))
  assert.match(await fs.readFile(agentsPath, 'utf8'), /RME3|Atlas ERP/i)
  assert.match(await fs.readFile(readmePath, 'utf8'), /capabilities\.runtime\.json/i)
  assert.doesNotMatch(await fs.readFile(agentsPath, 'utf8'), /node\s+scripts\/scaffold-module\.js|Use the scaffolder CLI/i)
  assert.doesNotMatch(await fs.readFile(readmePath, 'utf8'), /node\s+scripts\/scaffold-module\.js|scaffolder/i)
  assert.ok(capabilities.externals.includes('react'))
  assert.ok(capabilities.atlasUiExports.includes('Button'))
  assert.ok(capabilities.customView.requiredFiles.includes('views/dashboard.custom.js'))
  assert.equal(capabilities.importRules?.toast?.module, 'sonner')
  assert.ok(capabilities.importRules?.toast?.forbiddenModules?.includes('@runly/ui'))
  assert.match(await fs.readFile(docsPath, 'utf8'), /CUSTOM/i)
  assert.match(await fs.readFile(customModulesGuidePath, 'utf8'), /sonner/i)
  assert.match(await fs.readFile(promptPath, 'utf8'), /Read `AGENTS\.md`/i)
  assert.match(await fs.readFile(goldenPathManifest, 'utf8'), /custom\.goldenpath/)

  await fs.rm(outDir, { recursive: true, force: true })
})
