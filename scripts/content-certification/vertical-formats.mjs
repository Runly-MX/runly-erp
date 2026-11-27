#!/usr/bin/env node
// Stage 4C vertical flow (API level, ISOLATED lab): HEIC photo, corrupt HEIC, DOCX/XLSX/PPTX found by content that is
// not in their names, and the Files module still working with OCR off. Needs CI_CONTENT_* env (see runbook).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { connect, docker, labEnv, run, startWorker, stopWorker } from './lab.mjs';

const env = process.env, guard = labEnv(env);
if (!guard.ok) { console.error(guard.reason); process.exit(2); }
const out = path.resolve('docs/audits/content-intelligence-stage4c');
await mkdir(out, { recursive: true });
const checks = [], check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql])).trim();
const lab = await connect(env);
const tag = Math.floor(1000 + Math.random() * 8999), marker = `HEI${tag}C07`, doc = `DOCX${tag}Q`, sheet = `XLSX${tag}Q`, deck = `PPTX${tag}Q`, header = `ENCAB${tag}Q`;
const script = await readFile(path.resolve('scripts/content-certification/fixtures-formats.py'), 'utf8');
const fixtures = JSON.parse((await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/app,readonly`, '--workdir', '/app', '--entrypoint', 'python3',
  '-e', `MARKER=${marker}`, '-e', `DOC=${doc}`, '-e', `SHEET=${sheet}`, '-e', `DECK=${deck}`, '-e', `HEADER=${header}`, env.CI_CONTENT_WORKER_IMAGE, '-c', script], { maxBuffer: 32_000_000 })).stdout);
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', heic: 'image/heic', corrupt: 'image/heic' };
const send = async (kind, name) => {
  const form = new FormData();
  form.set('file', new Blob([Buffer.from(fixtures[kind], 'base64')], { type: MIME[kind] }), name);
  form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
  return (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
};
const search = async term => { const r = (await lab.request(`/content/search?q=${encodeURIComponent(term)}&searchIn=all`)).data; return (r.items ?? r).map(h => h.fileId ?? h.id); };
const ids = {};
try {
  // 20. Files keeps working with content processing OFF: upload, list and download without any job.
  await lab.setPolicy({ profile: 'OFF' }); await stopWorker(lab);
  const offId = await send('heic', 'IMG_0001.heic');
  const listed = (await lab.request('/files?limit=50')).data;
  check('20. Files uploads and lists with content processing OFF (no job created)', (listed.items ?? listed).some(f => f.id === offId) && Number(await psql(`SELECT count(*) FROM runly_content.job WHERE file_id='${offId}'`)) === 0);

  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: false, maxPending: 20 }); await startWorker(lab, env);
  ids.heic = await send('heic', 'IMG_4821.heic'); ids.corrupt = await send('corrupt', 'IMG_9999.heic');
  ids.docx = await send('docx', 'Documento_A.docx'); ids.xlsx = await send('xlsx', 'Hoja_B.xlsx'); ids.pptx = await send('pptx', 'Presentacion_C.pptx');
  const states = await lab.waitTerminal(Object.values(ids), 180);
  check('1-2. HEIC photo recognized (state done)', states[ids.heic] === 'done', states[ids.heic]);
  check('corrupt HEIC rejected in a controlled way', states[ids.corrupt] !== 'done' && Boolean(states[ids.corrupt]), states[ids.corrupt]);
  const failure = await psql(`SELECT attempts||'/'||coalesce(error_code,'-') FROM runly_content.job WHERE file_id='${ids.corrupt}'`);
  check('corrupt HEIC attempts bounded', Number(failure.split('/')[0]) <= 3, `attempts/errorCode=${failure}`);
  const truth = (await lab.request(`/content/files/${ids.heic}`)).data, page = truth.pages?.[0];
  check('3. HEIC found by text that exists only inside the photo', (await search(marker)).includes(ids.heic));
  check('5. HEIC result carries coordinates with canvas contract', Boolean(page?.engine?.canvas?.width && page.words?.some(w => w.text.includes(marker))), JSON.stringify(page?.engine?.canvas));
  const stored = await psql(`SELECT size_bytes FROM file_asset WHERE id='${ids.heic}'`);
  check('17. HEIC original unchanged (stored size equals uploaded bytes)', Number(stored) === Buffer.from(fixtures.heic, 'base64').length, stored);
  for (const [kind, term] of [['docx', doc], ['xlsx', sheet], ['pptx', deck]]) {
    check(`19. ${kind.toUpperCase()} found by content absent from its name`, (await search(term)).includes(ids[kind]), states[ids[kind]]);
  }
  check('19. DOCX header text found', (await search(header)).includes(ids.docx));
  const xlsx = (await lab.request(`/content/files/${ids.xlsx}`)).data.pages;
  check('19. XLSX carries a sheet reference and no invented coordinates', xlsx.length === 1 && !xlsx[0].words?.length, xlsx.map(p => p.reference).join(','));
  // Historical HEIC omitted before support (uploaded while processing was OFF) is discovered selectively, nothing else is reindexed.
  const before = Number(await psql(`SELECT count(*) FROM runly_content.job`));
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: true, maxPending: 20 });
  await lab.request('/content/admin/backfill', lab.json({ action: 'start', filters: { mode: 'never', mime: 'image/heic' } }));
  const history = (await lab.waitTerminal([offId], 180))[offId];
  const added = Number(await psql(`SELECT count(*) FROM runly_content.job`)) - before;
  check('historical HEIC previously omitted is processed after enabling support', history === 'done', history);
  check('historical discovery did not reindex unrelated files', added <= 3, `new jobs=${added}`);
} finally {
  await stopWorker(lab); await lab.restore();
  await writeFile(path.join(out, 'vertical-formats.json'), JSON.stringify({ at: new Date().toISOString(), checks }, null, 1));
}
process.exit(checks.every(c => c.ok) ? 0 : 1);
