import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseVersion, rewriteManifest, validatePackage, validatePublishAuthorization } from '../lib/shared-package-release.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const revision = 'a'.repeat(40);
test('source versions use full SHA and workspace aliases become exact registry aliases', () => {
  const version = releaseVersion('0.1.0', revision);
  const versions = { '@runly/core': version, '@runly/ui': version };
  const manifest = rewriteManifest({ name: '@runly/ui', private: true, version: '0.1.0', dependencies: { '@runly/core': 'workspace:*', '@atlas/core': 'workspace:@runly/core@*' } }, versions, revision, 'Runly-MX/runly-erp');
  assert.equal(manifest.name, '@runly-mx/ui');
  assert.equal(manifest.rme3LogicalName, '@runly/ui');
  assert.equal(manifest.repository, undefined);
  assert.equal(manifest.rme3SourceRepository, 'https://github.com/Runly-MX/runly-erp');
  assert.equal(manifest.dependencies['@atlas/core'], `npm:@runly-mx/core@${version}`);
  assert.equal(manifest.dependencies['@runly/core'], `npm:@runly-mx/core@${version}`);
  assert.equal(manifest.private, undefined);
  assert.throws(() => releaseVersion('0.1.0', 'main'));
  assert.throws(() => rewriteManifest({ name: '@runly/ui', dependencies: { '@runly/other': 'workspace:*' } }, versions, revision, 'runly/source'));
});
test('packed exports, internal ranges and forbidden contents fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'runly-package-test-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/index.js'), 'export const value = 1;');
    const version = releaseVersion('0.1.0', revision), versions = { '@runly/core': version };
    const manifest = rewriteManifest({ name: '@runly/core', exports: { '.': './src/index.js' } }, versions, revision, 'Runly-MX/runly-erp');
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
    assert.equal(validatePackage(root, manifest, versions).length, 2);
    assert.throws(() => validatePackage(root, { ...manifest, exports: { '.': './missing.js' } }, versions), /EXPORT_MISSING/);
    assert.throws(() => validatePackage(root, { ...manifest, dependencies: { '@runly/core': '^' + version } }, versions), /NONEXACT/);
    assert.throws(() => validatePackage(root, { ...manifest, dependencies: { x: 'file:../x' } }, versions), /LOCAL_PACKAGE/);
    writeFileSync(join(root, 'src/.env'), 'EXAMPLE=value');
    assert.throws(() => validatePackage(root, manifest, versions), /FORBIDDEN/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('bootstrap and future github-token credentials are explicit, never a silent fallback', () => {
  const ready = { actions: true, enabled: true, tokenPresent: true, mode: 'github-token', workflowRepository: 'raulbellosom/runly-erp' };
  assert.throws(() => validatePublishAuthorization(ready), /CROSS_OWNER/);
  assert.doesNotThrow(() => validatePublishAuthorization({ ...ready, githubTokenAccessVerified: true }));
  assert.doesNotThrow(() => validatePublishAuthorization({ ...ready, workflowRepository: 'Runly-MX/runly-erp' }));
  assert.doesNotThrow(() => validatePublishAuthorization({ ...ready, mode: 'bootstrap' }));
  assert.throws(() => validatePublishAuthorization({ ...ready, mode: 'bootstrap', tokenPresent: false }), /AUTH_MISSING/);
  assert.throws(() => validatePublishAuthorization({ ...ready, mode: 'bootstrap', enabled: false }), /NOT_ENABLED/);
});
