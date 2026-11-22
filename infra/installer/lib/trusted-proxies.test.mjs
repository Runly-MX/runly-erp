import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateProxyList, assertTrustedProxiesEnv, backupEnvFile, restoreLatestEnvBackup } from './trusted-proxies.mjs';
import { appendMissingEnvText, preserveEnvAssignments, syncMissingEnvFile } from './env-compat.mjs';
import { spawnSync } from 'node:child_process';
import { ensureTrustedProxiesDefault } from './trusted-proxies.mjs';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'runly-proxies-'));
const quiet = () => {};

test('validates IPs, CIDR, IPv6 and shortcuts strictly', () => {
  assert.equal(validateProxyList('172.18.0.0/16, 10.0.0.5, 2001:db8::/32, loopback, private').ok, true);
  assert.deepEqual(validateProxyList('10.0.0.0/33, nope, 1.2.3.4/8/9, 10.0.0.1/-1, 999.1.1.1').invalid, ['10.0.0.0/33', 'nope', '1.2.3.4/8/9', '10.0.0.1/-1', '999.1.1.1']);
  assert.deepEqual(validateProxyList('0.0.0.0/0, ::/0').broad, ['0.0.0.0/0', '::/0']);
  assert.equal(validateProxyList('').ok, true);
});

test('an invalid value aborts without touching the file; a valid or absent one passes', async () => {
  const dir = await tmp(), file = path.join(dir, '.env.local');
  await fs.writeFile(file, 'RUNLY_TRUSTED_PROXIES=10.0.0.0/99\nSECRET=keep\n');
  await assert.rejects(assertTrustedProxiesEnv(file, { log: quiet }), /invalidas: 10\.0\.0\.0\/99/);
  assert.equal(await fs.readFile(file, 'utf8'), 'RUNLY_TRUSTED_PROXIES=10.0.0.0/99\nSECRET=keep\n');
  await fs.writeFile(file, 'RUNLY_TRUSTED_PROXIES="172.18.0.0/16"\n');
  assert.deepEqual(await assertTrustedProxiesEnv(file, { log: quiet }), { ok: true });
  assert.deepEqual(await assertTrustedProxiesEnv(path.join(dir, 'missing'), { log: quiet }), { ok: true });
});

test('template no longer ships private; the sync appends the key blank', () => {
  assert.equal(appendMissingEnvText('A=1', 'RUNLY_TRUSTED_PROXIES=').text, 'A=1\nRUNLY_TRUSTED_PROXIES=\n');
});

test('migration adds the key only when missing and keeps an existing or explicitly empty value', () => {
  const template = 'RUNLY_TRUSTED_PROXIES=private\n';
  assert.doesNotMatch(appendMissingEnvText('A=1', template).text, /private/);
  const custom = 'RUNLY_TRUSTED_PROXIES=172.18.0.0/16\n';
  assert.equal(appendMissingEnvText(custom, template).text, custom);
  assert.equal(appendMissingEnvText('RUNLY_TRUSTED_PROXIES=\n', template).text, 'RUNLY_TRUSTED_PROXIES=\n');
  const regenerated = preserveEnvAssignments('A=1\n', custom);
  assert.equal(preserveEnvAssignments(regenerated, custom), regenerated);
  assert.equal(regenerated.match(/RUNLY_TRUSTED_PROXIES/g).length, 1);
});

test('backups are idempotent and restore the previous configuration', async () => {
  const dir = await tmp(), file = path.join(dir, '.env.external');
  await fs.writeFile(file, 'RUNLY_TRUSTED_PROXIES=10.0.0.1\n');
  const first = await backupEnvFile(file);
  assert.equal(await backupEnvFile(file), first);
  await fs.writeFile(file, 'changed\n');
  await restoreLatestEnvBackup(file);
  assert.equal(await fs.readFile(file, 'utf8'), 'RUNLY_TRUSTED_PROXIES=10.0.0.1\n');
});

