import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRecoveryConfig, serializeRecoveryEnv, validateImage, validateSnapshotId, validateDockerEndpoint } from '../recovery-config.mjs';

const values = { BACKUP_S3_ENDPOINT: 'https://s3.example.test', BACKUP_S3_BUCKET: 'test-bucket',
  RUNLY_INSTANCE_ID: 'original-instance', BACKUP_S3_ACCESS_KEY_ID: 'fixture-id',
  BACKUP_S3_SECRET_ACCESS_KEY: 'fixture-secret', RESTIC_PASSWORD: 'fixture-password' };

test('recovery only forwards allowlisted credentials, preserves the source and parses dotenv without evaluation', () => {
  const parsed = resolveRecoveryConfig(Object.entries({ ...values, DATABASE_URL: 'private-value', BACKUP_S3_REGION: 'test-region' }).map(([k,v]) => `${k}="${v}"`).join('\r\n'));
  assert.equal(parsed.env.RESTIC_REPOSITORY, 's3:https://s3.example.test/test-bucket/original-instance');
  assert.equal(parsed.env.AWS_DEFAULT_REGION, 'test-region');
  assert.equal(Object.keys(parsed.env).length, 5);
  assert.ok(!serializeRecoveryEnv(parsed.env).includes('private-value'));
  assert.equal(resolveRecoveryConfig({ ...values, RESTIC_PASSWORD: '$(do-not-execute)' }).env.RESTIC_PASSWORD, '$(do-not-execute)');
});

test('missing passwords and source identities are rejected instead of generated', () => {
  for (const key of Object.keys(values)) assert.throws(() => resolveRecoveryConfig({ ...values, [key]: '' }), { exitCode: 2 });
});

test('credential injection, unsafe endpoints and repository paths are rejected without echoing values', () => {
  for (const change of [{ RESTIC_PASSWORD: 'secret\nEVIL=true' }, { RUNLY_INSTANCE_ID: '../other' },
    { BACKUP_S3_BUCKET: 'test/other' }, { BACKUP_S3_ENDPOINT: 'https://user:secret@s3.example.test' },
    { BACKUP_S3_ENDPOINT: 'https://s3.example.test/path' }, { BACKUP_S3_ENDPOINT: 'http://s3.example.test' }]) {
    assert.throws(() => resolveRecoveryConfig({ ...values, ...change }), e => e.exitCode === 2 && !e.message.includes('secret'));
  }
  assert.equal(resolveRecoveryConfig({ ...values, BACKUP_S3_ENDPOINT: 'http://127.0.0.1:9000' }).env.RESTIC_REPOSITORY, 's3:http://127.0.0.1:9000/test-bucket/original-instance');
});

test('images are official versioned backups or explicit immutable local digests', () => {
  assert.equal(validateImage(`sha256:${'a'.repeat(64)}`), `sha256:${'a'.repeat(64)}`);
  validateImage('raulbellosom/runlyerp:backup-v1');
  for (const image of ['evil/image:1', 'raulbellosom/runlyerp:backup-latest', 'raulbellosom/runlyerp:api-v1', '--privileged']) assert.throws(() => validateImage(image), { exitCode: 2 });
  validateSnapshotId('abcdef12');
  for (const id of ['latest', '../test', '--help', '123']) assert.throws(() => validateSnapshotId(id), { exitCode: 2 });
});

test('a Docker bind mount can only target the local daemon', () => {
  validateDockerEndpoint('unix:///var/run/docker.sock');
  validateDockerEndpoint('npipe:////./pipe/docker_engine');
  for (const endpoint of ['ssh://docker.example.test', 'tcp://127.0.0.1:2375', undefined]) assert.throws(() => validateDockerEndpoint(endpoint), { exitCode: 2 });
});
