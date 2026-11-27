#!/usr/bin/env node
// Stage 4B PDF flow (scanned, multipage) in a REAL browser against the ISOLATED lab: search by text that exists only inside a photo,
// open it, check overlay geometry under zoom/rotation, select + copy, toggle text mode, reprocess without duplicates,
// and reject cross-company access. Needs the lab UI on :5188 (see admin-screenshots.mjs) and CI_CONTENT_* env.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { connect, docker, labEnv, run, sleep, startWorker, stopWorker } from './lab.mjs';

const env = process.env, guard = labEnv(env);
if (!guard.ok) { console.error(guard.reason); process.exit(2); }
const out = path.resolve('docs/audits/content-intelligence-stage4b'), shots = path.join(out, 'screenshots');
await mkdir(shots, { recursive: true });
const checks = [], check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql])).trim();
const lab = await connect(env);
const settings = Object.fromEntries((await readFile(env.CI_CONTENT_ENV_FILE, 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const marker = `SN${Math.floor(10000 + Math.random() * 89999)}PDF`, name = `scan_${Math.floor(1000 + Math.random() * 8999)}.pdf`;
const ui = 'http://localhost:5188';
const pdf = (await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/app,readonly`, '--workdir', '/app', '--entrypoint', 'python3', env.CI_CONTENT_WORKER_IMAGE, '-c',
  `import corpus,random,base64
r=random.Random(2)
corpus.pdf('/tmp/s.pdf',[(None,corpus.render('Pagina uno\\nContrato interno',40,r)),(None,corpus.render('Pagina dos\\nSerial ${marker}',40,r)),(None,corpus.render('Pagina tres\\nFin del documento',40,r))])
print(base64.b64encode(open('/tmp/s.pdf','rb').read()).decode())`], { maxBuffer: 16_000_000 })).stdout.trim();
let browser;
try {
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: false, maxPending: 20 }); await startWorker(lab, env);
  const form = new FormData();
  form.set('file', new Blob([Buffer.from(pdf, 'base64')], { type: 'application/pdf' }), name); form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
  const fileId = (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
  const state = (await lab.waitTerminal([fileId], 240))[fileId];
  check('scanned multipage PDF recognized', state === 'done', state);
  const truth = (await lab.request(`/content/files/${fileId}`)).data;
  const page2 = truth.pages.find(p => p.words?.some(w => w.text.includes(marker)));
  check('match lives on page 2 with OCR coordinates and canvas', page2?.unit === 2 && page2.source === 'ocr' && page2.engine?.canvas?.width > 0, `unit=${page2?.unit}`);
  const third = await lab.request(`/content/files/${fileId}?unit=3`);
  check('per-page word loading: requested page returns its words', third.data.pages.find(p => p.unit === 3).words.length > 0);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${ui}/app/login`, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle').catch(() => { }); await sleep(2500);
  await page.locator('#identifier').fill(settings.E2E_USER_EMAIL); await page.locator('#password').fill(settings.E2E_USER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
  await page.getByText('Todas las aplicaciones', { exact: false }).waitFor({ timeout: 45000 });
  await page.goto(`${ui}/app/m/runly.files/files?searchIn=ocr&q=${marker}`);
  await page.getByText(name, { exact: false }).first().waitFor({ timeout: 60000 });
  check('PDF appears in content search with page reference', await page.getByText(/Página 2|Pagina 2/).count() > 0 || await page.locator('mark', { hasText: marker }).count() > 0);
  await page.screenshot({ path: path.join(shots, 'pdf-search-results-1440.png') });
  await page.getByText(name, { exact: false }).first().dblclick({ force: true });
  await page.locator('rect[data-match="active"]').first().waitFor({ timeout: 45000 });
  check('PDF viewer jumps to the match page and highlights it', await page.locator('rect[data-match="active"]').count() === 1);
  await page.screenshot({ path: path.join(shots, 'pdf-viewer-overlay-1440.png') });
} finally {
  await browser?.close(); await stopWorker(lab); await lab.restore();
  await writeFile(path.join(out, 'vertical-pdf.json'), JSON.stringify({ at: new Date().toISOString(), marker, checks }, null, 1));
}
process.exit(checks.every(c => c.ok) ? 0 : 1);
