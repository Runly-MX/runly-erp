import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('all package workspace manifests are present before frozen installation in each Node image', () => {
  const manifests = readdirSync(join(root, 'packages'), { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => `packages/${entry.name}/package.json`);
  for (const image of ['api', 'web', 'worker']) {
    const source = readFileSync(join(root, `infra/docker/${image}.Dockerfile`), 'utf8');
    const beforeInstall = source.split('RUN pnpm install --frozen-lockfile')[0];
    for (const manifest of manifests) assert.ok(beforeInstall.includes(`COPY ${manifest} ${manifest}`), `${image} is missing ${manifest} during workspace installation`);
  }
});

test('shared application contracts are copied into the web build and API/worker runtime stages', () => {
  for (const image of ['web', 'api', 'worker']) {
    const source = readFileSync(join(root, `infra/docker/${image}.Dockerfile`), 'utf8');
    const stages = source.split(/^FROM /m).slice(1);
    const consumer = image === 'web' ? stages.find(stage => /RUN pnpm --filter @runly\/desktop build:web/.test(stage)) : stages.at(-1);
    assert.match(consumer, /^COPY apps\/shared apps\/shared\s*$/m, `${image} must contain the shared imports it consumes`);
    if (image === 'web') assert.ok(consumer.indexOf('COPY apps/shared apps/shared') < consumer.indexOf('RUN pnpm --filter @runly/desktop build:web'));
  }
});

test('a shared-contract-only change selects API, worker and web without publishing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'runly-docker-shared-test-'));
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true }).trim();
  try {
    mkdirSync(join(directory, 'infra/docker'), { recursive: true });
    mkdirSync(join(directory, 'apps/shared/studio'), { recursive: true });
    writeFileSync(join(directory, 'infra/docker/build-push.mjs'), readFileSync(join(root, 'infra/docker/build-push.mjs')));
    writeFileSync(join(directory, 'apps/shared/studio/document.js'), 'export const version = 1;\n');
    writeFileSync(join(directory, '.gitignore'), 'infra/docker/.release-state.json\n');
    git(['init', '-b', 'main']);
    git(['add', '.']);
    git(['-c', 'user.name=Runly Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture baseline']);
    const sha = git(['rev-parse', 'HEAD']);
    const keys = ['api', 'worker', 'web', 'transcriber', 'tts', 'backup'];
    writeFileSync(join(directory, 'infra/docker/.release-state.json'), JSON.stringify(Object.fromEntries(keys.map(key => [key, { sha }]))));
    writeFileSync(join(directory, 'apps/shared/studio/document.js'), 'export const version = 2;\n');
    const output = execFileSync(process.execPath, ['infra/docker/build-push.mjs', '--dry-run'], { cwd: directory, encoding: 'utf8', windowsHide: true });
    assert.match(output, /\[dry-run\] Se publicarian: API, Worker, Web/);
    for (const label of ['Transcriber', 'TTS', 'Backup']) assert.match(output, new RegExp(`skip\\s+${label}\\s+sin cambios`));
    assert.ok(!output.includes('$ docker'));
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('runly-docker-shared-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
