import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runRecovery, parseArguments } from '../runly-recovery.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const snapshotId = 'b'.repeat(64);
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'runly-recovery-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'config.env');
  await writeFile(config, 'BACKUP_S3_ENDPOINT=https://s3.example.test\nBACKUP_S3_BUCKET=test-bucket\nRUNLY_INSTANCE_ID=fixture\nRESTIC_PASSWORD=test-password\nBACKUP_S3_ACCESS_KEY_ID=test-key\nBACKUP_S3_SECRET_ACCESS_KEY=test-secret\nDATABASE_URL=do-not-forward\n');
  return { dir, config };
}

test('CLI rejects mutation commands, duplicate flags, latest snapshots and arbitrary images', () => {
  for (const args of [['prune'], ['inspect', '--config', 'a', '--config', 'b'],
    ['extract', '--config', 'a', '--image', digest, '--snapshot', 'latest', '--output', 'b'],
    ['inspect', '--config', 'a', '--image', 'evil:1']]) assert.throws(() => parseArguments(args), { exitCode: 2 });
});

test('remote Docker context is rejected before credentials reach a container', async t => {
  const { config } = await fixture(t);
  const calls = [];
  await assert.rejects(runRecovery(['inspect', '--config', config, '--image', digest], { run: async (_, args) => {
    calls.push(args);
    return JSON.stringify('ssh://docker.example.test');
  } }), { exitCode: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'context');
});

test('inspect pins the resolved image, never forwards secrets in argv and cleans temporary config', async t => {
  const { config } = await fixture(t);
  const calls = [];
  let envFile;
  const result = await runRecovery(['inspect', '--config', config, '--image', digest], { run: async (_, args) => {
    calls.push(args);
    if (args[0] === 'context') return JSON.stringify('npipe:////./pipe/docker_engine');
    if (args[0] === 'image') return JSON.stringify({ Id: digest });
    envFile = args[args.indexOf('--env-file') + 1];
    assert.ok(!(await readFile(envFile, 'utf8')).includes('do-not-forward'));
    return JSON.stringify([{ id: snapshotId, hostname: 'fixture', time: '2026-10-12T00:00:00Z', paths: ['private-path'] }]);
  } });
  assert.equal(result.snapshots[0].coverage, 'legacy-unknown');
  assert.ok(!JSON.stringify(result).includes('private-path'));
  assert.ok(!JSON.stringify(calls).includes('test-password'));
  assert.ok(calls[2].includes('--no-lock'));
  assert.ok(calls[2].includes('--no-cache'));
  await assert.rejects(stat(envFile), { code: 'ENOENT' });
});

test('a foreign snapshot and malicious node fail before creating output', async t => {
  const { dir, config } = await fixture(t);
  const output = path.join(dir, 'output');
  const base = ['extract', '--config', config, '--image', digest, '--snapshot', snapshotId, '--output', output];
  for (const foreign of [true, false]) {
    await assert.rejects(runRecovery(base, { run: async (_, args) => {
      if (args[0] === 'context') return JSON.stringify('npipe:////./pipe/docker_engine');
    if (args[0] === 'image') return JSON.stringify({ Id: digest });
      if (args.includes('snapshots')) return JSON.stringify([{ id: snapshotId, hostname: foreign ? 'other' : 'fixture', time: '2026-10-12T00:00:00Z' }]);
      return [JSON.stringify({ struct_type: 'snapshot', id: snapshotId }), JSON.stringify({ struct_type: 'node', type: 'symlink', path: '/link' })].join('\n');
    } }), { exitCode: 2 });
    await assert.rejects(stat(output), { code: 'ENOENT' });
  }
});

test('child failure cleans credentials and never retries with repository mutation', async t => {
  const { config } = await fixture(t);
  let envFile;
  const calls = [];
  await assert.rejects(runRecovery(['inspect', '--config', config, '--image', digest], { run: async (_, args) => {
    calls.push(args);
    if (args[0] === 'context') return JSON.stringify('npipe:////./pipe/docker_engine');
    if (args[0] === 'image') return JSON.stringify({ Id: digest });
    envFile = args[args.indexOf('--env-file') + 1];
    throw new Error('fixture failure');
  } }));
  await assert.rejects(stat(envFile), { code: 'ENOENT' });
  assert.ok(!calls.flat().some(a => ['init', 'unlock', 'forget', 'prune'].includes(a)));
});

test('interrupted extraction retains an incomplete marker and cleans only its own container and credentials', async t => {
  const { dir, config } = await fixture(t);
  const output = path.join(dir, 'interrupted');
  const controller = new AbortController();
  const removed = [];
  let restoreName, envFile;
  await assert.rejects(runRecovery(['extract', '--config', config, '--image', digest, '--snapshot', snapshotId, '--output', output], {
    signal: controller.signal,
    run: async (_, args) => {
      if (args[0] === 'context') return JSON.stringify('npipe:////./pipe/docker_engine');
    if (args[0] === 'image') return JSON.stringify({ Id: digest });
      if (args[0] === 'rm') { removed.push(args.at(-1)); return ''; }
      envFile = args[args.indexOf('--env-file') + 1];
      if (args.includes('snapshots')) return JSON.stringify([{ id: snapshotId, hostname: 'fixture', time: '2026-10-12T00:00:00Z' }]);
      if (args.includes('ls')) return [JSON.stringify({ struct_type: 'snapshot', id: snapshotId }),
        JSON.stringify({ struct_type: 'node', type: 'file', path: '/db.dump' })].join('\n');
      restoreName = args[args.indexOf('--name') + 1];
      controller.abort();
      throw new Error('interrupted fixture');
    },
  }));
  assert.ok((await readFile(path.join(output, '.runly-recovery-incomplete'), 'utf8')).includes('Extracción'));
  assert.deepEqual(removed, [restoreName]);
  assert.match(restoreName, /^runly-recovery-/);
  await assert.rejects(stat(envFile), { code: 'ENOENT' });
});
