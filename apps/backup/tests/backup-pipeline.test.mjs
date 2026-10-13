import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSourceInventory, postgresEnv, relativeParts } from '../backup-coverage.mjs';
import { assessRecovery } from '../../../scripts/recovery/recovery-assessment.mjs';

const execute = promisify(execFile);
const buckets = ['runly-files', 'runly-website', 'runly-chat', 'runly-notes', 'runly-storefront'];
const inventory = { buckets: buckets.map(id => ({ id })), modules: ['custom.fixture'],
  objects: buckets.map(bucket => ({ bucket, name: 'known.txt', version: null, size: String(`known-${bucket}`.length) })) };

test('source inventory rejects traversal, unaccounted buckets, duplicates and unverifiable sizes', () => {
  validateSourceInventory(inventory);
  for (const change of [{ name: '../outside' }, { bucket: 'unknown' }, { size: null }, { size: '-1' }, { version: '../version' }]) {
    assert.throws(() => validateSourceInventory({ ...inventory, objects: [{ ...inventory.objects[0], ...change }] }));
  }
  assert.throws(() => relativeParts('/absolute'));
  assert.throws(() => validateSourceInventory({ ...inventory, objects: [inventory.objects[0], inventory.objects[0]] }));
  const pg = postgresEnv({ DATABASE_URL: 'postgresql://fixture:encoded%20password@database.example.test:5432/fixture?sslmode=require' });
  assert.equal(pg.PGPASSWORD, 'encoded password');
  assert.equal(pg.PGSSLMODE, 'require');
});

const fake = String.raw`#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const command=path.basename(process.argv[1]); const args=process.argv.slice(2); const fail=process.env.FAIL_STAGE;
fs.appendFileSync('/fixture/commands.log',JSON.stringify({command,args})+'\n');
if(command==='pg_dump') {
  if(args.includes('--version')) { console.log('pg_dump (PostgreSQL) 17.6'); process.exit(0); }
  if(fail==='dump') process.exit(1);
  fs.writeFileSync(args[args.indexOf('-f')+1],'PGDMPfixture');
} else if(command==='psql') {
  if(args.join(' ').includes('SHOW server_version_num')) { console.log(fail==='version'?'180000':'170000'); process.exit(0); }
  if(fail==='inventory') process.exit(1);
  const data=JSON.parse(fs.readFileSync('/fixture/inventory.json','utf8'));
  const countFile='/fixture/inventory-count'; const count=fs.existsSync(countFile)?Number(fs.readFileSync(countFile)):0;
  fs.writeFileSync(countFile,String(count+1));
  if(fail==='drift' && count>0) data.objects[0].size='999';
  if(fail==='empty-bucket') data.objects=data.objects.filter(o=>o.bucket!=='runly-notes');
  console.log(JSON.stringify(data));
} else if(command==='rclone') {
  const bucket=args[1].slice('runlystorage:'.length);
  if(fail==='storage-'+bucket) process.exit(1);
  fs.mkdirSync(args[2],{recursive:true});
  if(fail==='empty-bucket' && bucket==='runly-notes') process.exit(0);
  fs.writeFileSync(path.join(args[2],'known.txt'),'known-'+bucket);
  if(fail==='extra-object') fs.writeFileSync(path.join(args[2],'unaccounted.txt'),'extra');
} else if(command==='restic') {
  if(args[0]==='snapshots') { if(fail==='access') process.exit(12); console.log('[]'); }
  if(args[0]==='backup') {
    fs.mkdirSync('/fixture/captured'); fs.cpSync(args[1],'/fixture/captured',{recursive:true});
    console.log(JSON.stringify({message_type:'summary',snapshot_id:'a'.repeat(64)}));
    if(fail==='upload') process.exit(3);
  }
  if(args[0]==='check' && fail==='integrity') process.exit(1);
  if(args[0]==='tag' && fail==='tag') process.exit(1);
  if(args[0]==='forget' && fail==='prune') process.exit(1);
}
`;

