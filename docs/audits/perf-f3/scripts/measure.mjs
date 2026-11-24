// F3.0 lab harness. Usage: node measure.mjs <profile> <scenario> [rounds]
// profiles: desktop|high|mid|low (CPU/network throttling = lab approximation, NOT physical devices)
// scenarios: cold (cold cache + login) | session (existing session, then warm reload) | nav (repeated SPA navigation + memory)
import { chromium } from 'playwright';
const credentials = { identifier: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD };
import fs from 'node:fs';

const [, , profile = 'desktop', scenario = 'cold', rounds = '2'] = process.argv;
const BASE = process.env.PERF_BASE ?? 'http://localhost:4173';
const COMPANY = process.env.PERF_COMPANY_ID ?? '';
const P = { desktop: { cpu: 1, net: null }, high: { cpu: 2, net: { d: 10e6, l: 40 } }, mid: { cpu: 4, net: { d: 1.6e6, l: 150 } }, low: { cpu: 6, net: { d: 0.7e6, l: 300 } } }[profile];
const MOBILE = profile !== 'desktop';
const OUT = process.env.PERF_OUT ?? '.';
const STATE = process.env.PERF_STATE ?? 'state.json';
const out = { profile, scenario, base: BASE, cpu: P.cpu, net: P.net };

async function setup(browser, storageState) {
  const ctx = await browser.newContext({ storageState, viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: MOBILE ? 2 : 1, isMobile: MOBILE, hasTouch: MOBILE, locale: 'es-MX' });
  await ctx.addInitScript((id) => {
    try { localStorage.setItem('runly-active-company', id); } catch {}
    window.__perf = { lt: [], lcp: 0, cls: 0, fcp: 0, inp: 0 };
    const obs = (type, fn, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch {} };
    obs('longtask', (e) => window.__perf.lt.push([e.startTime | 0, e.duration | 0]));
    obs('largest-contentful-paint', (e) => { window.__perf.lcp = e.startTime; });
    obs('layout-shift', (e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; });
    obs('paint', (e) => { if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; });
    obs('event', (e) => { if (e.duration > window.__perf.inp) window.__perf.inp = e.duration; }, { durationThreshold: 16 });
  }, COMPANY);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
  if (P.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: P.net.l, downloadThroughput: P.net.d / 8, uploadThroughput: P.net.d / 16 });
  const reqs = new Map();
  const log = []; log.inflight = new Set();
  cdp.on('Network.requestWillBeSent', (e) => { if (!/WebSocket|EventSource|Ping/.test(e.type || '')) log.inflight.add(e.requestId); reqs.set(e.requestId, { url: e.request.url, t: e.timestamp, type: e.type, method: e.request.method }); });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.enc = e.response.headers['content-encoding'] || ''; } });
  cdp.on('Network.loadingFailed', (e) => { log.inflight.delete(e.requestId); });
  cdp.on('Network.loadingFinished', (e) => { log.inflight.delete(e.requestId); const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.end = e.timestamp; log.push(r); } });
  return { ctx, page, cdp, log };
}

const heap = async (cdp) => {
  await cdp.send('HeapProfiler.collectGarbage');
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), listeners: m.JSEventListeners, nodes: m.Nodes, docs: m.Documents, scriptSec: +m.ScriptDuration.toFixed(2), taskSec: +m.TaskDuration.toFixed(2), layouts: m.LayoutCount, recalcs: m.RecalcStyleCount };
};

