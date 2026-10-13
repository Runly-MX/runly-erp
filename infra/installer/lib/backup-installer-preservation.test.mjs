import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'dotenv';
import { resolveBackupConfig } from './backup-config.mjs';

const fixture = { BACKUP_MODE: 'enabled', BACKUP_COVERAGE_MODE: 'complete', BACKUP_MAX_AGE_HOURS: '48', BACKUP_RETENTION_DAYS: '30',
  BACKUP_S3_ENDPOINT: 'https://s3.example.test', BACKUP_S3_BUCKET: 'test-bucket', BACKUP_S3_REGION: 'original-region',
  BACKUP_S3_ACCESS_KEY_ID: 'fixture-key', BACKUP_S3_SECRET_ACCESS_KEY: 'fixture-secret', RESTIC_PASSWORD: 'original-fixture-password',
  BACKUP_STORAGE_S3_ENDPOINT: 'https://storage.example.test', BACKUP_STORAGE_S3_ACCESS_KEY_ID: 'storage-key', BACKUP_STORAGE_S3_SECRET_ACCESS_KEY: 'storage-secret',
  BACKUP_STORAGE_S3_REGION: 'source-region', RUNLY_INSTANCE_ID: 'original-instance', UNRELATED: 'preserved' };

test('external installer backup function preserves original recovery inputs on repeated config writes', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'runly-backup-installer-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, '.env.external');
  const original = Object.entries(fixture).map(([k,v]) => `${k}=${v}`).join('\n') + '\n';
  await fs.writeFile(file, original);
  const source = (await fs.readFile(new URL('../setup-external.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const start = source.indexOf('async function configureBackup(filePath)');
  const end = source.indexOf('\nfunction tryCapture(', start);
  assert.ok(start >= 0 && end > start);
  const setEnv = (text, key, value) => {
    const expression = new RegExp(`^${key}=.*$`, 'm');
    return expression.test(text) ? text.replace(expression, `${key}=${value}`) : `${text}${key}=${value}\n`;
  };
  const configure = new Function('resolveBackupConfig', 'fs', 'parseEnvValue', 'setEnvValue', 'console',
    `${source.slice(start, end)}; return configureBackup;`)(resolveBackupConfig, fs, (text,k) => parse(text)[k], setEnv, { warn() {} });
  await configure(file);
  await configure(file);
  const result = parse(await fs.readFile(file));
  for (const key of Object.keys(fixture)) assert.equal(result[key], fixture[key], key);
});

test('local installer resolver and rendered backup env preserve coverage, region and password', async () => {
  const source = (await fs.readFile(new URL('../setup-local.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const start = source.indexOf('  const backup = resolveBackupConfig({');
  const end = source.indexOf('\n  const officeValues', start);
  assert.ok(start >= 0 && end > start);
  const backup = new Function('resolveBackupConfig', 'supabase', 'fromLocalEnv', `${source.slice(start, end)};return backup;`)(
    resolveBackupConfig, { mode: 'selfhosted' }, key => fixture[key] || '');
  const renderStart = source.indexOf('BACKUP_MODE=${backup.mode}');
  const renderLast = source.indexOf('BACKUP_STORAGE_S3_REGION=${backup.storageS3Region}', renderStart);
  const renderEnd = source.indexOf('\n', renderLast);
  assert.ok(renderStart >= 0 && renderLast > renderStart);
  const rendered = new Function('backup', `return \`${source.slice(renderStart, renderEnd)}\`;`)(backup);
  const parsed = parse(rendered);
  for (const key of ['BACKUP_COVERAGE_MODE', 'BACKUP_MAX_AGE_HOURS', 'BACKUP_S3_REGION', 'BACKUP_STORAGE_S3_REGION', 'RESTIC_PASSWORD']) assert.equal(parsed[key], fixture[key]);
  assert.equal(backup.resticPasswordGenerated, false);
});