test('Docker backup pipeline only marks complete after all required copies and integrity checks',
  { skip: process.env.RUN_BACKUP_PIPELINE_TESTS !== '1', timeout: 180_000 }, async t => {
    const image = (await execute('docker', ['image', 'inspect', '--format', '{{.Id}}', 'runly-backup-recovery:verification'], { windowsHide: true })).stdout.trim();
    for (const failure of ['', 'dump', 'inventory', 'version', 'storage-runly-chat', 'modules', 'config', 'drift', 'access', 'upload', 'integrity', 'tag', 'prune', 'local-missing', 'local-complete', 'empty-bucket', 'extra-object', 'database-only']) {
      await t.test(failure || 'complete external', async t => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'runly-backup-pipeline-'));
        t.after(() => rm(dir, { recursive: true, force: true }));
        for (const name of ['bin', 'modules/custom.fixture', 'config', 'storage']) await mkdir(path.join(dir, name), { recursive: true });
        for (const command of ['pg_dump', 'psql', 'rclone', 'restic']) await writeFile(path.join(dir, 'bin', command), fake, { mode: 0o755 });
        await writeFile(path.join(dir, 'inventory.json'), JSON.stringify(inventory));
        if (failure !== 'modules') await writeFile(path.join(dir, 'modules/custom.fixture/module.manifest.js'), 'fixture source');
        if (failure !== 'config') await writeFile(path.join(dir, 'config/.env.external'), 'FIXTURE=true\n');
        if (failure === 'local-complete') for (const bucket of buckets) {
          await mkdir(path.join(dir, 'storage', 'stub', 'stub', bucket), { recursive: true });
          await writeFile(path.join(dir, 'storage', 'stub', 'stub', bucket, 'known.txt'), `known-${bucket}`);
        }
        const env = path.join(dir, 'fixture.env');
        await writeFile(env, ['RUNLY_INSTANCE_ID=fixture', 'DATABASE_URL=postgresql://fixture:fixture@database.example.test:5432/fixture',
          'BACKUP_S3_ENDPOINT=https://s3.example.test', 'BACKUP_S3_BUCKET=test-bucket', 'RESTIC_PASSWORD=fixture-password',
          'BACKUP_S3_ACCESS_KEY_ID=fixture', 'BACKUP_S3_SECRET_ACCESS_KEY=fixture',
          'BACKUP_STORAGE_S3_ENDPOINT=https://storage.example.test', 'BACKUP_STORAGE_S3_ACCESS_KEY_ID=fixture', 'BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=fixture',
          `FAIL_STAGE=${failure}`, `BACKUP_COVERAGE_MODE=${failure === 'database-only' ? 'database-only' : 'complete'}`,
          'PATH=/fixture/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'].join('\n'));
        const args = ['run', '--rm', '--env-file', env, '--mount', `type=bind,source=${dir},target=/fixture`,
          '--mount', `type=bind,source=${path.join(dir, 'modules')},target=/modules-source,readonly`,
          '--mount', `type=bind,source=${path.join(dir, 'config')},target=/config-source,readonly`];
        if (failure.startsWith('local-')) args.push('--mount', `type=bind,source=${path.join(dir, 'storage')},target=/storage-source,readonly`);
        args.push(image, '/app/run-backup.sh');
        let succeeded = true;
        try { await execute('docker', args, { windowsHide: true }); } catch { succeeded = false; }
        const calls = (await readFile(path.join(dir, 'commands.log'), 'utf8')).trim().split('\n').map(JSON.parse);
        const restic = calls.filter(c => c.command === 'restic').map(c => c.args[0]);
        assert.ok(!JSON.stringify(calls).includes('postgresql://'), 'database credentials stay out of argv');
        assert.ok(!restic.includes('unlock'));
        assert.ok(!restic.includes('init'), 'access failures must not initialize another repository');
        if (!failure || ['database-only', 'local-complete', 'empty-bucket'].includes(failure)) {
          assert.ok(succeeded);
          assert.deepEqual(restic, ['snapshots', 'backup', 'check', 'tag', 'forget']);
          const tags = calls.find(c => c.command === 'restic' && c.args[0] === 'tag').args;
          assert.ok(tags.includes(`runly-${failure === 'database-only' ? 'database-only' : 'complete'}-v1`));
          const assessment = await assessRecovery(path.join(dir, 'captured'));
          assert.equal(assessment.status, failure === 'database-only' ? 'incomplete' : 'complete');
          if (failure !== 'database-only') {
            assert.equal(calls.filter(c => c.command === 'rclone').length, failure === 'local-complete' ? 0 : 5);
            assert.equal(assessment.verifiedFiles, failure === 'empty-bucket' ? 8 : 9);
          }
        } else {
          assert.equal(succeeded, false);
          if (failure !== 'prune') assert.ok(!restic.includes('forget'));
          if (!['upload', 'integrity', 'tag', 'prune'].includes(failure)) assert.ok(!restic.includes('backup'));
          if (['upload', 'integrity'].includes(failure)) assert.ok(!restic.includes('tag'));
        }
      });
    }
  });
