import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendMissingEnvText, preserveEnvAssignments, syncMissingEnvFile, envAssignments, mergeRunlyEnvText } from './env-compat.mjs';
import { syncDevelopmentEnv } from '../../../scripts/start-office-dev.mjs';

const keys = ['RUNLY_MCP_ENABLED', 'RUNLY_MCP_PUBLIC_URL', 'RUNLY_MCP_WEB_URL', 'RUNLY_MCP_ALLOWED_ORIGINS'];
const template = keys.map(key => `${key}=`).join('\n') + '\n';

test('adds absent variables once without changing existing bytes or explicit empty values', () => {
  const stored = '# Ajustes\r\nSECRET="fixture # value"\r\nexport RUNLY_MCP_ENABLED = true # keep\r\nRUNLY_MCP_PUBLIC_URL=\r\n';
  const result = appendMissingEnvText(stored, template);
  assert.ok(result.text.startsWith(stored));
  assert.deepEqual(result.addedKeys, keys.slice(2));
  assert.equal(appendMissingEnvText(result.text, template).text, result.text);
  for (const key of keys) assert.equal(envAssignments(result.text).filter(entry => entry.key === key).length, 1);
  assert.match(result.text, /RUNLY_MCP_WEB_URL=\r\n/);
});

test('future template settings are appended blank, never example secrets or domains', () => {
  const result = appendMissingEnvText('CUSTOM=value', `${template}FUTURE_SECRET=example-secret\nFUTURE_HOST=https://service.example\nFUTURE_SECRET=duplicate\n`);
  assert.match(result.text, /FUTURE_SECRET=\nFUTURE_HOST=\n$/);
  assert.doesNotMatch(result.text, /example-secret|service.example|duplicate/);
  assert.equal(appendMissingEnvText(result.text, template).text, result.text);
});

test('allowlisted safe defaults keep the template value only when the key is missing', () => {
  const withDefault = `${template}RUNLY_MCP_TRUSTED_PROXIES=private\n`;
  const added = appendMissingEnvText('CUSTOM=value\n', withDefault);
  assert.match(added.text, /^RUNLY_MCP_TRUSTED_PROXIES=private$/m);
  assert.match(added.text, /^RUNLY_MCP_PUBLIC_URL=$/m);
  const explicit = appendMissingEnvText('RUNLY_MCP_TRUSTED_PROXIES=\n', withDefault);
  assert.match(explicit.text, /^RUNLY_MCP_TRUSTED_PROXIES=$/m);
  assert.doesNotMatch(explicit.text, /private/);
});

test('a UTF-8 BOM does not hide an existing first declaration', () => {
  const stored = '\uFEFFRUNLY_MCP_ENABLED=true\r\n';
  const result = appendMissingEnvText(stored, template);
  assert.ok(result.text.startsWith(stored));
  assert.deepEqual(result.addedKeys, keys.slice(1));
  assert.equal(appendMissingEnvText(result.text, template).text, result.text);
});

test('multiline quoted values and commented keys do not create false declarations', () => {
  const stored = 'SECRET="line one\nRUNLY_MCP_ENABLED=true\nline three"\n# RUNLY_MCP_WEB_URL=comment\n';
  const result = appendMissingEnvText(stored, template);
  assert.ok(result.text.startsWith(stored));
  assert.deepEqual(result.addedKeys, keys);
  assert.equal(appendMissingEnvText(result.text, template).text, result.text);
});

