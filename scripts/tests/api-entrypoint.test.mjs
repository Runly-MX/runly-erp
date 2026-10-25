import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
test('API entrypoint preserves auto mode and makes skip-init fail closed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'runly-entrypoint-test-'));
  try {
    // Stub commands; never starts an API or connects to any database.
    const source = readFileSync(join(root, 'infra/docker/api-entrypoint.sh'), 'utf8').replaceAll('\r\n', '\n');
    const script = join(directory, 'entrypoint.sh');
    writeFileSync(script, `pnpm() { printf 'PNPM:%s\\n' "$*" >> "$RUNLY_TEST_LOG"; }; node() { printf 'NODE:%s\\n' "$*" >> "$RUNLY_TEST_LOG"; };\n${source.replace('exec pnpm', 'pnpm')}`);
    const log = join(directory, 'commands.log');
    const execute = value => {
      writeFileSync(log, '');
      const env = { ...process.env, RUNLY_TEST_LOG: log.replaceAll('\\', '/'), RUNLY_SKIP_DB_INIT: value };
      execFileSync(bash, [script.replaceAll('\\', '/')], { env, encoding: 'utf8', windowsHide: true });
      return readFileSync(log, 'utf8').trim().split('\n');
    };
    assert.deepEqual(execute('0'), ['PNPM:exec prisma migrate deploy', 'NODE:prisma/seed.js', 'PNPM:--filter @runly/api start']);
    assert.deepEqual(execute('1'), ['PNPM:--filter @runly/api start']);
    assert.throws(() => execute('true'));
    assert.equal(readFileSync(log, 'utf8'), '');
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the opt-in Compose override disables API bootstrap in both installation profiles', t => {
  const available = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', windowsHide: true });
  if (available.error || available.status !== 0) return t.skip('Docker Compose unavailable');
  const raw = execFileSync('docker', ['compose', '-f', 'infra/installer/docker-compose.yml', '-f', 'infra/installer/docker-compose.no-db-init.yml',
    '--profile', 'external', '--profile', 'local', 'config', '--no-env-resolution', '--no-interpolate', '--format', 'json'],
  { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const config = JSON.parse(raw);
  for (const mode of ['external', 'local']) {
    const environment = config.services[`runly-api-${mode}`].environment;
    const value = Array.isArray(environment) ? environment.find(item => item.startsWith('RUNLY_SKIP_DB_INIT='))?.split('=')[1] : environment.RUNLY_SKIP_DB_INIT;
    assert.equal(value, '1');
  }
});
