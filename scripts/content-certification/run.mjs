#!/usr/bin/env node
// Content Intelligence certification driver. Run it on a dedicated host against an ISOLATED lab.
//   node scripts/content-certification/run.mjs --list
//   node scripts/content-certification/run.mjs --only corpus-smoke,worker-restart --profile 4x8
//   node scripts/content-certification/run.mjs --all --profile 2x4 --out .artifacts/content-intelligence/cert
// Results: <out>/cert-<profile>.json and .md. Skipped scenarios are recorded WITH the reason; nothing is simulated.
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { connect, docker, labEnv, memoryPreflight, run, sleep, startWorker, stopWorker, waitHealthy } from './lab.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1] ?? true; };
const profile = flag('profile', '4x8'), outDir = path.resolve(flag('out', '.artifacts/content-intelligence/cert'));
const [cpus, gb] = profile.split('x').map(Number);
const PROFILES = { '2x4': 4, '4x8': 8, '8x16': 16 };
const env = process.env, image = env.CI_CONTENT_WORKER_IMAGE;
const DB = { user: env.CI_CONTENT_DB_USER ?? 'postgres', name: env.CI_CONTENT_DB_NAME ?? 'postgres' };
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', DB.user, '-d', DB.name, '-At', '-c', sql])).trim();
const check = (name, ok, detail = '') => ({ name, ok: Boolean(ok), detail: String(detail) });
const pass = checks => ({ pass: checks.every(c => c.ok), checks });

// Real post-recovery invariants (never just /health).
async function invariants(lab, ids) {
  const duplicates = await psql(`SELECT count(*) FROM (SELECT file_id FROM runly_content.job WHERE state IN ('pending','processing') GROUP BY file_id HAVING count(*)>1) d`);
  const orphans = await psql(`SELECT count(*) FROM runly_content.page p LEFT JOIN runly_content.job j ON j.id=p.job_id WHERE j.id IS NULL`);
  const stuck = await psql(`SELECT count(*) FROM runly_content.job WHERE state='processing' AND lease_until < now() - interval '2 minutes'`);
  const search = await lab.request('/content/search?q=ABC123XYZ&searchIn=ocr').then(r => (r.data?.length ?? r.data?.items?.length ?? 0)).catch(() => -1);
  return [check('no duplicate active jobs', duplicates === '0', duplicates), check('no orphan derived pages', orphans === '0', orphans),
    check('no expired leases left processing', stuck === '0', stuck), check('content search answers after recovery', search >= 0, `hits=${search}`)];
}

async function chaos(title, interrupt) {
  const lab = await connect(env);
  try {
    await lab.setPolicy({ profile: 'SMART', quality: 'balanced', historical: false, automaticProcessing: true });
    await startWorker(lab, env);
    const before = await lab.upload(8, title);
    await interrupt(lab);
    await waitHealthy(lab);
    const after = await lab.upload(3, `${title}-after`); // real write path after the interruption
    await startWorker(lab, env).catch(() => { });
    const states = await lab.waitTerminal([...before, ...after], 240);
    const unfinished = [...before, ...after].filter(id => !states[id]);
    return pass([check('every file reaches a terminal state', unfinished.length === 0, `unfinished=${unfinished.length}`),
      check('post-interruption upload processed', after.every(id => ['done', 'empty', 'partial'].includes(states[id])), JSON.stringify(after.map(id => states[id]))), ...await invariants(lab, [...before, ...after])]);
  } finally { await stopWorker(lab); await lab.restore(); }
}

