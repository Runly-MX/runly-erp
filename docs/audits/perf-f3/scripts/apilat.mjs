// API latency + payload probe against the isolated API on :4021. Never prints credentials/tokens.
const credentials = { identifier: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD };
import zlib from 'node:zlib';
const API = process.env.PERF_API ?? 'http://localhost:4021';
const COMPANY = process.env.PERF_COMPANY_ID ?? '';
const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
const token = (await r.json())?.data?.access_token;
const H = { authorization: `Bearer ${token}`, 'x-runly-company-id': COMPANY, 'accept-encoding': 'identity' };
const paths = ['/health', '/user/me', '/memberships/me', '/instance/status', '/runtime/modules', '/blueprints', '/notifications/summary', '/chat/conversations', '/home-widgets', '/help/resolve?path=%2Fhome', '/realtime/revision', '/calls/config'];
const rows = [];
for (const p of paths) {
  const times = []; let bytes = 0; let gz = 0; let etag = false; let enc = '';
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const res = await fetch(API + p, { headers: H });
    const buf = Buffer.from(await res.arrayBuffer());
    times.push(performance.now() - t);
    bytes = buf.length; gz = zlib.gzipSync(buf, { level: 6 }).length; etag = !!res.headers.get('etag'); enc = res.headers.get('content-encoding') || '';
  }
  times.sort((a, b) => a - b);
  rows.push({ path: p.slice(0, 40), firstMs: Math.round(times[0]), medianMs: Math.round(times[2]), maxMs: Math.round(times[4]), rawKB: +(bytes / 1024).toFixed(1), gzipKB: +(gz / 1024).toFixed(1), etag, enc });
}
console.table(rows);
// /blueprints composition: which modules dominate
const bp = await (await fetch(`${API}/blueprints`, { headers: H })).json();
const arr = bp.data ?? bp;
const by = {};
(Array.isArray(arr) ? arr : []).forEach((b) => { const k = b.moduleKey ?? b.module?.key ?? '?'; by[k] = (by[k] || 0) + JSON.stringify(b).length; });
console.log('blueprints items', Array.isArray(arr) ? arr.length : typeof arr, 'top modules KB', Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${(v / 1024).toFixed(0)}`).join(' '));
const rm = await (await fetch(`${API}/runtime/modules`, { headers: H })).json();
const mods = rm.data ?? [];
console.log('runtime modules', mods.length, 'top KB', mods.map((m) => [m.key, JSON.stringify(m).length]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${(v / 1024).toFixed(0)}`).join(' '));
