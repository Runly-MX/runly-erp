import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { configureFirebase, preserveFirebaseEnv, FIREBASE_DEFAULTS } from './firebase-config.mjs';

async function fixture(t, text) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-firebase-installer-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const envFile = path.join(root, '.env.external');
  await fs.writeFile(envFile, text);
  return { root, envFile, credential: path.join(root, '.secrets/firebase/service-account.json') };
}

test('preparation adds missing defaults once, preserves original env and never invents credentials', async t => {
  const original = 'JWT_SECRET=existing-secret\r\nFIREBASE_PROJECT_ID=my-project\r\n';
  const f = await fixture(t, original);
  assert.equal((await configureFirebase(f)).enabled, false);
  const once = await fs.readFile(f.envFile, 'utf8');
  assert.ok(once.startsWith(original));
  assert.ok(once.includes(`GOOGLE_APPLICATION_CREDENTIALS=${FIREBASE_DEFAULTS.GOOGLE_APPLICATION_CREDENTIALS}`));
  assert.ok((await fs.stat(path.dirname(f.credential))).isDirectory());
  await assert.rejects(fs.access(f.credential), { code: 'ENOENT' });
  await configureFirebase(f);
  assert.equal(await fs.readFile(f.envFile, 'utf8'), once);
});

test('an empty optional push declaration from old template sync remains disabled', async t => {
  const f = await fixture(t, 'RUNLY_FCM_ENABLED=\n');
  assert.equal((await configureFirebase(f)).enabled, false);
  assert.ok((await fs.readFile(f.envFile, 'utf8')).startsWith('RUNLY_FCM_ENABLED=\n'));
});

test('enabled configuration fails before deployment without a valid matching service account', async t => {
  const f = await fixture(t, 'ATLAS_FCM_ENABLED=true\nFIREBASE_PROJECT_ID=my-project\n');
  await assert.rejects(configureFirebase(f), /valid private service-account/);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const credential = { type: 'service_account', project_id: 'other-project', client_email: 'test@example.com', private_key: privateKey };
  await fs.writeFile(f.credential, JSON.stringify(credential));
  await assert.rejects(configureFirebase(f), /must match/);
  credential.project_id = 'my-project';
  await fs.writeFile(f.credential, JSON.stringify(credential));
  assert.equal((await configureFirebase(f)).enabled, true);
});

test('host filesystem paths are not accepted as mounted container credential paths', async t => {
  const f = await fixture(t, 'ATLAS_FCM_ENABLED=true\nGOOGLE_APPLICATION_CREDENTIALS=D:/local/service-account.json\n');
  await assert.rejects(configureFirebase(f), /container path/);
  assert.ok((await fs.readFile(f.envFile, 'utf8')).includes('D:/local/service-account.json'));
});

test('local env regeneration retains Firebase values and excludes unrelated settings', () => {
  const source = 'JWT_SECRET=private\nATLAS_FCM_ENABLED=true\nFIREBASE_PROJECT_ID="my-project"\nGOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase/service-account.json\n';
  assert.equal(preserveFirebaseEnv(source), source.split('\n').slice(1, -1).join('\n'));
});
