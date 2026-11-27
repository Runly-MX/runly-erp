#!/usr/bin/env node
// Uses the lab UI already on 5188 (or serves STAGE_WEB_DIR there) and captures the Content Intelligence admin
// screens (desktop/mobile, light/dark, worker absent/connected) against the ISOLATED lab. Uses the lab test account.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { connect, labEnv, startWorker, stopWorker, sleep } from './lab.mjs';

const env = process.env, guard = labEnv(env);
if (!guard.ok) { console.error(guard.reason); process.exit(2); }
const root = env.STAGE_WEB_DIR && path.resolve(env.STAGE_WEB_DIR), out = path.resolve('docs/audits/content-intelligence-stage4/screenshots'), port = 5188;
await mkdir(out, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = !root ? { close() {} } : http.createServer(async (req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if (!file.startsWith(root)) throw 0; const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await readFile(path.join(root, 'index.html'))); }
}).listen(port, '127.0.0.1');
const lab = await connect(env);
const settings = Object.fromEntries((await readFile(env.CI_CONTENT_ENV_FILE, 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const browser = await chromium.launch({ headless: true });
const ui = `http://localhost:${port}`;
async function shoot(label, { width, height, dark }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', hasTouch: width < 500 });
  const page = await context.newPage();
  await page.goto(`${ui}/app/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => { }); await sleep(2500);
  await page.locator('#identifier').fill(settings.E2E_USER_EMAIL); await page.locator('#password').fill(settings.E2E_USER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(u => u.pathname.startsWith('/app/'), { timeout: 45000 });
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
  await page.getByText('Todas las aplicaciones', { exact: false }).waitFor({ timeout: 45000 });
  await page.goto(`${ui}/app/m/runly.core/settings`);
  await page.getByRole('heading', { name: /Procesamiento inteligente de archivos · Instancia/ }).waitFor({ timeout: 60000 }).catch(async e => { await page.screenshot({ path: path.join(out, 'failure.png') }); console.error(page.url(), (await page.locator('body').innerText()).slice(0, 400)); throw e; });
  await sleep(1500);
  await page.screenshot({ path: path.join(out, `${label}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await context.close(); return { label, overflow };
}
const results = [];
try {
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', historical: true, automaticProcessing: true }); await stopWorker(lab);
  await sleep(1000);
  results.push(await shoot('worker-absent-1440-light', { width: 1440, height: 1000 }));
  results.push(await shoot('worker-absent-390-dark', { width: 390, height: 900, dark: true }));
  await startWorker(lab, env);
  results.push(await shoot('worker-connected-1440-light', { width: 1440, height: 1000 }));
  results.push(await shoot('worker-connected-1440-dark', { width: 1440, height: 1000, dark: true }));
  results.push(await shoot('worker-connected-390-light', { width: 390, height: 900 }));
  results.push(await shoot('worker-connected-320-dark', { width: 320, height: 800, dark: true }));
} finally { await stopWorker(lab); await lab.restore(); await browser.close(); server.close(); }
console.log(JSON.stringify(results));
process.exit(results.some(r => r.overflow) ? 1 : 0);