const wrap = (script, extra = {}) => () => new Promise(resolve => {
  const child = spawn('node', [script], { env: { ...env, ...extra }, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill('SIGKILL'), 6 * 3600 * 1000);
  child.on('exit', code => { clearTimeout(timer); resolve(pass([check(`${script} exit code`, code === 0, code)])); });
});

const corpus = size => async () => {
  await mkdir(outDir, { recursive: true });
  const prefix = `/out/ocr-${size}-${profile}`;
  await run('docker', ['run', '--rm', '--network', 'none', '--cpus', String(cpus), '--memory', `${gb}g`, '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/app,readonly`,
    '--mount', `type=bind,source=${outDir},target=/out`, '--workdir', '/app', '--entrypoint', 'sh', image, '-c', `PYTHONDONTWRITEBYTECODE=1 python3 corpus.py /tmp/corpus --size ${size} && PYTHONDONTWRITEBYTECODE=1 python3 evaluate.py /tmp/corpus ${prefix}`], { maxBuffer: 32_000_000, timeout: 6 * 3600 * 1000 });
  return pass([check('corpus evaluated', true, `${outDir}/ocr-${size}-${profile}.md`)]);
};

const SCENARIOS = {
  'corpus-smoke': { needs: 'image', run: corpus('smoke'), about: 'Smoke corpus: CER/WER/identifiers/search per quality mode' },
  'corpus-standard': { needs: 'image', run: corpus('standard'), about: 'Standard corpus (~100 files)' },
  'corpus-extended': { needs: 'image', run: corpus('extended'), about: 'Extended corpus (~500 files); dedicated host' },
  'erp-ab': { needs: 'lab', run: wrap('scripts/content-intelligence-erp-ab.mjs', { AB_BUDGET: profile }), about: 'ERP A/B: absent/idle/new/historical/accurate/pressure vs routes, p50/p95/p99 + bootstrap CI' },
  'historical': { needs: 'lab', run: wrap('scripts/content-intelligence-historical-bench.mjs'), about: 'Mixed-document historical backfill' },
  'e2e-browser': { needs: 'lab', run: wrap('scripts/content-intelligence-e2e.mjs'), about: 'Browser E2E: viewer, overlays, widths, themes' },
  'worker-restart': { needs: 'lab', about: 'docker restart of the worker while jobs run', run: () => chaos('wrestart', async lab => { await docker(['restart', lab.names.worker]); }) },
  'postgres-restart': { needs: 'lab', about: 'Restart PostgreSQL during processing; judged by authenticated queries, uploads, claims, search', run: () => chaos('pgrestart', async () => { await docker(['restart', env.CI_CONTENT_DB_CONTAINER]); await sleep(5000); }) },
  'storage-interrupt': { needs: 'lab', about: 'Stop Storage for 45 s during processing, then recover', run: () => chaos('storage', async lab => { await docker(['stop', lab.names.storage]); await sleep(45000); await docker(['start', lab.names.storage]); await sleep(10000); }) },
  'backfill-pause-resume': {
    needs: 'lab', about: 'Backfill progresses, pauses (no progress), resumes, completes, without duplicates',
    run: async () => {
      const lab = await connect(env);
      try {
        await lab.setPolicy({ profile: 'OFF' }); const ids = await lab.upload(10, 'bf');
        await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: false, historical: true }); await startWorker(lab, env);
        await lab.request('/content/admin/backfill', lab.json({ action: 'start', filters: { mode: 'never', fromDate: new Date(Date.now() - 3600_000).toISOString() } }));
        await sleep(8000); await lab.request('/content/admin/backfill', lab.json({ action: 'pause' }));
        await sleep(15000); const a = await psql(`SELECT count(*) FROM runly_content.job WHERE state IN ('done','empty','partial')`);
        await sleep(20000); const b = await psql(`SELECT count(*) FROM runly_content.job WHERE state IN ('done','empty','partial')`);
        await lab.request('/content/admin/backfill', lab.json({ action: 'resume' }));
        const states = await lab.waitTerminal(ids, 240);
        return pass([check('no new completions while paused (after in-flight drain)', a === b, `${a}->${b}`), check('all files terminal after resume', Object.keys(states).length === ids.length, Object.keys(states).length), ...await invariants(lab, ids)]);
      } finally { await stopWorker(lab); await lab.restore(); }
    },
  },
  'soak': {
    needs: 'lab', about: 'SOAK_MINUTES (default 60) of upload+process; samples memory, queue depth, temp files; asserts bounded growth',
    run: async () => {
      const lab = await connect(env), minutes = Number(env.SOAK_MINUTES ?? 60), samples = [];
      try {
        await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true }); await startWorker(lab, env);
        for (const end = Date.now() + minutes * 60_000; Date.now() < end;) {
          await lab.refresh(); await lab.upload(3, 'soak');
          const mem = (await docker(['stats', '--no-stream', '--format', '{{.MemUsage}}', lab.names.worker])).split('/')[0].trim();
          samples.push({ t: Date.now(), mem, pending: Number(await psql(`SELECT count(*) FROM runly_content.job WHERE state IN ('pending','processing')`)), tmp: Number((await docker(['exec', lab.names.worker, 'sh', '-c', 'ls /tmp | wc -l'])).trim()) });
          await sleep(30000);
        }
        const pendings = samples.map(s => s.pending), tmps = samples.map(s => s.tmp);
        return pass([check('queue stays bounded (<= maxPending*2)', Math.max(...pendings) <= 40, `max=${Math.max(...pendings)}`), check('temp entries do not accumulate', Math.max(...tmps) <= 10, `max=${Math.max(...tmps)}`), ...await invariants(lab, [])]);
      } finally { await stopWorker(lab); await lab.restore(); await writeFile(path.join(outDir, 'soak-samples.json'), JSON.stringify(samples)).catch(() => { }); }
    },
  },
  'install-upgrade-rollback': { needs: 'manual', about: 'Fresh install / upgrade from previous release / rollback: needs two released image versions; procedure in docs/CONTENT_INTELLIGENCE_CERTIFICATION_RUNBOOK.md' },
};

