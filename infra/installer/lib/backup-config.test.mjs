import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackupConfig, getBackupComposeProfiles, generateResticPassword } from './backup-config.mjs';

test('generateResticPassword returns a long random base64url string', () => {
  const a = generateResticPassword();
  const b = generateResticPassword();
  assert.ok(a.length >= 32);
  assert.notEqual(a, b);
});

test('resolveBackupConfig defaults to disabled and requires no other vars', () => {
  const config = resolveBackupConfig({ deployment: 'local', supabaseMode: 'cli-dev', values: {} });
  assert.equal(config.mode, 'disabled');
  assert.equal(config.storageMountEnabled, false);
  assert.equal(config.resticPasswordGenerated, false);
});

test('resolveBackupConfig rejects an invalid BACKUP_MODE', () => {
  assert.throws(
    () => resolveBackupConfig({ deployment: 'local', supabaseMode: 'selfhosted', values: { mode: 'weird' } }),
    /BACKUP_MODE must be "disabled" or "enabled"/,
  );
});

test('resolveBackupConfig rejects enabling backup in local cli-dev mode', () => {
  assert.throws(
    () => resolveBackupConfig({
      deployment: 'local',
      supabaseMode: 'cli-dev',
      values: {
        mode: 'enabled',
        s3Endpoint: 'https://s3.example.com',
        s3Bucket: 'bucket',
        s3AccessKeyId: 'id',
        s3SecretAccessKey: 'secret',
      },
    }),
    /RUNLY_SUPABASE_MODE=selfhosted/,
  );
});

test('resolveBackupConfig requires all BACKUP_S3_* vars when enabled', () => {
  assert.throws(
    () => resolveBackupConfig({
      deployment: 'external',
      values: { mode: 'enabled', s3Endpoint: 'https://s3.example.com' },
    }),
    /requires BACKUP_S3_ENDPOINT/,
  );
});

test('resolveBackupConfig rejects a non-positive BACKUP_RETENTION_DAYS', () => {
  assert.throws(
    () => resolveBackupConfig({
      deployment: 'external',
      values: {
        mode: 'enabled',
        retentionDays: '0',
        s3Endpoint: 'https://s3.example.com',
        s3Bucket: 'bucket',
        s3AccessKeyId: 'id',
        s3SecretAccessKey: 'secret',
      },
    }),
    /BACKUP_RETENTION_DAYS must be a positive integer/,
  );
});

test('resolveBackupConfig generates RESTIC_PASSWORD once and preserves it on re-runs', () => {
  const first = resolveBackupConfig({
    deployment: 'external',
    values: {
      mode: 'enabled',
      coverageMode: 'database-only',
      s3Endpoint: 'https://s3.example.com',
      s3Bucket: 'bucket',
      s3AccessKeyId: 'id',
      s3SecretAccessKey: 'secret',
    },
  });
  assert.ok(first.resticPassword.length >= 32);
  assert.equal(first.resticPasswordGenerated, true);

  const again = resolveBackupConfig({
    deployment: 'external',
    values: {
      mode: 'enabled',
      coverageMode: 'database-only',
      s3Endpoint: 'https://s3.example.com',
      s3Bucket: 'bucket',
      s3AccessKeyId: 'id',
      s3SecretAccessKey: 'secret',
      resticPassword: first.resticPassword,
    },
  });
  assert.equal(again.resticPassword, first.resticPassword);
  assert.equal(again.resticPasswordGenerated, false);
});

test('complete external backups require storage while database-only remains explicitly partial', () => {
  const values = { mode: 'enabled', s3Endpoint: 'https://s3.example.test', s3Bucket: 'test-bucket', s3AccessKeyId: 'fixture', s3SecretAccessKey: 'fixture' };
  assert.throws(() => resolveBackupConfig({ deployment: 'external', values }), /requires BACKUP_STORAGE_S3/);
  const partial = resolveBackupConfig({ deployment: 'external', values: { ...values, coverageMode: 'database-only' } });
  assert.equal(partial.coverageMode, 'database-only');
  const complete = resolveBackupConfig({ deployment: 'external', values: { ...values,
    storageS3Endpoint: 'https://storage.example.test', storageS3AccessKeyId: 'fixture', storageS3SecretAccessKey: 'fixture' } });
  assert.equal(complete.coverageMode, 'complete');
});

test('freshness is independent of retention and reruns preserve recovery password and regions', () => {
  const values = { mode: 'enabled', coverageMode: 'database-only', maxAgeHours: '48', retentionDays: '90',
    s3Endpoint: 'https://s3.example.test', s3Bucket: 'test-bucket', s3AccessKeyId: 'fixture', s3SecretAccessKey: 'fixture',
    resticPassword: 'original-fixture-password', s3Region: 'fixture-region', storageS3Region: 'source-region' };
  const config = resolveBackupConfig({ deployment: 'external', values });
  assert.equal(config.maxAgeHours, 48);
  assert.equal(config.retentionDays, 90);
  assert.equal(config.resticPassword, values.resticPassword);
  assert.equal(config.resticPasswordGenerated, false);
  assert.equal(config.s3Region, 'fixture-region');
  assert.equal(config.storageS3Region, 'source-region');
  for (const maxAgeHours of ['0', '-1', '1.5', 'bad', '1000000']) assert.throws(() => resolveBackupConfig({ deployment: 'external', values: { ...values, maxAgeHours } }), /BACKUP_MAX_AGE_HOURS/);
  assert.throws(() => resolveBackupConfig({ deployment: 'external', values: { ...values, coverageMode: 'unknown' } }), /BACKUP_COVERAGE_MODE/);
});

test('resolveBackupConfig applies defaults for schedule/retention/region when enabled', () => {
  const config = resolveBackupConfig({
    deployment: 'local',
    supabaseMode: 'selfhosted',
    values: {
      mode: 'enabled',
      s3Endpoint: 'https://s3.example.com',
      s3Bucket: 'bucket',
      s3AccessKeyId: 'id',
      s3SecretAccessKey: 'secret',
    },
  });
  assert.equal(config.scheduleCron, '0 3 * * *');
  assert.equal(config.retentionDays, 14);
  assert.equal(config.s3Region, 'us-east-1');
  assert.equal(config.storageMountEnabled, true);
});

test('getBackupComposeProfiles returns the deployment-specific profile only when enabled', () => {
  const disabled = resolveBackupConfig({ deployment: 'local', supabaseMode: 'selfhosted', values: {} });
  assert.deepEqual(getBackupComposeProfiles(disabled, 'local'), []);

  const enabled = resolveBackupConfig({
    deployment: 'local',
    supabaseMode: 'selfhosted',
    values: {
      mode: 'enabled',
      s3Endpoint: 'https://s3.example.com',
      s3Bucket: 'bucket',
      s3AccessKeyId: 'id',
      s3SecretAccessKey: 'secret',
    },
  });
  assert.deepEqual(getBackupComposeProfiles(enabled, 'local'), ['backup-local']);
  assert.deepEqual(getBackupComposeProfiles(enabled, 'external'), ['backup-external']);
});
