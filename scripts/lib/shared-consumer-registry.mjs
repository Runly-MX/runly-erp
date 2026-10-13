import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve, dirname, basename, sep } from 'node:path';
import { PACKAGES, REGISTRY, registryName, registryAlias, digest } from './shared-package-release.mjs';

const fail = () => { throw new Error('SHARED_CONSUMER_ARTIFACT_INVALID'); };

export function assertIndependentConsumerLock(lock) {
  // A package named @lexical/file is a YAML key, not a file: dependency.
  if (/(?:specifier|version|tarball):\s*['"]?(?:workspace|link|file):/.test(lock)) {
    throw new Error('SHARED_CONSUMER_LOCAL_SOURCE_DEPENDENCY');
  }
}

export function readConsumerArtifacts(manifestPath) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { fail(); }
  if (manifest.schemaVersion !== 3 || manifest.dirty !== false ||
      manifest.repository !== 'Runly-MX/runly-erp' || manifest.registry !== REGISTRY ||
      manifest.logicalScope !== '@runly' || manifest.registryScope !== '@runly-mx' ||
      !/^[a-f0-9]{40}$/.test(manifest.revision) ||
      JSON.stringify(manifest.packages) !== JSON.stringify(PACKAGES) ||
      !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== PACKAGES.length) fail();
  const root = resolve(dirname(manifestPath));
  const names = new Set(), files = new Set();
  const versions = Object.fromEntries(manifest.artifacts.map(a => [a.package, a.version]));
  const artifacts = manifest.artifacts.map(artifact => {
    if (!PACKAGES.some(name => artifact.package === `@runly/${name}`) ||
        names.has(artifact.package) || files.has(artifact.file) ||
        artifact.registryPackage !== registryName(artifact.package) ||
        artifact.sourceRevision !== manifest.revision ||
        typeof artifact.version !== 'string' ||
        !new RegExp(`^\\d+\\.\\d+\\.\\d+-source\\.${manifest.revision}$`).test(artifact.version) ||
        typeof artifact.file !== 'string' || basename(artifact.file) !== artifact.file ||
        !/^[a-zA-Z0-9_.-]+\.tgz$/.test(artifact.file)) fail();
    names.add(artifact.package); files.add(artifact.file);
    const file = resolve(root, artifact.file);
    if (!file.startsWith(root + sep) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) fail();
    const bytes = readFileSync(file);
    if (artifact.sha256 !== digest(bytes) || artifact.integrity !== `sha512-${digest(bytes, 'sha512', 'base64')}` ||
        !Array.isArray(artifact.files) || artifact.contentDigest !== digest(JSON.stringify(artifact.files))) fail();
    const inventoryPaths = new Set();
    for (const entry of artifact.files) {
      if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.includes(':') ||
          entry.path.split('/').some(part => !part || part === '..' || part === '.') ||
          (entry.path !== 'package.json' && !entry.path.startsWith('src/') && !/^(LICENSE|README)/i.test(entry.path)) ||
          !/^[a-f0-9]{64}$/.test(entry.sha256) || inventoryPaths.has(entry.path)) fail();
      inventoryPaths.add(entry.path);
    }
    if (!inventoryPaths.has('package.json')) fail();
    let metadata;
    try {
      metadata = JSON.parse(execFileSync('tar', ['-xOf', file, 'package/package.json'],
        { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 }));
    } catch { fail(); }
    if (metadata.name !== artifact.registryPackage || metadata.version !== artifact.version ||
        metadata.rme3LogicalName !== artifact.package || metadata.rme3SourceRevision !== manifest.revision ||
        metadata.rme3SourceRepository !== 'https://github.com/Runly-MX/runly-erp' ||
        metadata.private || metadata.scripts || metadata.devDependencies) fail();
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(metadata[field] ?? {})) {
        if (typeof spec !== 'string' || /workspace:|file:|link:/.test(spec)) fail();
        if (/^@(runly|atlas|runly-mx)\//.test(name)) {
          const logical = name.replace(/^@(atlas|runly-mx)\//, '@runly/');
          if (!versions[logical] || spec !== registryAlias(logical, versions[logical])) fail();
        }
      }
    }
    return { ...artifact, bytes, metadata };
  });
  if (!manifest.preview?.contract || manifest.preview.capabilitiesDigest !== digest(JSON.stringify(manifest.preview.contract)) ||
      manifest.preview.artifactDigest !== artifacts.find(a => a.package === '@runly/preview-runtime').contentDigest) fail();
  return { manifest, artifacts };
}

// Minimal npm metadata for the exact artifacts. No publication endpoint exists.
export async function startConsumerRegistry(artifacts) {
  const requests = [];
  let origin;
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let path;
    try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end(); return; }
    const archive = artifacts.find(a => path === `/tarballs/${a.file}`);
    if (archive) {
      requests.push({ package: archive.registryPackage, kind: 'tarball' });
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': archive.bytes.length });
      response.end(request.method === 'HEAD' ? undefined : archive.bytes); return;
    }
    const artifact = artifacts.find(a => path === `/${a.registryPackage}`);
    if (!artifact) { response.writeHead(404); response.end(); return; }
    requests.push({ package: artifact.registryPackage, kind: 'metadata' });
    const version = { ...artifact.metadata, dist: { integrity: artifact.integrity,
      tarball: `${origin}/tarballs/${artifact.file}` } };
    const data = Buffer.from(JSON.stringify({ name: artifact.registryPackage,
      'dist-tags': { source: artifact.version }, versions: { [artifact.version]: version } }));
    response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': data.length });
    response.end(request.method === 'HEAD' ? undefined : data);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, requests, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