test('local regeneration retains exact MCP values despite process overrides and custom credentials', () => {
  const stored = 'RUNLY_MCP_ENABLED=true\n  export RUNLY_MCP_PUBLIC_URL = "https://erp.example/mcp" # preserve\nRUNLY_MCP_WEB_URL=\'https://web.example\'\nRUNLY_MCP_ALLOWED_ORIGINS=\nCUSTOM_SECRET="fixture with spaces"\n';
  const generated = 'RUNLY_API_PORT=4010\n';
  const rebuild = saved => appendMissingEnvText(preserveEnvAssignments(mergeRunlyEnvText(generated, saved, { RUNLY_MCP_ENABLED: 'false', RUNLY_MCP_WEB_URL: 'https://override.example' }), saved), template).text;
  const first = rebuild(stored);
  for (const entry of envAssignments(stored)) assert.ok(first.includes(entry.raw));
  assert.equal(rebuild(first), first);
  for (const key of keys) assert.equal(envAssignments(first).filter(entry => entry.key === key).length, 1);
});

for (const mode of ['local', 'external', 'embedded']) {
  test(`${mode}: file synchronization is repeatable and preserves values, permissions and unrelated files`, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'runly-env-sync-'));
    t.after(() => {
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(dir).startsWith('runly-env-sync-'));
      return fs.rm(dir, { recursive: true, force: true });
    });
    const file = path.join(dir, mode === 'external' ? '.env.external' : '.env.local');
    const example = path.join(dir, '.env.example');
    const original = 'DATABASE_URL="fixture-private-value"\nRUNLY_MCP_ENABLED=false\nRUNLY_MCP_WEB_URL="https://custom.example"\n';
    await fs.writeFile(file, original, { mode: 0o600 });
    await fs.writeFile(example, template);
    await fs.writeFile(path.join(dir, 'data.fixture'), 'preserve');
    const log = [];
    await syncMissingEnvFile(file, example, { log: message => log.push(message) });
    const first = await fs.readFile(file, 'utf8');
    assert.ok(first.startsWith(original));
    await syncMissingEnvFile(file, example, { log: message => log.push(message) });
    assert.equal(await fs.readFile(file, 'utf8'), first);
    assert.equal(log.length, 1);
    assert.doesNotMatch(log.join(''), /fixture-private-value|custom.example/);
    assert.equal(await fs.readFile(path.join(dir, 'data.fixture'), 'utf8'), 'preserve');
    if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  });
}

test('compose regeneration preserves stored MCP and unknown settings without accumulating declarations', () => {
  const generated = 'SUPABASE_URL=http://localhost:8000\n';
  const stored = 'RUNLY_MCP_ENABLED=\nRUNLY_MCP_WEB_URL="https://custom.example"\nCUSTOM=value\n';
  const first = preserveEnvAssignments(generated, stored);
  assert.equal(preserveEnvAssignments(generated, first), first);
  for (const entry of envAssignments(stored)) assert.ok(first.includes(entry.raw));
});

test('development sync preserves .env.local overrides without blanking inherited credentials', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'runly-env-sync-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('runly-env-sync-'));
    return fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, '.env.example'), `${template}DATABASE_URL=example\n`);
  await fs.writeFile(path.join(dir, '.env'), 'DATABASE_URL=fixture-private\n');
  const overrides = 'RUNLY_MCP_PUBLIC_URL=https://override.example/mcp\n';
  await fs.writeFile(path.join(dir, '.env.local'), overrides);
  await syncDevelopmentEnv(dir);
  const base = await fs.readFile(path.join(dir, '.env'), 'utf8');
  assert.match(base, /^DATABASE_URL=fixture-private$/m);
  for (const key of keys) assert.ok(envAssignments(base).some(entry => entry.key === key));
  assert.equal(await fs.readFile(path.join(dir, '.env.local'), 'utf8'), overrides);
  await syncDevelopmentEnv(dir);
  assert.equal(await fs.readFile(path.join(dir, '.env'), 'utf8'), base);
  await fs.unlink(path.join(dir, '.env'));
  await syncDevelopmentEnv(dir);
  const local = await fs.readFile(path.join(dir, '.env.local'), 'utf8');
  assert.ok(local.startsWith(overrides));
  for (const key of keys) assert.ok(envAssignments(local).some(entry => entry.key === key));
});
