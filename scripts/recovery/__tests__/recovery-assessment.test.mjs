import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assessRecovery, hashFile } from '../recovery-assessment.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'runly-recovery-assess-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ['storage', 'modules', 'config']) await mkdir(path.join(dir, name));
  await writeFile(path.join(dir, 'db.dump'), 'PGDMPfixture');
  await writeFile(path.join(dir, 'config', '.env.external'), 'fixture config');
  return dir;
}

test('legacy coverage is unknown rather than reported complete', async t => {
  const dir = await fixture(t);
  assert.equal((await assessRecovery(dir)).status, 'legacy-unknown');
  await rm(path.join(dir, 'modules'), { recursive: true });
  const incomplete = await assessRecovery(dir);
  assert.equal(incomplete.status, 'incomplete');
  assert.ok(incomplete.findings.includes('modules_missing'));
});

test('complete manifests validate inventory, hashes and source identity; corruption is incomplete', async t => {
  const dir = await fixture(t);
  const files = [];
  for (const [name, bytes] of [['db.dump', 12], ['config/.env.external', 14]]) {
    files.push({ path: name, bytes, sha256: await hashFile(path.join(dir, name)) });
  }
  const resources = Object.fromEntries(['database', 'storage', 'modules', 'config'].map(k => [k, { status: 'complete' }]));
  await writeFile(path.join(dir, 'backup-manifest.json'), JSON.stringify({ schemaVersion: 1, coverageMode: 'complete', instanceId: 'fixture', createdAt: '2026-10-12T00:00:00Z', resources, files }));
  assert.equal((await assessRecovery(dir, { expectedInstanceId: 'fixture' })).status, 'complete');
  assert.equal((await assessRecovery(dir, { expectedInstanceId: 'other' })).status, 'incomplete');
  await writeFile(path.join(dir, 'db.dump'), 'PGDMPchanged');
  assert.ok((await assessRecovery(dir)).findings.includes('file_integrity_failed'));
});

test('manifests cannot traverse out of the extraction or omit files', async t => {
  const dir = await fixture(t);
  const manifest = { schemaVersion: 1, coverageMode: 'complete', instanceId: 'fixture', createdAt: 'date', resources: {},
    files: [{ path: '../outside', bytes: 1, sha256: 'a'.repeat(64) }] };
  await writeFile(path.join(dir, 'backup-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(assessRecovery(dir), { exitCode: 2 });
});
