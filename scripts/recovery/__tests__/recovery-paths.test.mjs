import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateOutputPath, validateSnapshotNodes } from '../recovery-paths.mjs';

test('extraction requires a new destination and rejects junction ancestors and traversal', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'runly-recovery-paths-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(await validateOutputPath(path.join(dir, 'new')), path.join(dir, 'new'));
  await assert.rejects(validateOutputPath(dir), { exitCode: 2 });
  await assert.rejects(validateOutputPath(path.parse(dir).root), { exitCode: 2 });
  await assert.rejects(validateOutputPath(`${dir}/../escape`), { exitCode: 2 });
  await mkdir(path.join(dir, 'real'));
  await symlink(path.join(dir, 'real'), path.join(dir, 'link'), 'junction');
  await assert.rejects(validateOutputPath(path.join(dir, 'link', 'new')), { exitCode: 2 });
});

test('snapshot validation rejects links, traversal, Windows collisions and file ancestors', () => {
  const file = p => ({ path: p, type: 'file' });
  validateSnapshotNodes([{ path: '/tmp', type: 'dir' }, file('/tmp/db.dump')]);
  for (const nodes of [[file('/../bad')], [file('/tmp/../bad')], [file('/tmp\\bad')],
    [{ path: '/tmp/link', type: 'symlink' }], [file('/a'), file('/a/b')]]) assert.throws(() => validateSnapshotNodes(nodes), { exitCode: 2 });
  for (const nodes of [[file('/a'), file('/A')], [file('/a:stream')], [file('/NUL.txt')], [file('/name.')]]) assert.throws(() => validateSnapshotNodes(nodes, { windows: true }), { exitCode: 2 });
});
