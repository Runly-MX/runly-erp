import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runRecovery } from '../runly-recovery.mjs';
import { hashFile } from '../recovery-assessment.mjs';

const execute = promisify(execFile);
test('read-only S3 recovery extracts complete and legacy snapshots and restores an isolated PostgreSQL dump',
  { skip: process.env.RUN_RECOVERY_S3_TESTS !== '1', timeout: 180_000 }, async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'runly-recovery-s3-'));
    const token = randomBytes(8).toString('hex');
    const minio = `runly-recovery-s3-${token}`;
    const postgres = `runly-recovery-pg-${token}`;
    const containers = [];
    t.after(async () => {
      for (const name of containers) await execute('docker', ['rm', '--force', name], { windowsHide: true }).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    });
    const docker = async args => (await execute('docker', args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true })).stdout.trim();
    const backupImage = await docker(['image', 'inspect', '--format', '{{.Id}}', 'runly-backup-recovery:verification']);
    const minioImage = await docker(['image', 'inspect', '--format', '{{.Id}}', 'minio/minio:latest']);
    const pgImage = await docker(['image', 'inspect', '--format', '{{.Id}}', 'postgres:17-alpine']);
    const password = randomBytes(24).toString('hex');
    const readPassword = randomBytes(24).toString('hex');
    const envFile = path.join(dir, 'minio.env');
    await writeFile(envFile, `MINIO_ROOT_USER=fixtureadmin\nMINIO_ROOT_PASSWORD=${password}\n`, { mode: 0o600 });
    await docker(['run', '-d', '--name', minio, '--env-file', envFile, '-p', '127.0.0.1::9000', minioImage, 'server', '/data']);
    containers.push(minio);
    const port = (await docker(['port', minio, '9000/tcp'])).match(/:(\d+)$/)?.[1];
    const endpoint = `http://host.docker.internal:${port}`;
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/minio/health/ready`)).ok) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'disposable S3 must become ready');
    const mcEnv = path.join(dir, 'mc.env');
    await writeFile(mcEnv, `MC_HOST_fixture=http://fixtureadmin:${password}@host.docker.internal:${port}\n`, { mode: 0o600 });
    const mc = args => docker(['run', '--rm', '--env-file', mcEnv, '--mount', `type=bind,source=${dir},target=/fixture`, '--entrypoint', '/usr/bin/mc', minioImage, ...args]);
    await mc(['mb', 'fixture/test-bucket']);
    const adminEnv = path.join(dir, 'admin.env');
    await writeFile(adminEnv, `RESTIC_REPOSITORY=s3:${endpoint}/test-bucket/original-instance\nRESTIC_PASSWORD=${password}\nAWS_ACCESS_KEY_ID=fixtureadmin\nAWS_SECRET_ACCESS_KEY=${password}\n`, { mode: 0o600 });
    const restic = args => docker(['run', '--rm', '--env-file', adminEnv, '--mount', `type=bind,source=${dir},target=/fixture`, '--entrypoint', 'restic', backupImage, '--no-cache', ...args]);
    await restic(['init']);
    const pgEnv = path.join(dir, 'pg.env');
    await writeFile(pgEnv, `POSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
    await docker(['run', '-d', '--name', postgres, '--env-file', pgEnv, pgImage]);
    containers.push(postgres);
    for (let i = 0; i < 50; i++) {
      try { await docker(['exec', postgres, 'pg_isready', '-U', 'postgres']); break; } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    await docker(['exec', postgres, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE TABLE recovery_fixture(value text); INSERT INTO recovery_fixture VALUES ('recoverable');"]);
    await docker(['exec', postgres, 'pg_dump', '-U', 'postgres', '-Fc', '-f', '/tmp/db.dump', 'postgres']);
    const source = path.join(dir, 'source');
    await mkdir(source);
    await docker(['cp', `${postgres}:/tmp/db.dump`, path.join(source, 'db.dump')]);
    const files = ['db.dump', 'config/.env.external', 'modules/custom.fixture/module.manifest.js'];
    for (const name of ['storage', 'modules', 'config']) await mkdir(path.join(source, name), { recursive: true });
    await mkdir(path.join(source, 'modules', 'custom.fixture'));
    await writeFile(path.join(source, 'config', '.env.external'), 'FIXTURE=true\n');
    await writeFile(path.join(source, 'modules', 'custom.fixture', 'module.manifest.js'), 'export default { key: "custom.fixture" };\n');
    for (const bucket of ['runly-files', 'runly-website', 'runly-chat', 'runly-notes', 'runly-storefront']) {
      await mkdir(path.join(source, 'storage', bucket));
      const name = `storage/${bucket}/known.txt`;
      await writeFile(path.join(source, name), `known-${bucket}`);
      files.push(name);
    }
    // Historical layout: no manifest. It must never be relabeled complete.
    await restic(['backup', '/fixture/source', '--host', 'original-instance', '--tag', 'runly']);
    const legacy = JSON.parse(await restic(['snapshots', '--json']))[0].id;
    const inventory = [];
    for (const name of files) inventory.push({ path: name, bytes: (await stat(path.join(source, name))).size, sha256: await hashFile(path.join(source, name)) });
    await writeFile(path.join(source, 'backup-manifest.json'), JSON.stringify({ schemaVersion: 1, coverageMode: 'complete', instanceId: 'original-instance',
      createdAt: new Date().toISOString(), resources: Object.fromEntries(['database', 'storage', 'modules', 'config'].map(k => [k, { status: 'complete' }])), files: inventory }));
    await restic(['backup', '/fixture/source', '--host', 'original-instance', '--tag', 'runly-complete-v1']);
    const snapshots = JSON.parse(await restic(['snapshots', '--json']));
    const complete = snapshots.find(s => s.tags?.includes('runly-complete-v1')).id;
    const policyFile = path.join(dir, 'readonly.json');
    await writeFile(policyFile, JSON.stringify({ Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Action: ['s3:ListBucket', 's3:GetBucketLocation'], Resource: ['arn:aws:s3:::test-bucket'] },
      { Effect: 'Allow', Action: ['s3:GetObject'], Resource: ['arn:aws:s3:::test-bucket/*'] },
    ] }));
    await mc(['admin', 'user', 'add', 'fixture', 'recoveryreader', readPassword]);
    await mc(['admin', 'policy', 'create', 'fixture', 'recovery-read', '/fixture/readonly.json']);
    await mc(['admin', 'policy', 'attach', 'fixture', 'recovery-read', '--user', 'recoveryreader']);
    const recoveryConfig = path.join(dir, 'recovery.env');
    await writeFile(recoveryConfig, `BACKUP_S3_ENDPOINT=${endpoint}\nBACKUP_S3_BUCKET=test-bucket\nRUNLY_INSTANCE_ID=original-instance\nRESTIC_PASSWORD=${password}\nBACKUP_S3_ACCESS_KEY_ID=recoveryreader\nBACKUP_S3_SECRET_ACCESS_KEY=${readPassword}\n`, { mode: 0o600 });
    const before = await mc(['ls', '--recursive', '--json', 'fixture/test-bucket/original-instance']);
    const inspected = await runRecovery(['inspect', '--config', recoveryConfig, '--image', backupImage]);
    assert.equal(inspected.snapshots.length, 2);
    const output = path.join(dir, 'complete');
    const result = await runRecovery(['extract', '--config', recoveryConfig, '--image', backupImage, '--snapshot', complete, '--output', output]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.assessment.status, 'complete');
    assert.equal(result.assessment.databaseValidation, 'pg_restore-list');
    assert.equal(await readFile(path.join(output, 'fixture', 'source', 'storage', 'runly-chat', 'known.txt'), 'utf8'), 'known-runly-chat');
    const restoredDump = path.join(output, 'fixture', 'source', 'db.dump');
    await docker(['cp', restoredDump, `${postgres}:/tmp/recovered.dump`]);
    await docker(['exec', postgres, 'createdb', '-U', 'postgres', 'recovered']);
    await docker(['exec', postgres, 'pg_restore', '-U', 'postgres', '-d', 'recovered', '/tmp/recovered.dump']);
    assert.equal(await docker(['exec', postgres, 'psql', '-U', 'postgres', '-d', 'recovered', '-Atc', 'SELECT value FROM recovery_fixture']), 'recoverable');
    const old = await runRecovery(['extract', '--config', recoveryConfig, '--image', backupImage, '--snapshot', legacy, '--output', path.join(dir, 'legacy')]);
    assert.equal(old.assessment.status, 'legacy-unknown');
    assert.equal(await mc(['ls', '--recursive', '--json', 'fixture/test-bucket/original-instance']), before, 'read-only recovery must not create locks or change repository objects');
    const wrongConfig = path.join(dir, 'wrong.env');
    await writeFile(wrongConfig, (await readFile(recoveryConfig, 'utf8')).replace(`RESTIC_PASSWORD=${password}`, 'RESTIC_PASSWORD=wrong-fixture-password'));
    await assert.rejects(runRecovery(['inspect', '--config', wrongConfig, '--image', backupImage]), e => e.exitCode === 1 && !e.message.includes(password));
  });