if (flag('list', false)) { for (const [k, v] of Object.entries(SCENARIOS)) console.log(`${k.padEnd(26)} [${v.needs}] ${v.about}`); process.exit(0); }
const selected = flag('all', false) ? Object.keys(SCENARIOS) : String(flag('only', '')).split(',').filter(Boolean);
if (!selected.length) { console.error('Nothing selected: use --list, --only a,b or --all'); process.exit(2); }
if (!(profile in PROFILES)) { console.error(`Unknown profile ${profile}; use ${Object.keys(PROFILES)}`); process.exit(2); }

const pre = await memoryPreflight(PROFILES[profile]);
const lab = labEnv(env);
const results = [];
for (const id of selected) {
  const s = SCENARIOS[id];
  const base = { id, profile, about: s?.about };
  const skip = reason => { results.push({ ...base, status: 'skipped', reason }); console.log(`SKIP ${id}: ${reason}`); };
  if (!s) { skip('unknown scenario'); continue; }
  if (s.needs === 'manual') { skip('manual procedure'); continue; }
  if (!pre.ok) { skip(`resource preflight: ${pre.reason}`); continue; }
  if (s.needs === 'image' && !image) { skip('CI_CONTENT_WORKER_IMAGE not set'); continue; }
  if (s.needs === 'lab' && !lab.ok) { skip(lab.reason); continue; }
  if (flag('dry-run', false)) { skip('dry run'); continue; }
  const started = Date.now();
  try { const r = await s.run(); results.push({ ...base, status: r.pass ? 'passed' : 'failed', seconds: (Date.now() - started) / 1000, checks: r.checks }); console.log(`${r.pass ? 'PASS' : 'FAIL'} ${id}`); }
  catch (error) { results.push({ ...base, status: 'error', seconds: (Date.now() - started) / 1000, error: String(error.message).slice(0, 400) }); console.log(`ERROR ${id}: ${error.message}`); }
}
await mkdir(outDir, { recursive: true });
const report = { profile, at: new Date().toISOString(), host: { ...pre }, workerImage: image ?? null, results };
await writeFile(path.join(outDir, `cert-${profile}.json`), JSON.stringify(report, null, 1));
const md = [`# Certificacion Content Intelligence (${profile})`, `Host: Docker ${pre.dockerGb} GB, libre ${pre.hostFreeGb} GB`, '', '| Escenario | Estado | Detalle |', '|---|---|---|',
  ...results.map(r => `| ${r.id} | ${r.status} | ${r.reason ?? r.error ?? (r.checks ?? []).filter(c => !c.ok).map(c => c.name).join('; ') ?? ''} |`)].join('\n');
await writeFile(path.join(outDir, `cert-${profile}.md`), md + '\n');
console.log(md);
process.exit(results.some(r => ['failed', 'error'].includes(r.status)) ? 1 : 0);
