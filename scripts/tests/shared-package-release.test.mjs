import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseVersion, rewriteManifest, validatePackage, parseReleaseArguments, validatePublishAuthorization } from '../lib/shared-package-release.mjs';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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
test('publication requires enabled Actions in the official ERP repository', () => {
  const ready = { actions: true, enabled: true, tokenPresent: true, workflowRepository: 'Runly-MX/runly-erp' };
  assert.doesNotThrow(() => validatePublishAuthorization(ready));
  for (const field of ['actions', 'enabled', 'tokenPresent']) {
    assert.throws(() => validatePublishAuthorization({ ...ready, [field]: false }), /NOT_ENABLED_OR_AUTH_MISSING/);
  }
  for (const workflowRepository of [undefined, 'outside/runly-erp', 'Runly-MX/other']) {
    assert.throws(() => validatePublishAuthorization({ ...ready, workflowRepository }), /REPOSITORY_INVALID/);
  }
});

test('release CLI supports only release options and rejects obsolete authentication selectors', () => {
  assert.deepEqual(parseReleaseArguments([]), {});
  assert.deepEqual(parseReleaseArguments(['--revision', revision, '--publish', '--repository', 'Runly-MX/runly-erp', '--output', 'artifacts']), { revision, publish: true, repository: 'Runly-MX/runly-erp', output: 'artifacts' });
  for (const args of [['--auth-mode', 'bootstrap'], ['--auth-mode', 'github-token'], ['--unknown'], ['--revision'], ['--output', '--publish'], ['--publish', '--publish']]) {
    assert.throws(() => parseReleaseArguments(args), /ARGUMENT_INVALID/);
  }
});

test('release workflow has one native token publisher and preserves protected preparation', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/shared-packages.yml', import.meta.url), 'utf8');
  assert.deepEqual([...workflow.matchAll(/^  (\w+):\r?$/gm)].map(match => match[1]), ['workflow_dispatch', 'prepare', 'publish']);
  assert.deepEqual([...workflow.matchAll(/^      (\w+):\r?$/gm)].map(match => match[1]), ['revision', 'publish']);
  assert.deepEqual([...workflow.matchAll(/secrets\.(\w+)/g)].map(match => match[1]), ['GITHUB_TOKEN']);
  assert.deepEqual([...workflow.matchAll(/vars\.(\w+)/g)].map(match => match[1]), ['RUNLY_SHARED_PUBLISH_ENABLED']);
  assert.match(workflow, /environment: shared-packages\s/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /needs: prepare\s+if: \$\{\{ inputs\.publish \}\}/);
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(workflow, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(workflow, /git merge-base --is-ancestor "\$REVISION" origin\/main/);
  assert.match(workflow, /test -z "\$\(git status --porcelain\)"/);
  assert.equal(existsSync(new URL('../../docs/shared-packages-org-publisher.yml', import.meta.url)), false);
});
