import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const REGISTRY = 'https://npm.pkg.github.com';
export const PACKAGES = ['core', 'module-engine', 'module-compiler', 'ui', 'sdk', 'preview-runtime'];
export const registryName = logical => {
  if (!PACKAGES.some(name => logical === `@runly/${name}`)) throw Error('UNKNOWN_LOGICAL_PACKAGE');
  return logical.replace('@runly/', '@runly-mx/');
};
export const registryAlias = (logical, version) => `npm:${registryName(logical)}@${version}`;
export function validatePublishAuthorization({ actions, enabled, tokenPresent, mode, workflowRepository, githubTokenAccessVerified }) {
  if (!actions || !enabled || !tokenPresent) throw Error('SHARED_PUBLISH_NOT_ENABLED_OR_AUTH_MISSING');
  if (mode === 'bootstrap') return;
  if (mode !== 'github-token') throw Error('SHARED_PUBLISH_AUTH_MODE_INVALID');
  if (workflowRepository?.split('/')[0].toLowerCase() !== 'runly-mx' && !githubTokenAccessVerified) throw Error('CROSS_OWNER_GITHUB_TOKEN_ACCESS_NOT_VERIFIED');
}
export const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
export function releaseVersion(base, revision) {
  if (!/^\d+\.\d+\.\d+$/.test(base) || !/^[a-f0-9]{40}$/.test(revision)) throw Error('INVALID_SOURCE_VERSION');
  return `${base}-source.${revision}`;
}
export function rewriteManifest(manifest, versions, revision, repository) {
  const result = structuredClone(manifest);
  result.name = registryName(manifest.name);
  result.version = versions[manifest.name];
  delete result.private;
  delete result.devDependencies;
  delete result.scripts;
  result.files = ['src'];
  // Source provenance does not imply cross-owner repository linkage in GitHub.
  delete result.repository;
  result.rme3LogicalName = manifest.name;
  result.rme3SourceRepository = `https://github.com/${repository}`;
  result.publishConfig = { registry: REGISTRY, access: 'restricted', tag: 'source' };
  result.rme3SourceRevision = revision;
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(result[field] ?? {})) {
      if (!spec.startsWith('workspace:')) continue;
      const target = spec.startsWith('workspace:@') ? spec.slice(10, spec.lastIndexOf('@')) : name;
      if (!versions[target]) throw Error(`SHARED_DEPENDENCY_OUTSIDE_RELEASE:${name}`);
      result[field][name] = registryAlias(target, versions[target]);
    }
  }
  return result;
}
export function inventory(root, prefix = '') {
  return readdirSync(resolve(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return inventory(root, path);
    if (!entry.isFile()) throw Error('PACKAGE_SYMLINK_OR_SPECIAL_FILE');
    return [{ path, sha256: digest(readFileSync(resolve(root, path))) }];
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
const targets = value => typeof value === 'string' ? [value] : Object.values(value ?? {}).flatMap(targets);
export function validatePackage(root, manifest, versions) {
  const logical = manifest.rme3LogicalName;
  if (!versions[logical] || registryName(logical) !== manifest.name || versions[logical] !== manifest.version || manifest.private) throw Error('PACKAGE_IDENTITY_INVALID');
  if (manifest.publishConfig?.registry !== REGISTRY) throw Error('PACKAGE_REGISTRY_INVALID');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (/workspace:|file:|link:|[\\]|\.\.\//.test(spec)) throw Error(`LOCAL_PACKAGE_DEPENDENCY:${name}`);
      if (name.startsWith('@runly/') || name.startsWith('@atlas/') || name.startsWith('@runly-mx/')) {
        const target = name.replace('@atlas/', '@runly/').replace('@runly-mx/', '@runly/');
        if (!versions[target] || spec !== registryAlias(target, versions[target])) throw Error(`NONEXACT_SHARED_DEPENDENCY:${name}`);
      }
    }
  }
  for (const target of [...targets(manifest.exports), manifest.main, manifest.types].filter(Boolean)) {
    if (target.includes('..') || !existsSync(resolve(root, target))) throw Error(`PACKAGE_EXPORT_MISSING:${target}`);
  }
  const files = inventory(root);
  for (const { path } of files) {
    if (path !== 'package.json' && !path.startsWith('src/') && !/^(LICENSE|README)/i.test(path)) throw Error(`PACKAGE_UNEXPECTED_FILE:${path}`);
    if (/(^|\/)(?:__tests__|node_modules|\.env|\.npmrc|\.git)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$|\.(?:pem|key|p12|pfx|tgz)$/i.test(path)) throw Error(`PACKAGE_FORBIDDEN_FILE:${path}`);
    const text = readFileSync(resolve(root, path), 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|[A-Za-z]:[\\/]Users[\\/]|\/d\/RacoonDevs\//.test(text)) throw Error(`PACKAGE_SECRET_OR_LOCAL_PATH:${path}`);
  }
  return files;
}
