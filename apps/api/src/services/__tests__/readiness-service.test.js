import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadinessService, createPoolReadinessProbe, isModuleRuntimeReady } from '../readiness-service.js';

const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const service = options => createReadinessService({ probeDatabase: async () => true, isRuntimeReady: () => true, ...options });

test('runtime bootstrap and route states fail closed without treating missing API as an error', () => {
  assert.equal(isModuleRuntimeReady(false, {}), false);
  assert.equal(isModuleRuntimeReady(true, {}), true);
  assert.equal(isModuleRuntimeReady(true, { a: { status: 'LOADED' }, b: { status: 'MISSING_API' }, c: { status: 'UNLOADED' } }), true);
  for (const state of [null, [], { a: { status: 'ERROR', error: 'fixture details' } }, { a: { status: 'unknown' } }, { a: null }]) {
    assert.equal(isModuleRuntimeReady(true, state), false);
  }
});

test('runtime not ready or throwing does not touch the DB', async () => {
  let calls = 0;
  for (const isRuntimeReady of [() => false, () => { throw new Error('fixture details'); }, () => Promise.resolve(true)]) {
    const result = await service({ isRuntimeReady, probeDatabase: () => { calls++; } }).check();
    assert.deepEqual(result, { ok: false, checks: { database: 'not_checked', runtime: 'unavailable' } });
  }
  assert.equal(calls, 0);
});

test('100 concurrent requests coalesce and runtime is rechecked after the DB finishes', async () => {
  const db = gate();
  let calls = 0, ready = true;
  const monitor = service({ isRuntimeReady: () => ready, probeDatabase: () => { calls++; return db.promise; } });
  const requests = Array.from({ length: 100 }, () => monitor.check());
  await tick();
  assert.equal(calls, 1);
  ready = false;
  db.resolve(true);
  const results = await Promise.all(requests);
  assert.ok(results.every(result => !result.ok && result.checks.runtime === 'unavailable'));
});

test('success cache expires and never masks a runtime failure', async () => {
  let calls = 0, clock = 0, ready = true;
  const monitor = service({ now: () => clock, isRuntimeReady: () => ready, probeDatabase: async () => { calls++; return true; } });
  assert.equal((await monitor.check()).ok, true);
  await tick();
  clock = 999;
  assert.equal((await monitor.check()).ok, true);
  assert.equal(calls, 1);
  ready = false;
  assert.equal((await monitor.check()).ok, false);
  ready = true;
  clock = 1000;
  assert.equal((await monitor.check()).ok, true);
  assert.equal(calls, 2);
});

test('DB rejection, synchronous throw and non-true result are sanitized', async () => {
  for (const probeDatabase of [async () => { throw new Error('fixture internal details'); }, () => { throw new Error('fixture internal details'); }, async () => false, async () => undefined]) {
    const result = await service({ probeDatabase }).check();
    assert.deepEqual(result, { ok: false, checks: { database: 'unavailable', runtime: 'ready' } });
  }
});

test('failure cache throttles calls, then recovers only after a fresh probe', async () => {
  let calls = 0, clock = 0;
  const monitor = service({ now: () => clock, probeDatabase: async () => ++calls > 1 });
  assert.equal((await monitor.check()).ok, false);
  await tick();
  clock = 249;
  assert.equal((await monitor.check()).ok, false);
  assert.equal(calls, 1);
  clock = 250;
  assert.equal((await monitor.check()).ok, true);
  assert.equal(calls, 2);
});

test('deadline aborts and retains a hung probe; late success does not turn it green', async () => {
  const db = gate();
  let calls = 0, signal;
  const monitor = service({ timeoutMs: 15, successCacheMs: 0, failureCacheMs: 0,
    probeDatabase: context => { calls++; signal = context.signal; return calls === 1 ? db.promise : true; } });
  const result = await monitor.check();
  assert.deepEqual(result, { ok: false, checks: { database: 'timeout', runtime: 'ready' } });
  assert.equal(signal.aborted, true);
  assert.ok((await Promise.all(Array.from({ length: 100 }, () => monitor.check()))).every(result => result.checks.database === 'timeout'));
  assert.equal(calls, 1);
  db.resolve(true);
  await tick();
  assert.equal((await monitor.check()).ok, true);
  assert.equal(calls, 2);
});

test('late rejection after deadline is handled and allows another probe', async () => {
  const db = gate();
  let calls = 0;
  const monitor = service({ timeoutMs: 15, failureCacheMs: 0, probeDatabase: () => ++calls === 1 ? db.promise : true });
  assert.equal((await monitor.check()).checks.database, 'timeout');
  db.reject(new Error('fixture late failure'));
  await tick();
  assert.equal((await monitor.check()).ok, true);
});

test('internal timing options reject unsafe/invalid values', () => {
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: -1 }, { timeoutMs: NaN }, { timeoutMs: 1.5 }, { successCacheMs: -1 }, { failureCacheMs: Infinity }]) {
    assert.throws(() => service(options), TypeError);
  }
});

test('pool probe queries SELECT 1 and releases once on success', async () => {
  const queries = [], releases = [];
  const probe = createPoolReadinessProbe({ connect: async () => ({ query: async sql => { queries.push(sql); return { rows: [{ ready: 1 }] }; }, release: value => releases.push(value) }) });
  assert.equal(await probe({ signal: new AbortController().signal }), true);
  assert.deepEqual(queries, ['SELECT 1 AS ready']);
  assert.deepEqual(releases, [false]);
});

test('pool probe destroys client on query error or unexpected response', async () => {
  for (const query of [async () => { throw new Error('fixture failure'); }, async () => ({ rows: [] })]) {
    const releases = [];
    await assert.rejects(createPoolReadinessProbe({ connect: async () => ({ query, release: value => releases.push(value) }) })({ signal: new AbortController().signal }));
    assert.deepEqual(releases, [true]);
  }
});

test('abort during acquisition releases late client without issuing a query', async () => {
  const acquired = gate(), controller = new AbortController(), releases = [];
  let queries = 0;
  const pending = createPoolReadinessProbe({ connect: () => acquired.promise })({ signal: controller.signal });
  controller.abort();
  acquired.resolve({ query: () => { queries++; }, release: value => releases.push(value) });
  await assert.rejects(pending);
  assert.equal(queries, 0);
  assert.deepEqual(releases, [true]);
});

test('abort during a query destroys the acquired client exactly once', async () => {
  const query = gate(), controller = new AbortController(), releases = [];
  const pending = createPoolReadinessProbe({ connect: async () => ({ query: () => query.promise, release: value => releases.push(value) }) })({ signal: controller.signal });
  await tick();
  controller.abort();
  assert.deepEqual(releases, [true]);
  query.resolve({ rows: [{ ready: 1 }] });
  await assert.rejects(pending);
  assert.deepEqual(releases, [true]);
});

test('already aborted probe never acquires a client', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(createPoolReadinessProbe({ connect: () => { calls++; } })({ signal: controller.signal }));
  assert.equal(calls, 0);
});
