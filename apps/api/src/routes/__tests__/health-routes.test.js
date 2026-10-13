import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { createHealthRoutes } from '../health-routes.js';
import { createReadinessService } from '../../services/readiness-service.js';

const router = readiness => createHealthRoutes({ readiness, now: () => new Date('2026-10-13T12:00:00Z'),
  formatLogTimestamp: () => 'fixture-local', getConfiguredTimeZone: () => 'UTC' });

test('health preserves its payload and remains live without consulting readiness', async () => {
  const app = router({ check() { throw new Error('Readiness must not run'); } });
  const response = await app.request('/health');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true, name: 'Runly API', time: '2026-10-13T12:00:00.000Z', localTime: 'fixture-local', timeZone: 'UTC' });
});

test('readiness HTTP reports healthy, failed DB, timeout and incomplete runtime without details', async () => {
  for (const [probeDatabase, isRuntimeReady, database, expectedStatus] of [
    [async () => true, () => true, 'ready', 200],
    [async () => { throw new Error('fixture internal details'); }, () => true, 'unavailable', 503],
    [() => new Promise(() => {}), () => true, 'timeout', 503],
    [async () => true, () => false, 'not_checked', 503],
  ]) {
    const app = router(createReadinessService({ probeDatabase, isRuntimeReady, timeoutMs: 15 }));
    const response = await app.request('/ready?timeout=0');
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const json = await response.json();
    assert.deepEqual(Object.keys(json).sort(), ['checks', 'ok']);
    assert.equal(json.checks.database, database);
    assert.ok(!JSON.stringify(json).includes('fixture internal details'));
    assert.equal((await app.request('/health')).status, 200);
  }
});

test('operational routes reserved before module middleware; HEAD is supported', async () => {
  const app = new Hono();
  app.route('/', router(createReadinessService({ probeDatabase: async () => true, isRuntimeReady: () => true })));
  app.use('*', c => c.json({ error: 'module claimed request' }, 401));
  assert.equal((await app.request('/ready')).status, 200);
  assert.equal((await app.request('/health')).status, 200);
  const head = await app.request('/ready', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await app.request('/business-route')).status, 401);
});

test('API wiring uses the existing pool, bootstrap completion and shutdown revocation', async () => {
  const source = await readFile(new URL('../../index.js', import.meta.url), 'utf8');
  assert.ok(source.includes('probeDatabase: createPoolReadinessProbe(pgPool)'));
  assert.ok(source.indexOf("app.route('/', createHealthRoutes") < source.indexOf('await routeLoader.initialize(app)'));
  assert.ok(source.indexOf('moduleRuntimeInitialized = true') > source.indexOf('await bundlerService.restoreModuleBundlesOnBoot()'));
  assert.match(source, /SIGTERM.*moduleRuntimeInitialized = false/);
  assert.match(source, /SIGINT.*moduleRuntimeInitialized = false/);
});
