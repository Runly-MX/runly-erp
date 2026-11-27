#!/usr/bin/env node
// Vertical flow: pre-existing files -> admin enables processing + history once -> automatic, bounded, resumable
// indexing -> search through the real Files/Content API. ISOLATED LAB ONLY (see lab.mjs guards). API only: no browser.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connect, docker, labEnv, run, sleep, startWorker, stopWorker } from './lab.mjs';

const env = process.env, lab0 = labEnv(env);
if (!lab0.ok) { console.error(`Refusing to run: ${lab0.reason}`); process.exit(2); }
const lab = await connect(env);
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', env.CI_CONTENT_DB_USER ?? 'postgres', '-d', env.CI_CONTENT_DB_NAME ?? 'postgres', '-At', '-c', sql])).trim();
const checks = [], check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const MAX_PENDING = 4, TOTAL = 10, marker = `QZ${Date.now().toString(36).toUpperCase()}`;

// Unique, text-only-inside-the-image fixtures rendered by the worker image (corpus.py).
const rendered = JSON.parse((await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/app,readonly`, '--workdir', '/app', '--entrypoint', 'python3', env.CI_CONTENT_WORKER_IMAGE, '-c',
  `import corpus,io,json,base64,random\nr=random.Random(1)\nout=[]\nfor i in range(${TOTAL + 2}):\n    b=io.BytesIO();corpus.render('ETIQUETA\\nSerial ${marker}%02d\\nModelo AP-%d'%(i,i),42,r).save(b,'PNG');out.append(base64.b64encode(b.getvalue()).decode())\nprint(json.dumps(out))`], { maxBuffer: 32_000_000 })).stdout);
const send = async (i, tag) => {
  const form = new FormData();
  form.set('file', new Blob([Buffer.from(rendered[i], 'base64')], { type: 'image/png' }), `IMG_${tag}_${i}.png`); // name carries no recognizable text
  form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
  return (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
};
const company = async () => (await lab.request('/content/admin/company')).data;
const queue = () => psql(`SELECT count(*) FROM runly_content.job WHERE state IN ('pending','processing') AND priority>=40`).then(Number);
const search = async term => (await lab.request(`/content/search?q=${encodeURIComponent(term)}&searchIn=ocr`)).data;
const ids = [];
let otherCompany = null, maxQueue = 0;
try {
  // 1. Files exist BEFORE OCR is enabled.
  await lab.setPolicy({ profile: 'OFF' }); await stopWorker(lab);
  const t0 = new Date(Date.now() - 60_000).toISOString();
  for (let i = 0; i < TOTAL; i++) ids.push(await send(i, 'pre'));
  check('files uploaded while OCR is OFF create no jobs', Number(await psql(`SELECT count(*) FROM runly_content.job WHERE file_id IN ('${ids.join("','")}')`)) === 0);

  // 2-3. Admin enables processing + history ONCE (API calls identical to the admin screen).
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: true, maxPending: MAX_PENDING, concurrency: 1 });
  await startWorker(lab, env);
  await lab.request('/content/admin/backfill', lab.json({ action: 'start', filters: { mode: 'never', fromDate: t0 } }));

  // 4-8. Jobs appear without further action; the queue never exceeds the limit; no UI session involved.
  let restarted = false, sentNew = null, paused = false, pausedAt = null, resumed = false;
  for (let tick = 0; tick < 300; tick++) {
    const q = await queue(); maxQueue = Math.max(maxQueue, q);
    const s = await company(), scan = s.backfill.find(b => b.kind === 'historical');
    if (!sentNew && scan && scan.enqueued >= 3) { sentNew = await send(TOTAL, 'new'); ids.push(sentNew); } // 11: upload during history
    if (env.VERTICAL_RESTART === '1' && sentNew && !restarted) { // history must survive API and worker restarts
      restarted = true; const before = scan.discovered;
      await docker(['restart', env.CI_CONTENT_API_CONTAINER]); await docker(['restart', lab.names.worker]);
      for (let i = 0; i < 60; i++) { try { await lab.refresh(); await lab.request('/files?limit=1'); break; } catch { await sleep(3000); } }
      const back = (await company()).backfill.find(b => b.kind === 'historical');
      check('history cursor survives API+worker restart', back.discovered >= before && back.state === 'running', `discovered ${before}->${back.discovered} state=${back.state}`);
    }
    if (sentNew && !paused && scan?.enqueued >= 6) { await lab.request('/content/admin/backfill', lab.json({ action: 'pause' })); paused = true; pausedAt = (await company()).backfill.find(b => b.kind === 'historical').discovered; await sleep(20000); }
    if (paused && !resumed) {
      const now = (await company()).backfill.find(b => b.kind === 'historical');
      check('13. history discovery stops while paused', now.state === 'paused' && now.discovered === pausedAt, `state=${now.state} discovered ${pausedAt}->${now.discovered}`);
      await lab.request('/content/admin/backfill', lab.json({ action: 'resume' })); resumed = true; // 14
    }
    if (scan?.state === 'done') break;
    await sleep(1000);
  }
  const final = await company(), scan = final.backfill.find(b => b.kind === 'historical');
  check('4. jobs were generated automatically', scan.enqueued >= TOTAL, `enqueued=${scan.enqueued}`);
  check('6. queue limit respected', maxQueue <= MAX_PENDING, `max pending+processing=${maxQueue} limit=${MAX_PENDING}`);
  check('15. history reached completion', scan.state === 'done', `state=${scan.state} discovered=${scan.discovered}`);
  check('status exposes bounded history summary', final.history && final.history.discovered === scan.discovered, JSON.stringify(final.history));

  // 9-12. Results stored and searchable through the real API; new image processed per policy.
  const states = await lab.waitTerminal(ids, 120);
  check('9. every file reached a terminal state', ids.every(id => states[id]), JSON.stringify(Object.values(states)));
  check('9/12. all pre-existing and the new image are indexed (done)', ids.every(id => states[id] === 'done'), JSON.stringify(Object.values(states).filter(s => s !== 'done')));
  const hits = await search(`${marker}03`);
  const hitIds = (hits.items ?? hits).map(h => h.fileId ?? h.id);
  check('10. photo found by text that exists only inside it', hitIds.includes(ids[3]), `hits=${hitIds.length}`);
  const newHit = (await search(`${marker}${String(TOTAL).padStart(2, '0')}`)); const newIds = (newHit.items ?? newHit).map(h => h.fileId ?? h.id);
  check('12. image uploaded mid-history is searchable', newIds.includes(sentNew), `hits=${newIds.length}`);

  // 16. Another company: same marker text must not be visible to this company's search.
  const other = await psql(`WITH c AS (INSERT INTO company(name,slug,updated_at) VALUES ('cert-other','cert-other-${Date.now()}',now()) RETURNING id),
    f AS (INSERT INTO file_asset(bucket,object_key,original_name,mime_type,size_bytes,entity_id,updated_at) SELECT 'x','cert/'||gen_random_uuid(),'other.png','image/png',1,c.id,now() FROM c RETURNING id,entity_id,object_key),
    j AS (INSERT INTO runly_content.job(company_id,file_id,revision,object_key,state) SELECT entity_id,id,1,object_key,'done' FROM f RETURNING id)
    INSERT INTO runly_content.page(job_id,unit,source,reference,text,normalized) SELECT j.id,1,'ocr','p1','Serial ${marker}03 OTRA EMPRESA','serial ${marker.toLowerCase()}03 otra empresa' FROM j RETURNING (SELECT entity_id FROM f)`).catch(e => `ERR ${e.message.slice(0, 160)}`);
  otherCompany = /^[0-9a-f-]{36}/.test(other) ? other.split('\n')[0] : null;
  const again = await search(`${marker}03`), againIds = (again.items ?? again).map(h => h.fileId ?? h.id);
  check('16. other company data present in DB (control)', Boolean(otherCompany), otherCompany ? '' : other);
  check('16. other company file never appears in this company search', againIds.length === hitIds.length && againIds.every(id => ids.includes(id)), `${hitIds.length}->${againIds.length}`);
} finally {
  if (otherCompany) await psql(`DELETE FROM company WHERE id='${otherCompany}'`).catch(() => { });
  await stopWorker(lab); await lab.restore();
}
const out = path.resolve('docs/audits/content-intelligence-stage4'); await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'vertical-historical.json'), JSON.stringify({ at: new Date().toISOString(), marker, maxQueue, checks }, null, 1));
process.exit(checks.every(c => c.ok) ? 0 : 1);
