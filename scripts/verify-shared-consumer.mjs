import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readConsumerArtifacts, startConsumerRegistry, assertIndependentConsumerLock } from './lib/shared-consumer-registry.mjs';
import { digest } from './lib/shared-package-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runFile = promisify(execFile);
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--manifest' || args[1].startsWith('--')) throw new Error('USE_VERIFY_SHARED_CONSUMER_WITH_MANIFEST');
if (!/\.(?:c?js)$/.test(process.env.npm_execpath ?? '')) throw new Error('RUN_THROUGH_PNPM');
const pnpmEntry = process.env.npm_execpath;
const { manifest, artifacts } = readConsumerArtifacts(resolve(args[1]));
const desktopRequire = createRequire(join(root, 'apps/desktop/package.json'));
const compilerRequire = createRequire(join(root, 'packages/module-compiler/package.json'));
const pins = Object.fromEntries(['react', 'react-dom', '@tanstack/react-query'].map(name => [name, desktopRequire(`${name}/package.json`).version]));
const buildVersion = compilerRequire('esbuild/package.json').version;
const scratch = await mkdtemp(join(tmpdir(), 'runly-shared-consumer-'));
assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
const reportDirectory = join(root, '.artifacts/shared-consumer', manifest.revision);
await mkdir(reportDirectory, { recursive: true });
const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT', abort); process.once('SIGTERM', abort);
let registry, phase = 'setup';
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(?:path|systemroot|windir|comspec|temp|tmp|home|userprofile|localappdata|appdata|programfiles(?:\(x86\))?|processor_architecture|number_of_processors)$/i.test(name)));
const userConfig = join(scratch, 'empty-user.npmrc');
await writeFile(userConfig, '\n');
Object.assign(environment, { CI: 'true', npm_config_userconfig: userConfig, NPM_CONFIG_USERCONFIG: userConfig,
  npm_config_ignore_scripts: 'true', NODE_OPTIONS: '' });

async function child(argv, cwd, logName, timeout = 180_000) {
  try {
    const result = await runFile(process.execPath, argv, { cwd, env: environment,
      windowsHide: true, signal: controller.signal, timeout, maxBuffer: 32 * 1024 * 1024 });
    await writeFile(join(reportDirectory, logName), result.stdout + result.stderr);
    return result;
  } catch (error) {
    await writeFile(join(reportDirectory, logName), String(error.stdout ?? '') + String(error.stderr ?? ''));
    throw new Error(`SHARED_CONSUMER_${phase.toUpperCase()}_FAILED`);
  }
}

async function prepare(directory, packageJson, npmrc) {
  await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify(packageJson, null, 2));
  await writeFile(join(directory, '.npmrc'), npmrc);
  await writeFile(join(directory, 'expected-artifacts.json'), JSON.stringify(artifacts.map(({ package: logical, registryPackage, version, files }) => ({ logical, registryPackage, version, files }))));
  for (const name of ['node-contract.mjs', 'browser-contract.jsx', 'build.mjs']) {
    await copyFile(join(root, 'scripts/fixtures/shared-consumer', name), join(directory, name));
  }
}

async function browserContract(directory) {
  const { chromium } = await import('playwright');
  const files = new Map();
  for (const entry of await readdir(join(directory, 'dist'), { withFileTypes: true })) {
    if (entry.isFile()) files.set(`/${entry.name}`, await readFile(join(directory, 'dist', entry.name)));
  }
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const bytes = files.get(path === '/' ? '/index.html' : path);
    if (!bytes) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'text/html');
    response.end(bytes);
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [], outside = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { outside.push('unexpected external request'); return route.abort(); }
      return route.continue();
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.contractReady === true);
    await page.getByRole('button', { name: 'Probar componente', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="count"]')?.textContent === '1');
    await page.getByText('Dashboard vacío', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--runly-cyan').trim()));
    await page.evaluate(() => window.disposeContract());
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  registry = await startConsumerRegistry(artifacts);
  for (const artifact of artifacts) {
    const response = await fetch(`${registry.origin}/tarballs/${artifact.file}`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), artifact.sha256);
  }
  const dependencies = Object.fromEntries(artifacts.map(a => [a.package, `npm:${a.registryPackage}@${a.version}`]));
  for (const name of ['core', 'module-engine', 'ui', 'sdk']) dependencies[`@atlas/${name}`] = dependencies[`@runly/${name}`];
  Object.assign(dependencies, pins);
  const packageJson = { name: 'runly-shared-consumer-fixture', version: '1.0.0', private: true, type: 'module',
    dependencies, devDependencies: { esbuild: buildVersion }, pnpm: { overrides: pins } };
  const npmrc = `registry=https://registry.npmjs.org/\n@runly-mx:registry=${registry.origin}\nhoist=false\nshamefully-hoist=false\nauto-install-peers=false\nignore-pnpmfile=true\nignore-scripts=true\n`;
  const first = join(scratch, 'first'), second = join(scratch, 'frozen');
  await prepare(first, packageJson, npmrc);
  phase = 'install'; console.log(`Consumer ${manifest.revision}: isolated registry installation`);
  await child([pnpmEntry, 'install', '--ignore-scripts'], first, 'install.log');
  const lock = await readFile(join(first, 'pnpm-lock.yaml'), 'utf8');
  await writeFile(join(reportDirectory, 'consumer-lock.yaml'), lock);
  assertIndependentConsumerLock(lock);
  const results = [];
  for (const [label, directory] of [['first', first], ['frozen', second]]) {
    if (label === 'frozen') {
      await prepare(second, packageJson, npmrc);
      await writeFile(join(second, 'pnpm-lock.yaml'), lock);
      phase = 'frozen_install'; console.log('Consumer: reinstalling in a second clean directory from frozen lock');
      await child([pnpmEntry, 'install', '--frozen-lockfile', '--ignore-scripts'], second, 'frozen-install.log');
    }
    phase = `${label}_node`; await child(['node-contract.mjs'], directory, `${label}-node.log`, 60_000);
    phase = `${label}_build`; await child(['build.mjs'], directory, `${label}-build.log`, 90_000);
    phase = `${label}_browser`; await browserContract(directory);
    results.push({ installation: label, node: true, browser: true, ...JSON.parse(await readFile(join(directory, 'build-result.json'), 'utf8')) });
  }
  for (const artifact of artifacts) assert.ok(registry.requests.some(r => r.package === artifact.registryPackage && r.kind === 'tarball'), 'Every artifact must be retrieved through the fixture registry');
  const receipt = { schemaVersion: 1, sourceRevision: manifest.revision, mode: 'local-registry-from-verified-pack',
    runtimePins: pins, publicDependenciesLocked: true, registryAcceptance: 'not-tested',
    artifacts: artifacts.map(({ package: logical, registryPackage, version, integrity }) => ({ logical, registryPackage, version, integrity })), results };
  await writeFile(join(reportDirectory, 'result.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ sourceRevision: receipt.sourceRevision, runtimePins: pins,
    registryAcceptance: receipt.registryAcceptance, results }));
} catch (error) {
  console.error(error.message);
  console.error('Private verification logs retained under .artifacts/shared-consumer/<source-sha>.');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
  await registry?.close();
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  await rm(scratch, { recursive: true, force: true });
}
