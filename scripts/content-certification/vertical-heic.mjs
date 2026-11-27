#!/usr/bin/env node
// Stage 4D: a HEIC photo is recognized, found by content, shown in Chromium AND Firefox through the existing image-transform
// variant, and the overlay lands on the recognized word. The original object is never replaced. ISOLATED lab only.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import { connect, docker, labEnv, run, sleep, startWorker, stopWorker } from './lab.mjs';

const env = process.env, guard = labEnv(env);
if (!guard.ok) { console.error(guard.reason); process.exit(2); }
const out = path.resolve('docs/audits/content-intelligence-stage4d'), shots = path.join(out, 'screenshots');
await mkdir(shots, { recursive: true });
const checks = [], check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atq', '-c', sql])).trim();
const lab = await connect(env);
const settings = Object.fromEntries((await readFile(env.CI_CONTENT_ENV_FILE, 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const marker = `TMR${[0, 0, 0, 0].map(() => 2 + Math.floor(Math.random() * 8)).join('')}HX`;
const bytes = Buffer.from((await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/app,readonly`, '-w', '/app', '--entrypoint', 'python3', env.CI_CONTENT_WORKER_IMAGE, '-c',
  `import corpus,io,base64,random,pillow_heif\npillow_heif.register_heif_opener()\nb=io.BytesIO();corpus.render('ETIQUETA HEIC\\nSerial ${marker}\\nModelo AP-9',46,random.Random(2)).save(b,'HEIF');print(base64.b64encode(b.getvalue()).decode())`], { maxBuffer: 8e6 })).stdout.trim(), 'base64');
const ui = 'http://localhost:5188';
let id, browsers = [];
try {
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: false, maxPending: 20 }); await startWorker(lab, env);
  const form = new FormData(); form.set('file', new Blob([bytes], { type: 'image/heic' }), 'FOTO_HEIC_VISOR.heic'); form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'true');
  id = (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
  const state = (await lab.waitTerminal([id], 120))[id];
  check('HEIC photo recognized', state === 'done', state);
  const data = (await lab.request(`/content/files/${id}`)).data.pages[0], target = data.words.find(w => w.text.includes(marker)), canvas = data.engine.canvas;
  check('coordinates present with canvas of the decoded photo', Boolean(target && canvas.width));
  const before = await psql(`SELECT size_bytes||':'||object_key FROM file_asset WHERE id='${id}'`);
  for (const [name, type] of [['chromium', chromium], ['firefox', firefox]]) {
    const browser = await type.launch(); browsers.push(browser);
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: name === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [] })).newPage();
    await page.goto(`${ui}/app/login`); await sleep(2500);
    await page.locator('#identifier').fill(settings.E2E_USER_EMAIL); await page.locator('#password').fill(settings.E2E_USER_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await page.getByText('Todas las aplicaciones').waitFor({ timeout: 45000 });
    await page.goto(`${ui}/app/m/runly.files/files?searchIn=ocr&q=${marker}`); await page.getByText('FOTO_HEIC_VISOR').first().waitFor({ timeout: 60000 });
    await page.getByText('FOTO_HEIC_VISOR').first().dblclick({ force: true }); await page.locator('[data-ocr-overlay]').first().waitFor({ timeout: 40000 });
    const img = page.locator('img[alt="FOTO_HEIC_VISOR.heic"]').first();
    await page.waitForFunction(() => [...document.querySelectorAll('img')].some(i => i.alt === 'FOTO_HEIC_VISOR.heic' && i.naturalWidth > 0), null, { timeout: 30000 });
    check(`${name}: the HEIC photo is displayed (decoded bitmap)`, await img.evaluate(i => i.naturalWidth > 0), await img.evaluate(i => `${i.naturalWidth}x${i.naturalHeight}`));
    const active = page.locator('[data-match="active"]').first(); await active.waitFor({ timeout: 20000 });
    const ib = await img.boundingBox(), ab = await active.boundingBox();
    const dx = Math.abs(ab.x + ab.width / 2 - (ib.x + (target.x + target.width / 2) / canvas.width * ib.width)), dy = Math.abs(ab.y + ab.height / 2 - (ib.y + (target.y + target.height / 2) / canvas.height * ib.height));
    check(`${name}: overlay sits on the recognized word`, dx <= 2 && dy <= 2, `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
    await page.screenshot({ path: path.join(shots, `heic-viewer-${name}-1280.png`) });
    await page.close();
  }
  check('original HEIC object unchanged', before === await psql(`SELECT size_bytes||':'||object_key FROM file_asset WHERE id='${id}'`), before);
} finally {
  for (const b of browsers) await b.close().catch(() => { });
  await stopWorker(lab); await lab.restore();
  await writeFile(path.join(out, 'vertical-heic.json'), JSON.stringify({ at: new Date().toISOString(), marker, checks }, null, 1));
}
process.exit(checks.every(c => c.ok) ? 0 : 1);
