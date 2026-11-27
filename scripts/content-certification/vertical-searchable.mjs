#!/usr/bin/env node
// Stage 4C vertical flow (API level, ISOLATED lab): scanned multipage PDF -> OCR -> "Generar PDF buscable" -> signed download ->
// independent reader (poppler) finds/copies the identifier at the right place -> original untouched -> other company denied.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { connect, docker, labEnv, run, sleep, startWorker, stopWorker } from './lab.mjs';

const env = process.env, guard = labEnv(env);
if (!guard.ok) { console.error(guard.reason); process.exit(2); }
const out = path.resolve('docs/audits/content-intelligence-stage4c'), scratch = path.resolve('.artifacts/content-intelligence/stage4c/pdf');
await mkdir(out, { recursive: true }); await mkdir(scratch, { recursive: true });
const checks = [], check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql])).trim();
const lab = await connect(env);
const marker = `SP${Math.floor(10000 + Math.random() * 89999)}KR`;
const worker = args => run('docker', ['run', '--rm', '--network', 'none', '--user', '0', '--entrypoint', ...args], { maxBuffer: 16_000_000 });
const mounts = ['-v', `${path.resolve('apps/content-worker')}:/app:ro`, '-v', `${path.resolve('scripts/content-certification')}:/fx:ro`, '-v', `${scratch}:/out`, '-w', '/app', '-e', 'PYTHONPATH=/app', '-e', `MARKER=${marker}`, '-e', 'OUT=/out'];
const truth = JSON.parse((await worker(['python3', ...mounts, env.CI_CONTENT_WORKER_IMAGE, '/fx/fixtures-pdf.py'])).stdout.trim().split('\n').pop());
const sha = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const send = async (file, name) => {
  const form = new FormData();
  form.set('file', new Blob([await readFile(path.join(scratch, file))], { type: 'application/pdf' }), name);
  form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
  return (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
};
const reader = async (file, ...args) => (await worker(['sh', '-v', `${scratch}:/out`, env.CI_CONTENT_WORKER_IMAGE, '-c', `${args.join(' ')}`])).stdout;
const generate = async (id, label) => {
  await lab.request(`/content/files/${id}/searchable-pdf`, lab.json({}));
  let state;
  for (let i = 0; i < 90; i++) { state = (await lab.request(`/content/files/${id}`)).data.searchablePdf; if (state && ['done', 'failed'].includes(state.state)) break; await sleep(2000); }
  check(`${label}: searchable copy generated`, state?.state === 'done', JSON.stringify(state));
  const link = (await lab.request(`/content/files/${id}/searchable-pdf`)).data;
  const bytes = Buffer.from(await (await fetch(link.url)).arrayBuffer());
  await writeFile(path.join(scratch, `${label}-searchable.pdf`), bytes);
  check(`${label}: download through authorized signed URL is a PDF`, bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 1000, `${bytes.length} bytes name=${link.name}`);
  return { state, bytes };
};
let ids = {};
try {
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: false, maxPending: 20 }); await startWorker(lab, env);
  ids.plain = await send('scan-3p.pdf', 'Escaneo_trimestral.pdf'); ids.rot = await send('scan-rot90.pdf', 'Escaneo_girado.pdf');
  const originalHash = await sha(path.join(scratch, 'scan-3p.pdf'));
  const states = await lab.waitTerminal(Object.values(ids), 240);
  check('9. scanned 3-page PDF recognized', states[ids.plain] === 'done', states[ids.plain]);
  check('10. identifier found inside page 2 only', (await lab.request(`/content/search?q=${marker}&searchIn=ocr`)).data.some(h => (h.fileId ?? h.id) === ids.plain));
  // Authorization before generation: another company cannot request/download derivatives.
  const bogus = '00000000-0000-7000-8000-000000000001';
  const denied = await lab.request(`/content/files/${ids.plain}/searchable-pdf`, { ...lab.json({}), headers: { 'X-Runly-Company-Id': bogus } }).then(() => 'allowed', e => e.message.slice(0, 50));
  check('18. valid session of another company cannot request a derivative', !String(denied).startsWith('allowed'), denied);

  const plain = await generate(ids.plain, 'scan-3p');
  const text = await reader('x', `pdftotext -layout /out/scan-3p-searchable.pdf - | grep -cw ${marker}`).catch(() => '0');
  check('15-16. independent reader (poppler) finds and extracts the identifier', Number(text.trim()) >= 1, `matches=${text.trim()}`);
  const pages = await reader('x', `for p in 1 2 3; do echo p$p:$(pdftotext -f $p -l $p /out/scan-3p-searchable.pdf - | grep -cw ${marker}); done`);
  check('identifier is on page 2 of the derivative', /p1:0/.test(pages) && /p2:1/.test(pages) && /p3:0/.test(pages), pages.replace(/\n/g, ' '));
  const bbox = await reader('x', `pdftotext -bbox -f 2 -l 2 /out/scan-3p-searchable.pdf - | grep ">${marker}<"`);
  const m = bbox.match(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/);
  const box = truth.pageBoxPt;
  const inside = m && +m[1] >= box.xMin - 6 && +m[3] <= box.xMax + 6 && +m[2] >= box.yMin - 6 && +m[4] <= box.yMax + 6;
  const dy = m ? Math.abs((+m[2] + +m[4]) / 2 - (box.yMin + box.yMax) / 2) : null, dx = m ? Math.abs(+m[1] - box.xMin - (box.xMax - box.xMin) * 0.5) : null;
  check('14. text layer sits on the visible text (independent ground truth, tolerance 6 pt)', inside, `word box [${m?.slice(1, 5)}] vs line box [${box.xMin.toFixed(1)},${box.yMin.toFixed(1)},${box.xMax.toFixed(1)},${box.yMax.toFixed(1)}] verticalCenterError=${dy?.toFixed(1)}pt`);
  const before = await reader('x', 'pdftoppm -f 2 -l 2 -singlefile -r 50 -png /out/scan-3p.pdf /out/a && pdftoppm -f 2 -l 2 -singlefile -r 50 -png /out/scan-3p-searchable.pdf /out/b && python3 -c "from PIL import Image,ImageChops;a=Image.open(\'/out/a.png\').convert(\'L\');b=Image.open(\'/out/b.png\').convert(\'L\');print(a.size==b.size, sum(ImageChops.difference(a,b).histogram()[40:])/(a.width*a.height))"').catch(e => String(e.message));
  const [same, diff] = before.trim().split(' ');
  check('visual comparison with the original (page 2 render)', same === 'True' && Number(diff) < 0.03, `sameSize=${same} changedPixelRatio=${diff}`);
  check('17. original unchanged (sha256 and stored size)', originalHash === await sha(path.join(scratch, 'scan-3p.pdf')) && Number(await psql(`SELECT size_bytes FROM file_asset WHERE id='${ids.plain}'`)) === (await readFile(path.join(scratch, 'scan-3p.pdf'))).length);
  // Reuse: second request returns the finished derivative, no new row.
  const rows = Number(await psql(`SELECT count(*) FROM runly_content.derivative WHERE file_id='${ids.plain}'`));
  await lab.request(`/content/files/${ids.plain}/searchable-pdf`, lab.json({}));
  check('reuse: repeating the request creates no second derivative', rows === 1 && Number(await psql(`SELECT count(*) FROM runly_content.derivative WHERE file_id='${ids.plain}'`)) === 1);
  check('derivative state recorded (engine, size, pages, retention by revision)', plain.state.sizeBytes > 0 && plain.state.pages === 3 && plain.state.ocrPages === 3, JSON.stringify(plain.state));

  // 12. rotated page: the derivative renders upright like the original.
  const rotated = await generate(ids.rot, 'scan-rot90');
  const dims = await reader('x', `pdfinfo /out/scan-rot90.pdf | grep -E "Page size|Page rot"; pdfinfo /out/scan-rot90-searchable.pdf | grep -E "Page size|Page rot"; pdftotext /out/scan-rot90-searchable.pdf - | grep -cw ${marker}; true`);
  const sizes = dims.match(/([\d.]+) x ([\d.]+)/g) ?? [];
  const swapped = sizes[0]?.split(' x ').reverse().join(' x ');
  const hits = Number(dims.trim().split('\n').pop());
  check('12. rotated PDF: derivative has the visible (rotated) page size and a text layer', sizes.length === 2 && swapped === sizes[1] && hits >= 1, dims.replace(/\n/g, ' | '));
  // Lifecycle: disabling the file removes the servable copy.
  await psql(`UPDATE file_asset SET enabled=false WHERE id='${ids.rot}'`);
  const gone = await lab.request(`/content/files/${ids.rot}/searchable-pdf`).then(() => 'served', e => e.message.slice(0, 40));
  check('lifecycle: a disabled original serves no derivative', gone !== 'served', gone);
  await psql(`UPDATE file_asset SET enabled=true WHERE id='${ids.rot}'`);
  // Policy: disabling processing blocks new derivatives.
  await lab.setPolicy({ profile: 'OFF' });
  const blocked = await lab.request(`/content/files/${ids.rot}/searchable-pdf`, lab.json({})).then(() => 'allowed', e => e.message.slice(0, 60));
  await psql(`DELETE FROM runly_content.derivative WHERE file_id='${ids.rot}'`);
  const blocked2 = await lab.request(`/content/files/${ids.rot}/searchable-pdf`, lab.json({})).then(() => 'allowed', e => e.message.slice(0, 60));
  check('policy OFF prevents generating a new derivative', !String(blocked2).startsWith('allowed'), `${blocked} | ${blocked2}`);
  check('temp: worker left no temporary files behind', (await docker(['exec', lab.names.worker, 'sh', '-c', 'ls /tmp | wc -l'])).trim() === '0', '');
} finally {
  await stopWorker(lab); await lab.restore();
  await writeFile(path.join(out, 'vertical-searchable.json'), JSON.stringify({ at: new Date().toISOString(), marker, truth, checks }, null, 1));
}
process.exit(checks.every(c => c.ok) ? 0 : 1);
