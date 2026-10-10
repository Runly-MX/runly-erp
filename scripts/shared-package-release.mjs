// Packs committed source only. Publishing requires the protected Actions job.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { isBuiltin } from 'node:module';
import { PACKAGES, REGISTRY, releaseVersion, rewriteManifest, validatePackage, digest, validatePublishAuthorization } from './lib/shared-package-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const git = argv => execFileSync('git', argv, { cwd: root, encoding: 'utf8' }).trim();
const revision = git(['rev-parse', 'HEAD']);
if (git(['status', '--porcelain'])) throw Error('SHARED_RELEASE_REQUIRES_CLEAN_TREE');
if (option('--revision') && option('--revision') !== revision) throw Error('SHARED_RELEASE_REVISION_MISMATCH');
const config = JSON.parse(readFileSync(resolve(root, 'shared-packages.release.json')));
const repository = option('--repository') ?? config.sourceRepository;
if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository ?? '')) throw Error('RELEASE_REPOSITORY_REQUIRED');
if (repository !== config.sourceRepository || config.registry !== REGISTRY || config.scopeOwner !== 'runly-mx' || config.logicalScope !== '@runly' || config.registryScope !== '@runly-mx' || JSON.stringify(config.packages) !== JSON.stringify(PACKAGES)) throw Error('RELEASE_CONFIG_INVALID');
const publish = args.includes('--publish');
if (publish) validatePublishAuthorization({ actions: process.env.GITHUB_ACTIONS === 'true', enabled: process.env.RUNLY_SHARED_PUBLISH_ENABLED === 'true', tokenPresent: !!process.env.NODE_AUTH_TOKEN, mode: option('--auth-mode') ?? 'github-token', workflowRepository: process.env.GITHUB_REPOSITORY, githubTokenAccessVerified: process.env.RUNLY_SHARED_GITHUB_TOKEN_ACCESS_VERIFIED === 'true' });
if (!/\.(?:c?js)$/.test(process.env.npm_execpath ?? '')) throw Error('RUN_THROUGH_PNPM');
const output = resolve(option('--output') ?? join(root, '.artifacts/shared-release', revision));
const temp = mkdtempSync(join(tmpdir(), 'runly-package-release-'));
const pnpm = (argv, cwd = root) => execFileSync(process.execPath, [process.env.npm_execpath, ...argv], { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 });
try {
  mkdirSync(output, { recursive: true });
  writeFileSync(join(temp, 'source.tar'), execFileSync('git', ['archive', '--format=tar', revision, ...PACKAGES.map(name => `packages/${name}`)], { cwd: root, maxBuffer: 64 * 1024 * 1024 }));
  execFileSync('tar', ['-xf', 'source.tar'], { cwd: temp });
  const manifests = PACKAGES.map(name => JSON.parse(readFileSync(join(temp, 'packages', name, 'package.json'))));
  const versions = Object.fromEntries(manifests.map(m => [m.name, releaseVersion(m.version, revision)]));
  const require = createRequire(resolve(root, 'packages/module-compiler/package.json'));
  const { build } = require('esbuild');
  const artifacts = [];
  for (const name of PACKAGES) {
    const directory = join(temp, 'packages', name);
    const manifest = rewriteManifest(manifests.find(m => m.name === `@runly/${name}`), versions, revision, repository);
    // Tests are run against the checkout by Actions, never shipped to consumers.
    function removeTests(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isFile() && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) { rmSync(path); continue; }
        if (!entry.isDirectory()) continue;
        if (['__tests__', '__fixtures__'].includes(entry.name)) rmSync(path, { recursive: true });
        else removeTests(path);
      }
    }
    removeTests(join(directory, 'src'));
    writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    const packed = join(temp, 'packed', name);
    mkdirSync(packed, { recursive: true });
    pnpm(['pack', '--pack-destination', packed], directory);
    const file = readdirSync(packed).find(f => f.endsWith('.tgz'));
    execFileSync('tar', ['-xf', file], { cwd: packed });
    const packageRoot = join(packed, 'package');
    const actual = JSON.parse(readFileSync(join(packageRoot, 'package.json')));
    const files = validatePackage(packageRoot, actual, versions);
    // Compile every shipped module: validates syntax and relative import closure,
    // preserves the existing source/JSX exports consumed by Vite/esbuild.
    const entries = files.filter(f => /\.(?:js|jsx|mjs)$/.test(f.path)).map(f => join(packageRoot, f.path));
    await build({ entryPoints: entries, outdir: join(temp, 'build', name), bundle: true, packages: 'external', platform: 'neutral', format: 'esm', write: false, loader: { '.css': 'text', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' }, logLevel: 'silent', plugins: [{ name: 'declared-package-imports', setup(build) {
      build.onResolve({ filter: /^[^./]/ }, ({ path, kind }) => {
        if (kind === 'entry-point') return;
        if (isBuiltin(path)) return { path, external: true };
        const dependency = path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0];
        if (dependency !== manifest.name && !manifest.dependencies?.[dependency] && !manifest.peerDependencies?.[dependency] && !manifest.optionalDependencies?.[dependency]) throw Error(`UNDECLARED_PACKAGE_IMPORT:${manifest.name}:${dependency}`);
        return { path, external: true };
      });
    } }] });
    const bytes = readFileSync(join(packed, file));
    const identity = { package: manifest.rme3LogicalName, registryPackage: manifest.name, version: manifest.version, sourceRevision: revision, file, sha256: digest(bytes), integrity: `sha512-${digest(bytes, 'sha512', 'base64')}`, contentDigest: digest(JSON.stringify(files)), files };
    writeFileSync(join(output, file), bytes);
    artifacts.push(identity);
  }
  const { PREVIEW_RUNTIME_CONTRACT } = await import(pathToFileURL(join(temp, 'packages/preview-runtime/src/contracts.js')).href);
  const preview = { contract: PREVIEW_RUNTIME_CONTRACT, capabilitiesDigest: digest(JSON.stringify(PREVIEW_RUNTIME_CONTRACT)), artifactDigest: artifacts.find(a => a.package === '@runly/preview-runtime').contentDigest };
  const manifest = { schemaVersion: 3, distribution: 'github-packages', registry: REGISTRY, registryScope: '@runly-mx', logicalScope: '@runly', repository, revision, dirty: false, packages: PACKAGES, artifacts, preview };
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (publish) {
    // Check ALL existing versions before the first write. Network/auth errors
    // are not absence; only an explicit E404 is considered unpublished.
    const missing = [];
    for (const artifact of artifacts) {
      let remote;
      try { remote = JSON.parse(pnpm(['view', `${artifact.registryPackage}@${artifact.version}`, 'dist', '--json', '--registry', REGISTRY])); }
      catch (error) {
        if (!/\bE404\b/.test(`${error.stdout ?? ''}${error.stderr ?? ''}`)) throw Error('PACKAGE_REGISTRY_LOOKUP_FAILED');
        missing.push(artifact); continue;
      }
      if (remote.integrity !== artifact.integrity) throw Error(`IMMUTABLE_VERSION_CONTENT_CONFLICT:${artifact.package}`);
    }
    for (const artifact of missing) {
      try { pnpm(['publish', join(output, artifact.file), '--registry', REGISTRY, '--access', 'restricted', '--tag', 'source', '--no-git-checks']); }
      catch { throw Error(`PACKAGE_PUBLISH_FAILED:${artifact.package}`); }
    }
    for (const artifact of artifacts) {
      let remote;
      try { remote = JSON.parse(pnpm(['view', `${artifact.registryPackage}@${artifact.version}`, 'dist', '--json', '--registry', REGISTRY])); }
      catch { throw Error(`PUBLISHED_VERSION_VERIFICATION_FAILED:${artifact.package}`); }
      if (remote.integrity !== artifact.integrity || !remote.tarball?.startsWith(`${REGISTRY}/`)) throw Error(`PUBLISHED_VERSION_INTEGRITY_MISMATCH:${artifact.package}`);
    }
  }
  const summary = artifacts.map(a => `- ${a.package} -> ${a.registryPackage}@${a.version} (${a.integrity})`).join('\n');
  console.log(`Source ${revision}\n${summary}\nManifest: ${join(output, 'manifest.json')}`);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n', { flag: 'a' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