const flow = async (file, cidrs) => {
  const template = path.join(path.dirname(file), 'tpl');
  await fs.writeFile(template, 'RUNLY_TRUSTED_PROXIES=\nRUNLY_MCP_TRUSTED_PROXIES=\n');
  await backupEnvFile(file);
  await assertTrustedProxiesEnv(file, { log: quiet });
  await ensureTrustedProxiesDefault(file, { mode: 'local', cidrs, log: quiet });
  await syncMissingEnvFile(file, template, { log: quiet });
  return fs.readFile(file, 'utf8');
};

test('update flow: absent keys get only the stack network, idempotently, never private', async () => {
  const file = path.join(await tmp(), '.env.local');
  await fs.writeFile(file, 'SECRET=keep\n');
  const once = await flow(file, c => (assert.equal(c, 'runly-api-local'), ['172.18.0.0/16']));
  assert.match(once, /^RUNLY_TRUSTED_PROXIES=172\.18\.0\.0\/16$/m);
  assert.doesNotMatch(once, /private/);
  assert.equal(await flow(file, () => ['10.9.0.0/16']), once);
  assert.ok((await fs.readdir(path.join(path.dirname(file), '.runly-installer', 'env-backups'))).length >= 1);
});

test('update flow: explicit values (custom, empty, private) are conserved byte for byte', async () => {
  for (const body of ['RUNLY_TRUSTED_PROXIES=203.0.113.4\nRUNLY_MCP_TRUSTED_PROXIES=\n', 'RUNLY_TRUSTED_PROXIES=private\nRUNLY_MCP_TRUSTED_PROXIES=private\n']) {
    const file = path.join(await tmp(), '.env.external');
    await fs.writeFile(file, body);
    assert.equal(await flow(file, () => ['172.18.0.0/16']), body);
  }
});

test('update flow: no running container leaves the key blank; invalid value aborts leaving the file intact', async () => {
  const file = path.join(await tmp(), '.env.local');
  await fs.writeFile(file, 'A=1\n');
  assert.match(await flow(file, () => []), /^RUNLY_TRUSTED_PROXIES=$/m);
  const bad = 'RUNLY_TRUSTED_PROXIES=10.0.0.0/99\nA=1\n';
  await fs.writeFile(file, bad);
  await assert.rejects(flow(file, () => ['172.18.0.0/16']), /invalidas/);
  assert.equal(await fs.readFile(file, 'utf8'), bad);
});

test('setup scripts validate, back up and migrate before any docker compose up', async () => {
  for (const name of ['setup-local.mjs', 'setup-external.mjs']) {
    const src = await fs.readFile(new URL(`../${name}`, import.meta.url), 'utf8');
    const at = text => src.indexOf(text);
    assert.ok(at('backupEnvFile(') > 0 && at('backupEnvFile(') < at('assertTrustedProxiesEnv(')); 
    assert.ok(at('assertTrustedProxiesEnv(') < at('ensureTrustedProxiesDefault('));
    assert.ok(at('ensureTrustedProxiesDefault(') < src.indexOf('"up"'), name);
  }
});

test('diagnostic never prints other env values and refuses the probe without --yes', async () => {
  const dir = await tmp();
  for (const f of ['diagnose-trusted-proxies.mjs']) await fs.copyFile(new URL(`../${f}`, import.meta.url), path.join(dir, f));
  await fs.mkdir(path.join(dir, 'lib'));
  await fs.copyFile(new URL('./trusted-proxies.mjs', import.meta.url), path.join(dir, 'lib', 'trusted-proxies.mjs'));
  await fs.writeFile(path.join(dir, '.env.local'), 'JWT_SECRET=super-secret-value\nDATABASE_URL=postgres://u:pw@h/db\nRUNLY_TRUSTED_PROXIES=172.18.0.0/16\n');
  const run = (...a) => spawnSync(process.execPath, [path.join(dir, 'diagnose-trusted-proxies.mjs'), '--mode', 'local', ...a], { encoding: 'utf8', env: { ...process.env, PATH: '' } });
  const out = run();
  assert.doesNotMatch(out.stdout + out.stderr, /super-secret|postgres:|pw@/);
  assert.match(out.stdout, /RUNLY_TRUSTED_PROXIES=172\.18\.0\.0\/16/);
  const probe = run('--probe', 'http://127.0.0.1:9');
  assert.equal(probe.status, 2);
  assert.match(probe.stderr, /--yes/);
});
