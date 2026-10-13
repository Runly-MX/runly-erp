import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PACKAGES, REGISTRY, rewriteManifest, digest, inventory } from '../lib/shared-package-release.mjs';
import { readConsumerArtifacts, startConsumerRegistry, assertIndependentConsumerLock } from '../lib/shared-consumer-registry.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'runly-consumer-registry-'));
  t.after(() => { assert.equal(dirname(resolve(root)), resolve(tmpdir())); rmSync(root, { recursive: true, force: true }); });
  const revision = 'a'.repeat(40), version = `0.1.0-source.${revision}`;
  const versions = Object.fromEntries(PACKAGES.map(name => [`@runly/${name}`, version]));
  const artifacts = PACKAGES.map(name => {
    const staging = join(root, name), directory = join(staging, 'package');
    mkdirSync(join(directory, 'src'), { recursive: true });
    const metadata = rewriteManifest({ name: `@runly/${name}`, version: '0.1.0', type: 'module', exports: { '.': './src/index.js' } }, versions, revision, 'Runly-MX/runly-erp');
    writeFileSync(join(directory, 'package.json'), JSON.stringify(metadata));
    writeFileSync(join(directory, 'src/index.js'), 'export const fixture = true;');
    const files = inventory(directory), file = `${name}.tgz`;
    execFileSync('tar', ['-czf', join(root, file), 'package'], { cwd: staging, windowsHide: true });
    const bytes = readFileSync(join(root, file));
    return { package: `@runly/${name}`, registryPackage: `@runly-mx/${name}`, version,
      sourceRevision: revision, file, files, contentDigest: digest(JSON.stringify(files)),
      sha256: digest(bytes), integrity: `sha512-${digest(bytes, 'sha512', 'base64')}` };
  });
  const contract = { schemaVersion: 3 };
  const manifest = { schemaVersion: 3, dirty: false, registry: REGISTRY, logicalScope: '@runly', registryScope: '@runly-mx',
    repository: 'Runly-MX/runly-erp', revision, packages: PACKAGES, artifacts,
    preview: { contract, capabilitiesDigest: digest(JSON.stringify(contract)), artifactDigest: artifacts.at(-1).contentDigest } };
  const path = join(root, 'manifest.json');
  const save = () => writeFileSync(path, JSON.stringify(manifest));
  save(); return { root, path, manifest, save };
}

test('consumer validates six artifacts before serving exact metadata and bytes read-only', async (t) => {
  const f = fixture(t), { artifacts } = readConsumerArtifacts(f.path);
  const registry = await startConsumerRegistry(artifacts);
  try {
    const metadata = await (await fetch(`${registry.origin}/@runly-mx%2Fcore`)).json();
    const version = metadata.versions[f.manifest.artifacts[0].version];
    assert.equal(version.name, '@runly-mx/core');
    assert.equal(version.dist.integrity, f.manifest.artifacts[0].integrity);
    assert.equal(digest(Buffer.from(await (await fetch(version.dist.tarball)).arrayBuffer())), f.manifest.artifacts[0].sha256);
    assert.equal((await fetch(version.dist.tarball, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(`${registry.origin}/unknown`)).status, 404);
    assert.equal((await fetch(`${registry.origin}/@runly-mx/core`, { method: 'PUT', body: '{}' })).status, 405);
  } finally { await registry.close(); }
});

test('consumer rejects stale revisions, duplicates, traversal, corrupt tarballs and contract drift', (t) => {
  const f = fixture(t), pristine = structuredClone(f.manifest);
  for (const mutate of [
    m => { m.revision = 'main'; }, m => { m.artifacts[1] = m.artifacts[0]; },
    m => { m.artifacts[0].file = '../core.tgz'; }, m => { m.artifacts[0].sha256 = '0'.repeat(64); },
    m => { m.preview.capabilitiesDigest = '0'.repeat(64); }, m => { m.artifacts[0].version = 'latest'; },
    m => { m.artifacts[0].files[0].path = '../.env'; m.artifacts[0].contentDigest = digest(JSON.stringify(m.artifacts[0].files)); },
  ]) {
    Object.assign(f.manifest, structuredClone(pristine)); mutate(f.manifest); f.save();
    assert.throws(() => readConsumerArtifacts(f.path), /SHARED_CONSUMER_ARTIFACT_INVALID/);
  }
  Object.assign(f.manifest, pristine); f.save();
  writeFileSync(join(f.root, 'core.tgz'), 'corrupt');
  assert.throws(() => readConsumerArtifacts(f.path), /SHARED_CONSUMER_ARTIFACT_INVALID/);
});

test('lock guard accepts ordinary package keys but rejects local dependency protocols', () => {
  assert.doesNotThrow(() => assertIndependentConsumerLock('dependencies:\n  "@lexical/file":\n    specifier: 0.35.0\n    version: 0.35.0\n'));
  for (const value of ['workspace:*', 'link:../erp', 'file:../package.tgz']) {
    for (const key of ['specifier', 'version', 'tarball']) {
      assert.throws(() => assertIndependentConsumerLock(`${key}: '${value}'\n`), /LOCAL_SOURCE_DEPENDENCY/);
    }
  }
});
