import assert from 'node:assert/strict';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const consumer = realpathSync(process.cwd());
for (const artifact of JSON.parse(readFileSync('expected-artifacts.json', 'utf8'))) {
  let packageRoot = dirname(fileURLToPath(import.meta.resolve(artifact.logical)));
  while (!existsSync(join(packageRoot, 'package.json'))) packageRoot = dirname(packageRoot);
  packageRoot = realpathSync(packageRoot);
  assert.ok(packageRoot.startsWith(consumer + sep), 'Installed package resolved outside consumer');
  const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(metadata.name, artifact.registryPackage); assert.equal(metadata.version, artifact.version);
  for (const file of artifact.files) {
    const hash = createHash('sha256').update(readFileSync(join(packageRoot, file.path))).digest('hex');
    assert.equal(hash, file.sha256, `Installed content changed: ${artifact.logical}/${file.path}`);
  }
}
const { ModuleRegistry } = await import('@runly/core');
const { ModuleRegistry: AtlasRegistry } = await import('@atlas/core');
const { defineRunlyModule, defineAtlasModule } = await import('@runly/module-engine');
const { defineRunlyModule: AliasDefine } = await import('@atlas/module-engine');
const { compileModule, archiveModule } = await import('@runly/module-compiler');
const { createRunlyClient, createAtlasClient } = await import('@runly/sdk');
const { createRunlyClient: AliasClient } = await import('@atlas/sdk');
const { PREVIEW_RUNTIME_CONTRACT } = await import('@runly/preview-runtime/contracts');
const { createRuntimeSession } = await import('@runly/preview-runtime/session');

assert.equal(ModuleRegistry, AtlasRegistry);
assert.equal(defineRunlyModule, defineAtlasModule);
assert.equal(defineRunlyModule, AliasDefine);
assert.equal(createRunlyClient, createAtlasClient);
assert.equal(createRunlyClient, AliasClient);
const registry = new ModuleRegistry();
const module = { key: 'atlas.core' };
registry.register(module);
assert.equal(registry.get('runly.core'), module);

const definition = { schemaVersion: 1, key: 'custom.consumer', name: 'Contrato externo', version: '1.0.0',
  icon: 'Users', color: '#2563EB', pwa: { shortName: 'Contrato', startPath: '/things' },
  entities: [{ key: 'thing', label: 'Cosa', pluralLabel: 'Cosas',
    fields: [{ key: 'title', type: 'text', label: 'Título', required: true }] }] };
const compiled = compileModule(definition);
assert.ok(compiled.files.some(f => f.path === 'module.manifest.js'));
assert.ok(compiled.files.some(f => f.path === 'views/thing.table.js'));
assert.ok((await archiveModule(compiled)).length > 0);

let company = 'a', requestedCompany;
const client = createRunlyClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => company,
  fetch: async (_url, options) => {
    requestedCompany = new Headers(options.headers).get('X-Runly-Company-Id');
    return { ok: true, json: async () => { company = 'b'; return { private: true }; } };
  } });
await assert.rejects(client.auth.me('test-only'), { code: 'company_changed', status: 409 });
assert.equal(requestedCompany, 'a');
const studioRequests = [];
const studioClient = AliasClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => 'studio-company',
  fetch: async (url, options) => { studioRequests.push({ url, options }); return Response.json({ data: [] }); } });
await studioClient.studio.listDesigns('test-only', { page: 2 });
await studioClient.studio.getDesign('design/one', 'test-only');
await studioClient.studio.createDesign({ name: 'Contrato' }, 'test-only');
await studioClient.studio.updateDesign('design/one', { revision: 1 }, 'test-only');
assert.deepEqual(studioRequests.map(({ options }) => options.method), ['GET', 'GET', 'POST', 'PUT']);
assert.equal(studioRequests[1].url, 'https://api.example.test/studio/designs/design%2Fone');
for (const { options } of studioRequests) assert.equal(options.headers['X-Runly-Company-Id'], 'studio-company');
assert.equal(PREVIEW_RUNTIME_CONTRACT.schemaVersion, 3);
const preferences = { get: async () => null, set: async (_key, value) => value, remove: async () => null };
const session = createRuntimeSession({ id: 'external-contract', preferences, resources: { resolve: () => null },
  transport: { fetch: async () => Response.json({ data: ['fixture'] }) } });
assert.deepEqual(await (await session.adapters.transport.fetch('/things')).json(), { data: ['fixture'] });
session.dispose();
await assert.rejects(session.adapters.transport.fetch('/things'), { code: 'PREVIEW_UNSUPPORTED' });
console.log('Node contracts: core, engine, compiler/archive, SDK, preview and aliases passed');