function summarize(log, since = 0) {
  const L = log.filter((r) => r.t >= since);
  const sum = (a) => a.reduce((s, r) => s + (r.bytes || 0), 0);
  const js = L.filter((r) => r.type === 'Script');
  const css = L.filter((r) => r.type === 'Stylesheet');
  const api = L.filter((r) => r.type === 'XHR' || r.type === 'Fetch');
  const font = L.filter((r) => r.type === 'Font' || /fonts\.(g|google)/.test(r.url));
  const dup = {};
  api.forEach((r) => { const k = r.method + ' ' + r.url.replace(BASE, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').slice(0, 90); dup[k] = (dup[k] || 0) + 1; });
  return {
    requests: L.length, jsFiles: js.length, jsKB: +(sum(js) / 1024).toFixed(0), cssKB: +(sum(css) / 1024).toFixed(0), fontKB: +(sum(font) / 1024).toFixed(0), totalKB: +(sum(L) / 1024).toFixed(0),
    apiCalls: api.length, apiKB: +(sum(api) / 1024).toFixed(0),
    topApi: Object.entries(dup).sort((a, b) => b[1] - a[1]).slice(0, 10),
    slowApi: api.map((r) => ({ u: r.url.replace(BASE, '').slice(0, 80), ms: Math.round((r.end - r.t) * 1000), kb: +((r.bytes || 0) / 1024).toFixed(1) })).sort((a, b) => b.ms - a.ms).slice(0, 8),
    bigApi: api.map((r) => ({ u: r.url.replace(BASE, '').slice(0, 80), kb: +((r.bytes || 0) / 1024).toFixed(1) })).sort((a, b) => b.kb - a.kb).slice(0, 5),
    api: api.map((r) => r.method + ' ' + r.url.replace(BASE, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').slice(0, 70)),
  };
}

async function quiesce(page, log, ms = 1500, max = 60000) {
  const t0 = Date.now(); let last = log.length; let lastAt = Date.now();
  while (Date.now() - t0 < max) {
    await page.waitForTimeout(150);
    if (log.length !== last || log.inflight.size > 0) { last = log.length; lastAt = Date.now(); } else if (Date.now() - lastAt >= ms) return Date.now() - t0 - ms;
  }
  return max;
}
const perf = (page) => page.evaluate(() => {
  const p = window.__perf; const nav = performance.getEntriesByType('navigation')[0];
  return { fcp: Math.round(p.fcp), lcp: Math.round(p.lcp), cls: +p.cls.toFixed(3), inp: Math.round(p.inp), tbt: p.lt.reduce((s, [, d]) => s + Math.max(0, d - 50), 0), longTasks: p.lt.length, maxLongTask: Math.max(0, ...p.lt.map((x) => x[1])), ttfb: nav ? Math.round(nav.responseStart) : null, dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null };
});
async function login(page) {
  await page.locator('#identifier').fill(credentials.identifier);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 60000 }).catch(() => {});
}

const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
try {
  if (scenario === 'cold') {
    const s = await setup(browser);
    const t0 = Date.now();
    await s.page.goto(`${BASE}/app/`, { waitUntil: 'load', timeout: 120000 });
    await s.page.locator('#identifier').waitFor({ timeout: 120000 });
    out.loginVisibleMs = Date.now() - t0;
    await quiesce(s.page, s.log);
    out.preLogin = { ...summarize(s.log), ...(await perf(s.page)) };
    out.preLoginHeap = await heap(s.cdp);
    const mark = Math.max(...s.log.map((r) => r.end)); const t1 = Date.now();
    await login(s.page);
    out.loginToUrlMs = Date.now() - t1;
    out.loginToQuietMs = Date.now() - t1 + (await quiesce(s.page, s.log, 2000, 120000));
    out.postLogin = summarize(s.log, mark - 0.001);
    out.postLoginPerf = await perf(s.page);
    out.postLoginHeap = await heap(s.cdp);
    await s.ctx.storageState({ path: STATE });
  } else if (scenario === 'session') {
    const s = await setup(browser, STATE);
    const t0 = Date.now();
    await s.page.goto(`${BASE}/app/`, { waitUntil: 'load', timeout: 120000 });
    await quiesce(s.page, s.log, 2000, 120000);
    out.sessionQuietMs = Date.now() - t0 - 2000;
    out.summary = summarize(s.log); out.perf = await perf(s.page); out.heap = await heap(s.cdp);
    s.log.length = 0;
    const t1 = Date.now();
    await s.page.reload({ waitUntil: 'load' });
    await quiesce(s.page, s.log, 2000, 120000);
    out.warmReloadMs = Date.now() - t1 - 2000; out.warm = summarize(s.log);
    // Normal navigation with a hot HTTP cache (reload() revalidates every subresource, so it hides immutable caching).
    s.log.length = 0; const t2 = Date.now();
    await s.page.goto(`${BASE}/app/`, { waitUntil: "load" });
    await quiesce(s.page, s.log, 2000, 120000);
    out.hotNavMs = Date.now() - t2 - 2000; out.hot = summarize(s.log);
  } else if (scenario === 'idle') {
    const s = await setup(browser, STATE);
    await s.page.goto(`${BASE}/app/`, { waitUntil: 'load', timeout: 120000 });
    await quiesce(s.page, s.log, 3000, 120000);
    const h0 = await heap(s.cdp); s.log.length = 0; const t0 = Date.now();
    await s.page.waitForTimeout(Number(rounds) * 1000);
    const h1 = await heap(s.cdp); const sec = (Date.now() - t0) / 1000;
    const sm = summarize(s.log);
    out.idle = { seconds: sec, requests: sm.requests, perMin: +(sm.requests * 60 / sec).toFixed(1), kb: sm.totalKB, api: sm.api, scriptSecDelta: +(h1.scriptSec - h0.scriptSec).toFixed(2), taskSecDelta: +(h1.taskSec - h0.taskSec).toFixed(2), layouts: h1.layouts - h0.layouts, recalcs: h1.recalcs - h0.recalcs, heapDelta: +(h1.heapMB - h0.heapMB).toFixed(1), listenersDelta: h1.listeners - h0.listeners };
  } else if (scenario === 'nav') {
    const s = await setup(browser, STATE);
    await s.page.goto(`${BASE}/app/`, { waitUntil: 'load', timeout: 120000 });
    await quiesce(s.page, s.log, 2000, 120000);
    const routes = { home: '/app/', inventario: '/app/m/runly.inventory/inventory', compras: '/app/m/runly.purchases', chat: '/app/m/runly.chat', calendario: '/app/m/runly.calendar', studio: '/app/m/runly.studio', website: '/app/m/runly.website', builder: '/app/m/runly.core/module-builder' };
    out.rounds = []; out.baseline = await heap(s.cdp);
    for (let r = 0; r < Number(rounds); r++) {
      const round = { r: r + 1, modules: {} };
      for (const [name, path] of Object.entries(routes)) {
        const mark = s.log.length ? Math.max(...s.log.map((x) => x.end)) : 0;
        const t0 = Date.now(); const lt0 = await s.page.evaluate(() => window.__perf.lt.length);
        await s.page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
        const q = await quiesce(s.page, s.log, 1500, 90000);
        const lt = await s.page.evaluate((n) => window.__perf.lt.slice(n), lt0);
        const sm = summarize(s.log, mark); delete sm.api; delete sm.topApi; delete sm.slowApi; delete sm.bigApi;
        round.modules[name] = { navMs: q, longTasks: lt.length, longMs: lt.reduce((a, [, d]) => a + d, 0), ...sm, heap: await heap(s.cdp) };
        if (r === 0) await s.page.screenshot({ path: `${process.env.PERF_SHOTS ?? '.'}/${name}-${profile}.png` }).catch(() => {});
      }
      out.rounds.push(round);
    }
    out.final = await heap(s.cdp);
  }
} finally { await browser.close(); }
fs.writeFileSync(`${OUT}/res-${profile}-${scenario}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out).slice(0, 1800));
