// Interleaved A/B load against the isolated, synthetic ERP lab (never production).
// Scenarios rotate inside every repetition so host drift hits all of them equally;
// samples are pooled per scenario and the p95 ratio vs "absent" gets a bootstrap CI.
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';

const run = promisify(execFile), api = process.env.CI_CONTENT_API_URL;
if (!api || !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw Error('Explicit loopback test API required');
const directory = path.resolve('.artifacts/content-intelligence/stage2-erp');
const parse = text => Object.fromEntries(text.replace(/^﻿/, '').trim().split(/\r?\n/).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const settings = parse(await readFile(process.env.CI_CONTENT_ENV_FILE, 'utf8'));
assert.ok(settings.E2E_USER_EMAIL.endsWith('.example.test'));
const kong = process.env.CI_CONTENT_KONG_URL;
if (!kong || !['localhost', '127.0.0.1'].includes(new URL(kong).hostname)) throw Error('Explicit loopback Kong URL required');
const stateFile = path.join(directory, 'browser-state.json');
const state = JSON.parse(await readFile(stateFile));
const local = state.origins[0].localStorage;
const tokenRow = local.find(r => r.name === 'sb-localhost-auth-token');
const company = local.find(r => r.name === 'runly-active-company').value;
let session = JSON.parse(tokenRow.value);
const refresh = async () => { // refresh tokens rotate: persist the new one for the next run
  const r = await fetch(`${kong}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: settings.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
  assert.ok(r.ok, `token refresh ${r.status}`);
  session = await r.json(); tokenRow.value = JSON.stringify(session);
  await writeFile(stateFile, JSON.stringify(state));
};
await refresh();
const request = async (route, options = {}) => {
  const response = await fetch(`${api}${route}`, { ...options, headers: { Authorization: `Bearer ${session.access_token}`, 'X-Runly-Company-Id': company, ...options.headers }, signal: AbortSignal.timeout(15000) });
  const data = await response.json(); assert.ok(response.ok, `${route} ${response.status}: ${JSON.stringify(data).slice(0, 200)}`); return data;
};
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 30 && !(await fetch(`${api}/health`).then(r => r.ok).catch(() => false)); i++) await sleep(1000);

const scopes = ['instance', 'company'];
const policies = await Promise.all(scopes.map(async s => (await request(`/content/admin/${s}`)).data.config));
const setPolicy = (quality = 'balanced', profile = 'SMART', automaticProcessing = true) => Promise.all(scopes.map((s, i) => request(`/content/admin/${s}`, { ...json({ ...policies[i], profile, quality, concurrency: 1, historical: true, automaticProcessing, maxPending: 20 }), method: 'PUT' })));
const names = { api: process.env.CI_CONTENT_API_CONTAINER, db: process.env.CI_CONTENT_DB_CONTAINER, worker: 'runly-content-erp-ab' };
const support = (process.env.CI_CONTENT_SUPPORT_CONTAINERS ?? '').split(',').filter(Boolean);
if (!names.api || !names.db || support.length !== 6 || !process.env.CI_CONTENT_DOCKER_NETWORK || !process.env.CI_CONTENT_WORKER_IMAGE) throw Error('Explicit isolated API, DB, six support containers, network and worker image required');
for (const n of [names.api, names.db, ...support]) assert.ok(n.startsWith('runly-content-'), 'Only dedicated content test containers');
const docker = async args => (await run('docker', args, { maxBuffer: 8000000, timeout: 120000 })).stdout;
const stop = () => docker(['rm', '-f', names.worker]).catch(() => { });
const generated = await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/tests,readonly`, '--workdir', '/tests', process.env.CI_CONTENT_WORKER_IMAGE, 'python3', 'generate_test_files.py'], { maxBuffer: 6000000 });
const fixtures = JSON.parse(generated.stdout);
async function upload(count) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const [name, mime, bytes] = fixtures[i % fixtures.length], form = new FormData();
    form.set('file', new Blob([Buffer.from(bytes, 'base64')], { type: mime }), `ab-${Date.now()}-${i}-${name}`);
    form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
    ids.push((await request('/files/upload', { method: 'POST', body: form })).data.id);
  }
  return ids;
}
const pct = (v, p) => v.toSorted((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))];
const routes = ['/files?limit=20', '/content/search?q=ABC123XYZ&searchIn=ocr', '/inventory/items?limit=20', '/purchases/dashboard', '/pos/sessions?limit=20', '/user/me'];
const [budgetCpus, budgetGb] = (process.env.AB_BUDGET ?? '4x8').split('x').map(Number);
const reps = Number(process.env.AB_REPS ?? 10), rounds = Number(process.env.AB_ROUNDS ?? 30);
const scenarios = (process.env.AB_SCENARIOS ?? 'absent,idle,new,historical,accurate,pressure').split(',');
const factor = budgetCpus / 2;

