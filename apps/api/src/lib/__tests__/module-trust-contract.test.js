// The quarantine gate is inactive until configured: both processes that import
// module code must configure it before anything discovers or loads modules.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..')

test('API boot configures module trust before the route loader exists', async () => {
  const src = await fs.readFile(path.join(ROOT, 'apps/api/src/index.js'), 'utf8')
  const configured = src.indexOf('configureModuleTrust({ prisma')
  assert.ok(configured > 0, 'configureModuleTrust call missing')
  assert.ok(configured < src.indexOf('createRouteLoaderService({'), 'must run before the route loader is created')
})

test('worker configures module trust before automations and domain events start', async () => {
  const src = await fs.readFile(path.join(ROOT, 'apps/worker/src/index.js'), 'utf8')
  const configured = src.indexOf('configureModuleTrust({ prisma')
  assert.ok(configured > 0, 'configureModuleTrust call missing')
  for (const marker of ['createAutomationWorker(', 'createDomainEventDispatcher(']) {
    const use = src.indexOf(marker, src.indexOf('configureModuleTrust({ prisma'))
    assert.ok(use > configured, `${marker} must be created after configureModuleTrust`)
  }
})

test('every import() of installed module code goes through the trust gate', async () => {
  const files = {
    'apps/api/src/lib/module-import-revision.js': 'assertModuleCodeTrusted(filePath)',
    'apps/api/src/services/module-discovery-service.js': 'assertModuleCodeTrusted(filePath)',
    'apps/api/src/services/automation-worker-service.js': 'assertModuleCodeTrusted(file)',
    'apps/api/src/services/domain-events/dispatcher.js': 'assertModuleCodeTrusted(file)',
    'apps/api/src/services/module-lifecycle-service.js': 'assertModuleCodeTrusted(seedPath)',
  }
  for (const [file, call] of Object.entries(files)) {
    assert.ok((await fs.readFile(path.join(ROOT, file), 'utf8')).includes(call), `${file} lost its trust gate`)
  }
})
