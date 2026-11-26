// Shared helpers for Content Intelligence certification. ISOLATED LABS ONLY: every container touched must
// be named runly-content-* and every URL must be loopback. Nothing here talks to a production host.
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

export const run = promisify(execFile);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const docker = async (args, timeout = 120000) => (await run('docker', args, { maxBuffer: 16_000_000, timeout })).stdout;
const loopback = url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname);

export function labEnv(env = process.env) {
  const need = ['CI_CONTENT_API_URL', 'CI_CONTENT_KONG_URL', 'CI_CONTENT_ENV_FILE', 'CI_CONTENT_API_CONTAINER', 'CI_CONTENT_DB_CONTAINER', 'CI_CONTENT_STORAGE_CONTAINER', 'CI_CONTENT_DOCKER_NETWORK', 'CI_CONTENT_WORKER_IMAGE'];
  const missing = need.filter(k => !env[k]);
  if (missing.length) return { ok: false, reason: `missing env: ${missing.join(', ')}` };
  if (!loopback(env.CI_CONTENT_API_URL) || !loopback(env.CI_CONTENT_KONG_URL)) return { ok: false, reason: 'API/Kong URLs must be loopback' };
  for (const n of [env.CI_CONTENT_API_CONTAINER, env.CI_CONTENT_DB_CONTAINER, env.CI_CONTENT_STORAGE_CONTAINER]) if (!n.startsWith('runly-content-')) return { ok: false, reason: `container ${n} is not a dedicated runly-content-* lab container` };
  return { ok: true };
}

// Resource preflight: refuses to start when the host cannot give the lab what the profile asks for.
export async function memoryPreflight(neededGb) {
  const dockerGb = Number(await docker(['info', '--format', '{{.MemTotal}}']).catch(() => 0)) / 2 ** 30;
  const freeGb = os.freemem() / 2 ** 30;
  const ok = dockerGb >= neededGb && freeGb >= neededGb * 0.5;
  return { ok, dockerGb: +dockerGb.toFixed(1), hostFreeGb: +freeGb.toFixed(1), neededGb, reason: ok ? '' : `needs ${neededGb} GB for Docker (has ${dockerGb.toFixed(1)}) and ~${neededGb / 2} GB free on the host (has ${freeGb.toFixed(1)})` };
}

export async function connect(env = process.env) {
  const parse = t => Object.fromEntries(t.replace(/^﻿/, '').trim().split(/\r?\n/).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const settings = parse(await readFile(env.CI_CONTENT_ENV_FILE, 'utf8'));
  if (!settings.E2E_USER_EMAIL?.endsWith('.example.test')) throw Error('Lab user must be a synthetic *.example.test account');
  const api = env.CI_CONTENT_API_URL, kong = env.CI_CONTENT_KONG_URL;
  const stateFile = env.CI_CONTENT_BROWSER_STATE ?? path.resolve('.artifacts/content-intelligence/stage2-erp/browser-state.json');
  const state = JSON.parse(await readFile(stateFile));
  const local = state.origins[0].localStorage;
  const tokenRow = local.find(r => r.name === 'sb-localhost-auth-token');
  const company = local.find(r => r.name === 'runly-active-company').value;
  let session = JSON.parse(tokenRow.value);
  const refresh = async () => {
    const r = await fetch(`${kong}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: settings.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) throw Error(`token refresh ${r.status}`);
    session = await r.json(); tokenRow.value = JSON.stringify(session);
    await writeFile(stateFile, JSON.stringify(state));
  };
  const request = async (route, options = {}) => {
    const response = await fetch(`${api}${route}`, { ...options, headers: { Authorization: `Bearer ${session.access_token}`, 'X-Runly-Company-Id': company, ...options.headers }, signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(`${route} ${response.status}: ${JSON.stringify(data).slice(0, 160)}`);
    return data;
  };
  const json = (body, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await refresh();
  const scopes = ['instance', 'company'];
  const original = await Promise.all(scopes.map(async s => (await request(`/content/admin/${s}`)).data.config));
  const setPolicy = (patch = {}) => Promise.all(scopes.map((s, i) => request(`/content/admin/${s}`, json({ ...original[i], concurrency: 1, maxPending: 20, ...patch }, 'PUT'))));
  const restore = () => Promise.all(scopes.map((s, i) => request(`/content/admin/${s}`, json(original[i], 'PUT')))).catch(() => { });
  const generated = await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/tests,readonly`, '--workdir', '/tests', env.CI_CONTENT_WORKER_IMAGE, 'python3', 'generate_test_files.py'], { maxBuffer: 16_000_000 });
  const fixtures = JSON.parse(generated.stdout);
  const upload = async (count, tag) => {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const [name, mime, bytes] = fixtures[i % fixtures.length], form = new FormData();
      form.set('file', new Blob([Buffer.from(bytes, 'base64')], { type: mime }), `cert-${tag}-${Date.now()}-${i}-${name}`);
      form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'false');
      ids.push((await request('/files/upload', { method: 'POST', body: form })).data.id);
    }
    return ids;
  };
  const TERMINAL = ['done', 'empty', 'partial', 'failed', 'cancelled', 'unsupported'];
  const waitTerminal = async (ids, seconds = 180) => {
    const final = {};
    for (let t = 0; t < seconds && Object.keys(final).length < ids.length; t++) {
      for (const id of ids) if (!final[id]) { const s = (await request(`/content/files/${id}`).catch(() => ({ data: {} }))).data.state; if (TERMINAL.includes(s)) final[id] = s; }
      if (Object.keys(final).length < ids.length) await sleep(1000);
    }
    return final;
  };
  return { api, request, json, refresh, setPolicy, restore, upload, waitTerminal, TERMINAL, names: { api: env.CI_CONTENT_API_CONTAINER, db: env.CI_CONTENT_DB_CONTAINER, storage: env.CI_CONTENT_STORAGE_CONTAINER, worker: 'runly-content-cert-worker' } };
}

export async function waitHealthy(lab, timeoutS = 90) {
  // /health does not touch the database, so recovery is judged by an authenticated query that does.
  for (let i = 0; i < timeoutS; i++) { try { await lab.refresh(); await lab.request('/files?limit=1'); return i; } catch { await sleep(1000); } }
  throw Error('authenticated query never recovered');
}

export async function startWorker(lab, env = process.env, { cpus = 1, memoryMb = 1024 } = {}) {
  await docker(['rm', '-f', lab.names.worker]).catch(() => { });
  await docker(['run', '-d', '--name', lab.names.worker, '--network', env.CI_CONTENT_DOCKER_NETWORK, '--env-file', path.resolve('.artifacts/content-intelligence/stage2-erp/worker.env'), '--cpus', String(cpus), '--memory', `${memoryMb}m`, '--pids-limit', '64', '--read-only',
    '--tmpfs', '/tmp:size=268435456,mode=1777,noexec,nosuid,nodev', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', env.CI_CONTENT_WORKER_IMAGE]);
  await sleep(6000);
}
export const stopWorker = lab => docker(['rm', '-f', lab.names.worker]).catch(() => { });
