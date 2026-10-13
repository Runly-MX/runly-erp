import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, readFile, open } from 'node:fs/promises';
import { assertSafeTree } from './recovery-paths.mjs';
import { inputError } from './recovery-config.mjs';

export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function locateBackupRoot(input) {
  await assertSafeTree(input);
  const candidates = [];
  async function visit(directory, depth) {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some(e => e.isFile() && e.name === 'db.dump')) candidates.push(directory);
    if (depth < 12) for (const entry of entries) {
      if (entry.isDirectory() && !['storage', 'modules', 'config'].includes(entry.name)) await visit(path.join(directory, entry.name), depth + 1);
    }
  }
  await visit(path.resolve(input), 0);
  if (candidates.length !== 1) throw inputError('La extracción debe contener exactamente una raíz de respaldo con db.dump.');
  return candidates[0];
}

export function safeManifestPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[\\\x00-\x1f]/.test(value) ||
    (process.platform === 'win32' && value.includes(':')) ||
    value.split('/').some(p => !p || p === '.' || p === '..')) throw inputError('El manifiesto contiene una ruta insegura.');
  return value;
}

export async function assessRecovery(input, { expectedInstanceId } = {}) {
  const root = await locateBackupRoot(input);
  const findings = [];
  const dump = await open(path.join(root, 'db.dump'), 'r');
  try {
    const signature = Buffer.alloc(5);
    await dump.read(signature, 0, 5, 0);
    if (signature.toString() !== 'PGDMP') findings.push('database_archive_invalid');
  } finally { await dump.close(); }
  for (const category of ['storage', 'config', 'modules']) {
    const info = await stat(path.join(root, category)).catch(() => null);
    if (!info?.isDirectory()) findings.push(`${category}_missing`);
  }
  const configEntries = await readdir(path.join(root, 'config')).catch(() => []);
  if (!configEntries.some(name => /^\.env\.(local|external)$/.test(name))) findings.push('instance_configuration_missing');
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(root, 'backup-manifest.json'), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') findings.push('manifest_invalid');
  }
  let verifiedFiles = 0;
  if (manifest) {
    if (manifest.schemaVersion !== 1 || !['complete', 'database-only'].includes(manifest.coverageMode) ||
      !Array.isArray(manifest.files) || !manifest.files.length || !manifest.instanceId || !manifest.createdAt) {
      findings.push('manifest_invalid');
    } else {
      if (expectedInstanceId && manifest.instanceId !== expectedInstanceId) findings.push('instance_mismatch');
      if (manifest.coverageMode === 'database-only') findings.push('database_only');
      for (const category of ['database', 'storage', 'config', 'modules']) {
        if (manifest.resources?.[category]?.status !== 'complete') findings.push(`${category}_not_verified`);
      }
      const declared = new Set();
      for (const entry of manifest.files) {
        safeManifestPath(entry.path);
        if (declared.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') ||
          !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
          findings.push('file_inventory_invalid');
          continue;
        }
        declared.add(entry.path);
        const file = path.join(root, ...entry.path.split('/'));
        const info = await stat(file).catch(() => null);
        if (!info?.isFile() || info.size !== entry.bytes || await hashFile(file) !== entry.sha256) findings.push('file_integrity_failed');
        else verifiedFiles++;
      }
      if (!declared.has('db.dump') || ![...declared].some(p => /^config\/\.env\.(local|external)$/.test(p))) findings.push('file_inventory_incomplete');
      // Do not trust a manifest that omits extracted files while claiming full coverage.
      async function checkInventory(directory, relative = '') {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          const key = relative ? `${relative}/${item.name}` : item.name;
          if (item.isDirectory()) await checkInventory(path.join(directory, item.name), key);
          else if (!['backup-manifest.json', '.runly-recovery-incomplete', '.runly-recovery-result.json'].includes(key) && !declared.has(key)) findings.push('undeclared_file');
        }
      }
      await checkInventory(root);
    }
  }
  return {
    status: findings.length ? 'incomplete' : manifest ? 'complete' : 'legacy-unknown',
    findings: [...new Set(findings)],
    verifiedFiles,
    databaseValidation: 'header-only',
    // A checksum-complete extraction is not proof of application recovery.
    installationRecovered: false,
    root,
  };
}

export function publicAssessment(result) {
  const { root, ...summary } = result;
  return summary;
}
