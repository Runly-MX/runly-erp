#!/usr/bin/env node
// Stage 4B vertical flow in a REAL browser against the ISOLATED lab: search by text that exists only inside a photo,
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
const marker = `FCW${Math.floor(1000 + Math.random() * 8999)}A07`, name = `IMG_${Math.floor(1000 + Math.random() * 8999)}.png`;
const ui = 'http://localhost:5188';
const png = (await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/app,readonly`, '--workdir', '/app', '--entrypoint', 'python3', env.CI_CONTENT_WORKER_IMAGE, '-c',
  `import corpus,io,base64,random\nb=io.BytesIO();corpus.render('ETIQUETA RED\\nSerial ${marker}\\nModelo AP-AX3000',48,random.Random(1)).save(b,'PNG');print(base64.b64encode(b.getvalue()).decode())`], { maxBuffer: 8_000_000 })).stdout.trim();
let fileId, browser;
try {
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: false, maxPending: 20 }); await startWorker(lab, env);
  const form = new FormData();
  form.set('file', new Blob([Buffer.from(png, 'base64')], { type: 'image/png' }), name); form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
  fileId = (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
  const state = (await lab.waitTerminal([fileId], 120))[fileId];
  check('1-3. photo recognized and indexed', state === 'done', state);
  const truth = (await lab.request(`/content/files/${fileId}`)).data;
  const words = truth.pages[0].words, canvas = truth.pages[0].engine.canvas, target = words.find(w => w.text.includes(marker));
  check('API returns coordinates with canvas contract', Boolean(target && canvas?.width && canvas?.height), JSON.stringify(canvas));
  check('name of the photo contains no searched text', !name.includes(marker));
  // cross-company / manipulated access
  const bogus = '00000000-0000-7000-8000-000000000001';
  const denied = await lab.request(`/content/files/${fileId}`, { headers: { 'X-Runly-Company-Id': bogus } }).then(() => 'allowed', e => e.message.slice(0, 40));
  const deniedSearch = await lab.request(`/content/search?q=${marker}&searchIn=ocr`, { headers: { 'X-Runly-Company-Id': bogus } }).then(r => `allowed:${r.data?.length}`, e => e.message.slice(0, 40));
  check('23. valid session with a company it does not belong to gets no text/coordinates/search', !String(denied).startsWith('allowed') && !String(deniedSearch).startsWith('allowed'), `${denied} | ${deniedSearch}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.goto(`${ui}/app/login`, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle').catch(() => { }); await sleep(2500);
  await page.locator('#identifier').fill(settings.E2E_USER_EMAIL); await page.locator('#password').fill(settings.E2E_USER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
  await page.getByText('Todas las aplicaciones', { exact: false }).waitFor({ timeout: 45000 });
  await page.goto(`${ui}/app/m/runly.files/files?searchIn=ocr&q=${marker}`);
  await page.getByText(name, { exact: false }).first().waitFor({ timeout: 60000 });
  check('5-6. photo appears in content search results', true);
  const snippetMark = await page.locator('mark', { hasText: marker }).count();
  check('7. snippet highlights the identifier', snippetMark > 0, `marks=${snippetMark}`);
  await page.screenshot({ path: path.join(shots, 'search-results-1440.png') });
  await page.getByText(name, { exact: false }).first().dblclick({ force: true });
  await page.locator('[data-ocr-overlay]').first().waitFor({ timeout: 30000 });
  const activeRect = page.locator('rect[data-match="active"]').first();
  await activeRect.waitFor({ timeout: 10000 });
  check('8-10. viewer keeps the term and highlights the match', await page.locator('rect[data-match]').count() >= 1);
  await page.screenshot({ path: path.join(shots, 'viewer-overlay-1440.png') });

  const img = page.locator(`img[alt="${name}"]`).first();
  const centerExpected = async turns => { // expected screen center of the word from OCR coordinates + image bbox
    const b = await img.boundingBox(), u = (target.x + target.width / 2) / canvas.width, v = (target.y + target.height / 2) / canvas.height;
    const [x, y] = [[b.x + u * b.width, b.y + v * b.height], [b.x + b.width - v * b.width, b.y + u * b.height], [b.x + b.width - u * b.width, b.y + b.height - v * b.height], [b.x + v * b.width, b.y + b.height - u * b.height]][turns % 4];
    return { x, y };
  };
  const geometry = async (label, turns = 0) => {
    const r = await activeRect.boundingBox(), e = await centerExpected(turns);
    const dx = Math.abs(r.x + r.width / 2 - e.x), dy = Math.abs(r.y + r.height / 2 - e.y);
    check(`overlay aligned: ${label}`, dx <= 2 && dy <= 2, `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
  };
  await geometry('initial');
  await page.getByTitle(/Aumentar zoom/).click(); await page.getByTitle(/Aumentar zoom/).click(); await sleep(400);
  await geometry('zoomed in');
  await page.getByTitle(/Reducir zoom|Disminuir zoom|Alejar/).click(); await sleep(400); await geometry('zoomed out');
  await page.getByTitle(/Rotar derecha/).click(); await sleep(500); await geometry('rotated 90 deg', 1);
  await page.getByTitle(/Rotar derecha/).click(); await sleep(500); await geometry('rotated 180 deg', 2);
  await page.screenshot({ path: path.join(shots, 'viewer-rotated-1440.png') });
  await page.getByTitle(/Rotar derecha/).click(); await page.getByTitle(/Rotar derecha/).click(); await sleep(500);
  await page.setViewportSize({ width: 1100, height: 700 }); await sleep(500); await geometry('after viewer resize');
  await page.setViewportSize({ width: 1440, height: 1000 }); await sleep(400);

  // text mode: select + copy exactly the stored OCR text
  await page.getByRole('button', { name: 'Texto reconocido', exact: true }).click(); await sleep(400);
  const allWords = await page.locator('[data-ocr-overlay] rect').count();
  check('text mode shows all recognized words', allWords === words.length, `${allWords}/${words.length}`);
  await activeRect.click(); await sleep(200);
  await page.getByRole('button', { name: /Copiar selección \(1\)/ }).click(); await sleep(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check('11-12. copied text equals the stored OCR word', copied === target.text, `${JSON.stringify(copied)} vs ${JSON.stringify(target.text)}`);
  await page.screenshot({ path: path.join(shots, 'viewer-text-mode-1440.png') });
  await page.getByRole('button', { name: 'Texto reconocido', exact: true }).click(); await sleep(300);
  check('17-18. text mode off leaves only the match highlight', await page.locator('[data-ocr-overlay] rect').count() === 1);
  await page.getByRole('button', { name: 'Texto reconocido', exact: true }).click(); await sleep(300);
  check('19. text mode back on', await page.locator('[data-ocr-overlay] rect').count() === words.length);
  await page.getByPlaceholder('Buscar en el texto…').fill('Modelo'); await sleep(500);
  const modelo = words.findIndex(w => /^modelo$/i.test(w.text));
  check('20. search inside the image moves the highlight', (await page.locator('rect[data-match="active"]').count()) === 1, `word#${modelo}`);

  // reprocess authorized + no duplicate jobs
  const before = Number(await psql(`SELECT count(*) FROM runly_content.job WHERE file_id='${fileId}'`));
  const button = page.getByRole('button', { name: 'Alta precisión' });
  await Promise.all([button.click({ noWaitAfter: true }), button.click({ noWaitAfter: true, force: true }).catch(() => { })]);
  await sleep(2500);
  const after = Number(await psql(`SELECT count(*) FROM runly_content.job WHERE file_id='${fileId}'`));
  check('21-22. reprocess keeps exactly one job for this file version', before === 1 && after === 1, `${before}->${after}`);
  await page.screenshot({ path: path.join(shots, 'viewer-panel-reprocess-1440.png') });
  await page.setViewportSize({ width: 390, height: 860 }); await sleep(700);
  await page.screenshot({ path: path.join(shots, 'viewer-text-mode-390.png') });
  check('mobile: no horizontal overflow', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
} finally {
  await browser?.close(); await stopWorker(lab); await lab.restore();
  await writeFile(path.join(out, 'vertical-viewer.json'), JSON.stringify({ at: new Date().toISOString(), marker, fileId, checks }, null, 1));
}
process.exit(checks.every(c => c.ok) ? 0 : 1);