async function applyBudget() {
  await docker(['update', '--cpus', String(.5 * factor), '--memory', `${768 * factor}m`, '--memory-swap', `${768 * factor}m`, names.api]);
  await docker(['update', '--cpus', String(.25 * factor), '--memory', `${1280 * factor}m`, '--memory-swap', `${1280 * factor}m`, names.db]);
  for (const n of support) {
    const storage = n.endsWith('supabase-storage'), realtime = n.endsWith('supabase-realtime'), kongC = n.endsWith('supabase-kong'), auth = n.endsWith('supabase-auth');
    const mem = (storage ? 384 : kongC ? 512 : realtime ? 256 : 128) * factor, cpu = storage ? .25 : kongC ? .5 : auth ? .1 : .05;
    await docker(['update', '--cpus', String(cpu * factor), '--memory', `${mem}m`, '--memory-swap', `${mem}m`, n]);
  }
}
const startWorker = async () => {
  const up = (await docker(['ps', '-q', '--filter', `name=^${names.worker}$`])).trim();
  if (up) return;
  await stop();
  await docker(['run', '-d', '--name', names.worker, '--network', process.env.CI_CONTENT_DOCKER_NETWORK, '--env-file', path.join(directory, 'worker.env'),
    '--cpus', String(.25 * factor), '--memory', `${512 * factor}m`, '--pids-limit', '64', '--read-only', '--tmpfs', '/tmp:size=268435456,mode=1777,noexec,nosuid,nodev',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', process.env.CI_CONTENT_WORKER_IMAGE]);
  await sleep(6000); // let it register a heartbeat before the block is judged
};

const pooled = Object.fromEntries(scenarios.map(s => [s, { timings: Object.fromEntries(routes.map(r => [r, []])), perRep: [], errors: [], processed: 0 }]));
async function block(scenario, rep) {
  let files = [], stress;
  if (scenario === 'absent') { await setPolicy('balanced', 'OFF'); await stop(); }
  else {
    await startWorker();
    if (scenario === 'idle') await setPolicy('balanced', 'SMART');
    if (['new', 'accurate', 'pressure'].includes(scenario)) { await setPolicy(scenario === 'accurate' ? 'accurate' : 'balanced'); files = await upload(12); }
    if (scenario === 'historical') {
      const at = Date.now();
      await setPolicy('balanced', 'OFF'); files = await upload(12); await setPolicy('balanced', 'SMART', false);
      await request('/content/admin/backfill', json({ action: 'start', filters: { mode: 'never', fromDate: new Date(at - 1000).toISOString() } }));
    }
    if (files.length && scenario !== 'pressure') {
      let seen = false;
      for (let i = 0; i < 30 && !seen; i++) {
        const st = (await request(`/content/files/${files[0]}`)).data.state;
        if (['processing', 'done', 'empty', 'partial'].includes(st)) seen = true; else await sleep(1000);
      }
      assert.ok(seen, `${scenario} must actually start processing`);
    }
    if (scenario === 'pressure') stress = run('docker', ['exec', names.worker, 'python3', '-c', 'import time; b=bytearray(300*1048576);end=time.monotonic()+20\nwhile time.monotonic()<end: sum(range(100000))'], { maxBuffer: 1000 }).catch(() => { });
  }
  for (let i = 0; i < 4; i++) await Promise.all(routes.map(r => request(r)));
  const own = Object.fromEntries(routes.map(r => [r, []])), errors = [];
  for (let i = 0; i < rounds; i++) {
    await Promise.all(routes.map(async r => { const t = performance.now(); try { await request(r); } catch (e) { errors.push({ route: r, message: e.message }); } own[r].push(performance.now() - t); }));
    await sleep(150);
  }
  const p = pooled[scenario];
  for (const r of routes) p.timings[r].push(...own[r]);
  p.errors.push(...errors); p.perRep.push({ rep, filesP95: pct(own[routes[0]], .95), allP95: pct(Object.values(own).flat(), .95) });
  if (stress) await stress;
  if (files.length) { await setPolicy('balanced', 'OFF'); for (const id of files) await request(`/content/files/${id}/cancel`, json({})).catch(() => { }); }
}

const bootstrap = (a, b, n = 1000) => { // CI of p95(a)/p95(b)
  const draw = v => Array.from({ length: v.length }, () => v[Math.floor(Math.random() * v.length)]);
  const r = Array.from({ length: n }, () => pct(draw(a), .95) / pct(draw(b), .95)).sort((x, y) => x - y);
  return [r[Math.floor(n * .025)], r[Math.floor(n * .975)]];
};
const began = Date.now();
try {
  await applyBudget();
  for (let rep = 0; rep < reps; rep++) {
    await refresh();
    const order = scenarios.map((_, i) => scenarios[(i + rep) % scenarios.length]);
    for (const s of order) { await block(s, rep); console.log(JSON.stringify({ rep, s, filesP95: pooled[s].perRep.at(-1).filesP95.toFixed(1) })); }
  }
} finally {
  await stop();
  await Promise.all(scopes.map((s, i) => request(`/content/admin/${s}`, { ...json(policies[i]), method: 'PUT' }))).catch(() => { });
}
const summary = scenarios.map(s => {
  const all = Object.values(pooled[s].timings).flat(), base = Object.values(pooled.absent?.timings ?? {}).flat();
  const route = Object.fromEntries(routes.map(r => {
    const v = pooled[s].timings[r], b = pooled.absent?.timings[r];
    return [r, { n: v.length, p50: pct(v, .5), p95: pct(v, .95), p99: pct(v, .99), ratioP95: b ? pct(v, .95) / pct(b, .95) : null, ci95: b && s !== 'absent' ? bootstrap(v, b) : null }];
  }));
  return { scenario: s, n: all.length, p50: pct(all, .5), p95: pct(all, .95), p99: pct(all, .99), ratioP95: base.length ? pct(all, .95) / pct(base, .95) : null, ci95: base.length && s !== 'absent' ? bootstrap(all, base) : null, errors: pooled[s].errors.length, perRep: pooled[s].perRep, route };
});
const out = path.join(directory, `erp-ab-${budgetCpus}x${budgetGb}.json`);
await writeFile(out, JSON.stringify({ synthetic: true, budget: { cpus: budgetCpus, gb: budgetGb }, reps, roundsPerBlock: rounds, wallSeconds: (Date.now() - began) / 1000, summary }, null, 1));
for (const s of summary) console.log(`${s.scenario.padEnd(11)} n=${s.n} p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)} p99=${s.p99.toFixed(1)} ratio=${s.ratioP95?.toFixed(3)} ci=${s.ci95?.map(x => x.toFixed(2))} err=${s.errors}`);
