import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
const script = `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
fs.appendFileSync('/fixture/calls.jsonl',JSON.stringify(args)+'\\n');
if(args.includes('snapshots')) process.stdout.write(fs.readFileSync('/fixture/snapshots.json'));
if(args.includes('check') && process.env.FAIL_CHECK==='true') process.exit(1);
`;

test('freshness requires recent verified matching coverage rather than half the retention window',
  { skip: process.env.RUN_BACKUP_PIPELINE_TESTS !== '1', timeout: 90_000 }, async t => {
    const image = (await execute('docker', ['image', 'inspect', '--format', '{{.Id}}', 'runly-backup-recovery:verification'], { windowsHide: true })).stdout.trim();
    const snapshot = (hours, tags = ['runly-complete-v1'], hostname = 'fixture') => ({ id: 'a'.repeat(64),
      time: new Date(Date.now() - hours * 3600 * 1000).toISOString(), tags, hostname });
    const cases = [
      { name: 'fresh complete', snapshots: [snapshot(12)], pass: true },
      { name: '48 hours is stale despite 90-day retention', snapshots: [snapshot(48)] },
      { name: 'new partial cannot hide stale complete', snapshots: [snapshot(72), snapshot(1, ['runly-database-only-v1'])] },
      { name: 'pending snapshot cannot qualify', snapshots: [snapshot(1, ['runly-complete-v1', 'runly-pending-v1'])] },
      { name: 'legacy snapshots are unknown', snapshots: [snapshot(1, ['runly'])] },
      { name: 'other host cannot qualify', snapshots: [snapshot(1, ['runly-complete-v1'], 'other')] },
      { name: 'explicit partial coverage', mode: 'database-only', snapshots: [snapshot(1, ['runly-database-only-v1'])], pass: true },
      { name: 'configured maximum', hours: '12', snapshots: [snapshot(24)] },
      { name: 'clock in the future', snapshots: [snapshot(-12)] },
      { name: 'invalid maximum', hours: '0', snapshots: [snapshot(1)] },
      { name: 'empty repository', snapshots: [] },
      { name: 'integrity failure', snapshots: [snapshot(1)], failCheck: true },
    ];
    for (const scenario of cases) await t.test(scenario.name, async t => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'runly-backup-age-'));
      t.after(() => rm(dir, { recursive: true, force: true }));
      await mkdir(path.join(dir, 'bin'));
      await writeFile(path.join(dir, 'bin', 'restic'), script, { mode: 0o755 });
      await writeFile(path.join(dir, 'snapshots.json'), JSON.stringify(scenario.snapshots));
      const env = path.join(dir, 'fixture.env');
      await writeFile(env, ['RUNLY_INSTANCE_ID=fixture', 'BACKUP_S3_ENDPOINT=https://s3.example.test', 'BACKUP_S3_BUCKET=test-bucket',
        'RESTIC_PASSWORD=fixture-password', 'BACKUP_RETENTION_DAYS=90', `BACKUP_MAX_AGE_HOURS=${scenario.hours || '36'}`,
        `BACKUP_COVERAGE_MODE=${scenario.mode || 'complete'}`, `FAIL_CHECK=${Boolean(scenario.failCheck)}`,
        'PATH=/fixture/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'].join('\n'));
      let passed = true;
      try { await execute('docker', ['run', '--rm', '--env-file', env, '--mount', `type=bind,source=${dir},target=/fixture`, image, '/app/verify-backup.sh'], { windowsHide: true }); }
      catch { passed = false; }
      assert.equal(passed, Boolean(scenario.pass));
      const calls = (await readFile(path.join(dir, 'calls.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
      assert.ok(calls.every(args => args.includes('--no-lock')));
      assert.ok(calls.every(args => !args.some(x => ['init', 'unlock', 'prune', 'forget'].includes(x))));
      if (!scenario.pass && !scenario.failCheck) assert.ok(!calls.some(args => args.includes('check')), 'stale/incompatible snapshots fail before integrity check');
    });
  });
