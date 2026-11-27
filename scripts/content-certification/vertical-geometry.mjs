#!/usr/bin/env node
// Stage 4C browser flow against the ISOLATED lab. Measures overlay geometry against ground truth that does NOT come from the OCR
// result being drawn: (a) a scanned PDF whose marker word position is known from the page layout, at zoom/rotation/resize;
// (b) a perspective photo whose text-line polygon is known from the homography used to create it; plus mouse drag selection,
// touch selection, and the visual matrix (widths x themes, grid/list, viewer, PDF, legacy/no-text/error states).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { connect, docker, labEnv, run, sleep, startWorker, stopWorker } from './lab.mjs';

const env = process.env, guard = labEnv(env);
if (!guard.ok) { console.error(guard.reason); process.exit(2); }
const out = path.resolve('docs/audits/content-intelligence-stage4c'), shots = path.join(out, 'screenshots'), scratch = path.resolve('.artifacts/content-intelligence/stage4c/pdf');
const standard = path.resolve(env.STAGE_CORPUS ?? '.artifacts/content-intelligence/stage4c/corpus-standard2');
await mkdir(shots, { recursive: true }); await mkdir(scratch, { recursive: true });
const checks = [], metrics = {}, check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql])).trim();
const lab = await connect(env);
const settings = Object.fromEntries((await readFile(env.CI_CONTENT_ENV_FILE, 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const marker = `GE${Math.floor(10000 + Math.random() * 89999)}X4`, dragMarker = `DR${Math.floor(1000 + Math.random() * 8999)}K2`;
const ui = 'http://localhost:5188';
const worker = args => run('docker', ['run', '--rm', '--network', 'none', '--user', '0', '--entrypoint', ...args], { maxBuffer: 16_000_000 });
const mounts = ['-v', `${path.resolve('apps/content-worker')}:/app:ro`, '-v', `${path.resolve('scripts/content-certification')}:/fx:ro`, '-v', `${scratch}:/out`, '-w', '/app', '-e', 'PYTHONPATH=/app', '-e', `MARKER=${marker}`, '-e', 'OUT=/out'];
const truth = JSON.parse((await worker(['python3', ...mounts, env.CI_CONTENT_WORKER_IMAGE, '/fx/fixtures-pdf.py'])).stdout.trim().split('\n').pop());
const dragPng = (await worker(['python3', '-v', `${path.resolve('apps/content-worker')}:/app:ro`, '-w', '/app', '-e', 'PYTHONPATH=/app', env.CI_CONTENT_WORKER_IMAGE, '-c',
  `import corpus,io,base64,random\nb=io.BytesIO();corpus.render('ETIQUETA ROUTER\\nSerial ${dragMarker} Modelo AP7\\nUbicacion Rack 4',46,random.Random(3)).save(b,'PNG');print(base64.b64encode(b.getvalue()).decode())`])).stdout.trim();
const manifest = JSON.parse(await readFile(path.join(standard, 'manifest.json'), 'utf8'));
const persp = manifest.entries.find(e => e.id === 'persp-001');
const upload = async (bytes, mime, name) => {
  const form = new FormData(); form.set('file', new Blob([bytes], { type: mime }), name);
  form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
  return (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
};
const pointInPolygon = ([x, y], poly) => { let inside = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, yi, xj, yj] = [poly[2 * i], poly[2 * i + 1], poly[2 * j], poly[2 * j + 1]]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
let browser, ids = {};
try {
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: false, maxPending: 30 }); await startWorker(lab, env);
  ids.pdf = await upload(await readFile(path.join(scratch, 'scan-3p.pdf')), 'application/pdf', 'Escaneo_geometria.pdf');
  ids.persp = await upload(await readFile(path.join(standard, 'persp-001.jpg')), 'image/jpeg', 'FOTO_EQUIPO_1.jpg');
  ids.drag = await upload(Buffer.from(dragPng, 'base64'), 'image/png', 'ETIQ_ROUTER.png');
  ids.blank = await upload(await readFile(path.join(standard, 'notext-000.png')), 'image/png', 'FOTO_SIN_TEXTO.png');
  ids.bad = await upload(Buffer.from('not really a picture'), 'image/png', 'DANADA.png');
  const states = await lab.waitTerminal(Object.values(ids), 240);
  check('fixtures recognized', ['pdf', 'persp', 'drag'].every(k => states[ids[k]] === 'done'), JSON.stringify(Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, states[v]]))));
  const perspWords = (await lab.request(`/content/files/${ids.persp}`)).data.pages[0].words;
  const projective = perspWords.some(w => w.polygon);
  metrics.perspectiveRectificationApplied = projective;
  console.log(projective ? 'persp-001: rectification applied, words carry polygons' : 'persp-001: rectification NOT applied (axis-aligned words)');
  const identifier = persp.identifiers[0], lineTruth = persp.lines.find(l => l.text.includes(identifier));

  browser = await chromium.launch({ headless: true });
  const open = async ({ width = 1440, height = 1000, dark = false, touch = false, list = false } = {}) => {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', hasTouch: touch, isMobile: touch, permissions: ['clipboard-read', 'clipboard-write'] });
    if (list) await context.addInitScript(() => localStorage.setItem('runly-view-mode-files', 'list'));
    const page = await context.newPage();
    await page.goto(`${ui}/app/login`, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle').catch(() => { }); await sleep(2000);
    await page.locator('#identifier').fill(settings.E2E_USER_EMAIL); await page.locator('#password').fill(settings.E2E_USER_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
    await page.getByText('Todas las aplicaciones', { exact: false }).waitFor({ timeout: 45000 });
    return { context, page };
  };
  const results = async (page, q, name) => {
    await page.goto(`${ui}/app/m/runly.files/files?searchIn=ocr&q=${encodeURIComponent(q)}`);
    await page.getByText(name, { exact: false }).first().waitFor({ timeout: 60000 }).catch(async e => { await page.screenshot({ path: path.join(scratch, 'failure.png') }); console.error(page.url(), (await page.locator('body').innerText()).slice(0, 300)); throw e; });
  };
  const openViewer = async (page, q, name) => { await results(page, q, name); await page.getByText(name, { exact: false }).first().dblclick({ force: true }); await page.locator('[data-ocr-overlay]').first().waitFor({ timeout: 40000 }); };

  // ---------- (a) PDF overlay geometry against layout truth ----------
  let { context, page } = await open();
  await openViewer(page, marker, 'Escaneo_geometria');
  const active = () => page.locator('[data-match="active"]').first();
  await active().waitFor({ timeout: 20000 });
  const w = truth.wordBoxPt, pageW = 600, pageH = 800;
  const expectedFraction = { u: (w.xMin + w.xMax) / 2 / pageW, v: (w.yMin + w.yMax) / 2 / pageH };
  // (u,v) fractions of the upright page -> fractions of the page as displayed after `turns` clockwise quarter turns.
  const toScreen = (u, v, turns) => [[u, v], [1 - v, u], [1 - u, 1 - v], [v, 1 - u]][turns % 4];
  const measurePdf = async (label, turns) => {
    const svg = await page.locator('[data-ocr-overlay]').first().boundingBox(), canvas = await page.locator('.react-pdf__Page__canvas').first().boundingBox(), box = await active().boundingBox();
    const [eu, ev] = toScreen(expectedFraction.u, expectedFraction.v, turns);
    const au = (box.x + box.width / 2 - svg.x) / svg.width, av = (box.y + box.height / 2 - svg.y) / svg.height;
    const dims = turns % 2 ? [pageH, pageW] : [pageW, pageH];            // displayed page size in points
    const screenX = Math.abs(au - eu) * dims[0], screenY = Math.abs(av - ev) * dims[1];
    const [errX, errY] = turns % 2 ? [screenY, screenX] : [screenX, screenY];   // errors in the upright page's axes
    const containerDelta = Math.max(Math.abs(svg.x - canvas.x), Math.abs(svg.y - canvas.y), Math.abs(svg.width - canvas.width), Math.abs(svg.height - canvas.height));
    metrics[`pdf ${label}`] = { errorXpt: +errX.toFixed(2), errorYpt: +errY.toFixed(2), overlayVsPageCanvasPx: +containerDelta.toFixed(2) };
    check(`PDF overlay geometry: ${label}`, errX <= 10 && errY <= 6 && containerDelta <= 2, `error x=${errX.toFixed(1)}pt (Tesseract word-box left edge, not the transform) y=${errY.toFixed(1)}pt, overlay box vs rendered page canvas differ ${containerDelta.toFixed(1)}px`);
  };
  await measurePdf('initial', 0);
  await page.screenshot({ path: path.join(shots, 'pdf-overlay-1440.png') });
  await page.getByTitle(/Aumentar zoom/).click(); await page.getByTitle(/Aumentar zoom/).click(); await sleep(900); await active().scrollIntoViewIfNeeded(); await measurePdf('zoomed in', 0);
  await page.getByTitle(/Reducir zoom|Disminuir zoom|Alejar/).click(); await page.getByTitle(/Reducir zoom|Disminuir zoom|Alejar/).click(); await sleep(900);
  for (const turns of [1, 2, 3]) { await page.getByTitle(/Rotar derecha/).click(); await sleep(900); await measurePdf(`rotated ${turns * 90} deg`, turns); if (turns === 1) await page.screenshot({ path: path.join(shots, 'pdf-overlay-rotated90-1440.png') }); }
  await page.getByTitle(/Rotar derecha/).click(); await sleep(700);
  await page.setViewportSize({ width: 1100, height: 700 }); await sleep(900); await measurePdf('after viewer resize', 0);
  await context.close();

  // ---------- (b) perspective photo against homography truth ----------
  ({ context, page } = await open());
  await openViewer(page, identifier, 'FOTO_EQUIPO_1');
  const shape = page.locator('[data-match="active"]').first(); await shape.waitFor({ timeout: 20000 });
  const img = page.locator('img[alt="FOTO_EQUIPO_1.jpg"]').first(), ib = await img.boundingBox(), sb = await shape.boundingBox();
  const canvasPx = (await lab.request(`/content/files/${ids.persp}`)).data.pages[0].engine.canvas;
  const centerPx = [(sb.x + sb.width / 2 - ib.x) / ib.width * canvasPx.width, (sb.y + sb.height / 2 - ib.y) / ib.height * canvasPx.height];
  const poly = lineTruth.polygon, mid = [[(poly[0] + poly[6]) / 2, (poly[1] + poly[7]) / 2], [(poly[2] + poly[4]) / 2, (poly[3] + poly[5]) / 2]];
  const [dx, dy] = [mid[1][0] - mid[0][0], mid[1][1] - mid[0][1]], norm = Math.hypot(dx, dy);
  const lateral = Math.abs((centerPx[0] - mid[0][0]) * dy - (centerPx[1] - mid[0][1]) * dx) / norm;
  const lineHeight = Math.hypot(poly[6] - poly[0], poly[7] - poly[1]);
  metrics.perspective = { overlayCenterPx: centerPx.map(v => +v.toFixed(1)), lateralErrorToLineAxisPx: +lateral.toFixed(1), lineHeightPx: +lineHeight.toFixed(1), insideTruthLinePolygon: pointInPolygon(centerPx, poly), polygonWords: projective };
  check('perspective photo: overlay sits on the true text line (homography ground truth)', pointInPolygon(centerPx, poly) && lateral <= lineHeight / 2, `center=${centerPx.map(v => v.toFixed(0))} lateral error ${lateral.toFixed(1)}px of line height ${lineHeight.toFixed(1)}px, projective polygons=${projective}`);
  await page.screenshot({ path: path.join(shots, 'perspective-overlay-1440.png') });
  await context.close();

  // ---------- (c) selection: mouse drag (desktop) and touch tap (mobile) ----------
  ({ context, page } = await open());
  await openViewer(page, dragMarker, 'ETIQ_ROUTER');
  await page.getByRole('button', { name: 'Texto reconocido', exact: true }).click(); await sleep(500);
  const dragWords = (await lab.request(`/content/files/${ids.drag}`)).data.pages[0].words;
  const rects = page.locator('[data-ocr-overlay] rect'), count = await rects.count();
  const centerOf = async i => { const b = await rects.nth(i).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const serial = dragWords.findIndex(x => x.text === 'Serial'), last = serial + 2;
  const [a, b] = [await centerOf(serial), await centerOf(last)];
  await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move((a[0] + b[0]) / 2, a[1], { steps: 6 }); await page.mouse.move(...b, { steps: 6 }); await page.mouse.up(); await sleep(300);
  const expected = dragWords.slice(serial, last + 1).map(x => x.text).join(' ');
  check('drag selects consecutive words without panning the page', await page.getByRole('button', { name: new RegExp(`Copiar selección \\(${last - serial + 1}\\)`) }).count() === 1, `${count} words, dragged ${serial}..${last}`);
  await page.getByRole('button', { name: /Copiar selección/ }).click(); await sleep(300);
  check('drag selection copies exactly the stored OCR words in reading order', (await page.evaluate(() => navigator.clipboard.readText())) === expected, JSON.stringify(expected));
  await page.screenshot({ path: path.join(shots, 'drag-selection-1440.png') });
  await context.close();
  ({ context, page } = await open({ width: 390, height: 860, touch: true }));
  await openViewer(page, dragMarker, 'ETIQ_ROUTER');
  await page.getByRole('button', { name: 'Texto reconocido', exact: true }).click(); await sleep(500);
  const tapRects = page.locator('[data-ocr-overlay] rect'), tb = await tapRects.nth(serial).boundingBox();
  await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(300);
  check('mobile: tapping a recognized word selects it (text mode with a finished result)', await page.getByRole('button', { name: /Copiar selección \(1\)/ }).count() === 1);
  check('mobile: no horizontal overflow with the viewer open', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await page.screenshot({ path: path.join(shots, 'mobile-text-mode-selected-390.png') });
  await context.close();

  // ---------- (d) visual matrix ----------
  const widths = [1440, 1280, 768, 390, 320];
  for (const dark of [false, true]) for (const width of widths) {
    if (dark && ![1440, 390, 320].includes(width)) continue;
    const tag = `${width}-${dark ? 'dark' : 'light'}`, touch = width < 500;
    ({ context, page } = await open({ width, height: width < 500 ? 860 : 900, dark, touch }));
    await results(page, dragMarker, 'ETIQ_ROUTER'); await sleep(800); await page.screenshot({ path: path.join(shots, `matrix-grid-${tag}.png`) });
    await openViewer(page, dragMarker, 'ETIQ_ROUTER');
    await page.getByRole('button', { name: 'Texto reconocido', exact: true }).click().catch(() => { }); await sleep(500);
    await page.screenshot({ path: path.join(shots, `matrix-viewer-text-${tag}.png`) });
    check(`matrix ${tag}: viewer without horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    await context.close();
    if (!dark || width === 1440) {
      ({ context, page } = await open({ width, height: width < 500 ? 860 : 900, dark, touch, list: true }));
      await results(page, dragMarker, 'ETIQ_ROUTER'); await sleep(800); await page.screenshot({ path: path.join(shots, `matrix-list-${tag}.png`) });
      await context.close();
    }
  }
  // PDF at 768 / 390 / 320, perspective photo at 390 / dark, and the failure states.
  for (const [width, dark] of [[768, false], [390, false], [320, true]]) {
    ({ context, page } = await open({ width, height: width < 500 ? 860 : 900, dark, touch: width < 500 }));
    await openViewer(page, marker, 'Escaneo_geometria'); await sleep(900); await page.screenshot({ path: path.join(shots, `matrix-pdf-${width}-${dark ? 'dark' : 'light'}.png`) });
    await context.close();
  }
  ({ context, page } = await open({ width: 390, height: 860, touch: true, dark: true }));
  await openViewer(page, identifier, 'FOTO_EQUIPO_1'); await page.getByRole('button', { name: 'Texto reconocido', exact: true }).click().catch(() => { }); await sleep(500);
  await page.screenshot({ path: path.join(shots, 'matrix-perspective-390-dark.png') }); await context.close();
  // legacy result without canvas: remove the canvas from one stored page, the viewer must draw nothing and explain.
  const legacyId = ids.drag;
  await psql(`UPDATE runly_content.page SET engine=engine-'canvas' WHERE job_id=(SELECT id FROM runly_content.job WHERE file_id='${legacyId}')`);
  ({ context, page } = await open({ width: 1440, height: 900 }));
  await results(page, dragMarker, 'ETIQ_ROUTER'); await page.getByText('ETIQ_ROUTER', { exact: false }).first().dblclick({ force: true }); await sleep(2500);
  check('legacy result: no overlay is drawn and the panel explains why', (await page.locator('[data-ocr-overlay]').count()) === 0 && (await page.getByText('sin coordenadas compatibles').count()) >= 1);
  await page.screenshot({ path: path.join(shots, 'state-legacy-no-coordinates-1440.png') }); await context.close();
  // no text and failed states in the file panel (open the files by name, no search term).
  ({ context, page } = await open({ width: 1440, height: 900 }));
  for (const [name, file] of [['FOTO_SIN_TEXTO', 'state-no-text-1440.png'], ['DANADA', 'state-error-1440.png']]) {
    await page.goto(`${ui}/app/m/runly.files/files?q=${name}`); await page.getByText(name, { exact: false }).first().waitFor({ timeout: 30000 });
    await page.getByText(name, { exact: false }).first().dblclick({ force: true }); await sleep(2500); await page.screenshot({ path: path.join(shots, file) });
    await page.keyboard.press('Escape'); await sleep(400);
  }
  await context.close();
} finally {
  await browser?.close(); await stopWorker(lab); await lab.restore();
  await writeFile(path.join(out, 'vertical-geometry.json'), JSON.stringify({ at: new Date().toISOString(), marker, metrics, checks }, null, 1));
}
process.exit(checks.every(c => c.ok) ? 0 : 1);
