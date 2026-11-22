import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateProxyList, assertTrustedProxiesEnv, backupEnvFile, restoreLatestEnvBackup } from './trusted-proxies.mjs';
import { appendMissingEnvText, preserveEnvAssignments } from './env-compat.mjs';

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

test('migration adds the key only when missing and keeps an existing or explicitly empty value', () => {
  const template = 'RUNLY_TRUSTED_PROXIES=private\n';
  assert.match(appendMissingEnvText('A=1\n', template).text, /RUNLY_TRUSTED_PROXIES=private/);
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
