import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseVersion, rewriteManifest, validatePackage } from '../lib/shared-package-release.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const revision = 'a'.repeat(40);
test('source versions use full SHA and workspace aliases become exact registry aliases', () => {
  const version = releaseVersion('0.1.0', revision);
  const versions = { '@runly/core': version, '@runly/ui': version };
  const manifest = rewriteManifest({ name: '@runly/ui', private: true, version: '0.1.0', dependencies: { '@runly/core': 'workspace:*', '@atlas/core': 'workspace:@runly/core@*' } }, versions, revision, 'runly/source');
  assert.equal(manifest.dependencies['@atlas/core'], `npm:@runly/core@${version}`);
  assert.equal(manifest.dependencies['@runly/core'], version);
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
    const manifest = rewriteManifest({ name: '@runly/core', exports: { '.': './src/index.js' } }, versions, revision, 'runly/source');
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
    assert.equal(validatePackage(root, manifest, versions).length, 2);
    assert.throws(() => validatePackage(root, { ...manifest, exports: { '.': './missing.js' } }, versions), /EXPORT_MISSING/);
    assert.throws(() => validatePackage(root, { ...manifest, dependencies: { '@runly/core': '^' + version } }, versions), /NONEXACT/);
    assert.throws(() => validatePackage(root, { ...manifest, dependencies: { x: 'file:../x' } }, versions), /LOCAL_PACKAGE/);
    writeFileSync(join(root, 'src/.env'), 'EXAMPLE=value');
    assert.throws(() => validatePackage(root, manifest, versions), /FORBIDDEN/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
