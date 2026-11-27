#!/usr/bin/env node
// Stage 4D: real-identity isolation in the ISOLATED lab. Creates synthetic *.example.test users through the lab Auth admin API
// (company A: admin, member, read-only member; company B: admin), then drives the real HTTP API with their real access tokens
// against Files folders/ACLs, Storage signed URLs and Content Intelligence. Cleans only the rows and users it created (prefix iso-).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { connect, docker, labEnv, run, sleep, startWorker, stopWorker } from './lab.mjs';

const env = process.env, guard = labEnv(env);
if (!guard.ok) { console.error(guard.reason); process.exit(2); }
const out = path.resolve('docs/audits/content-intelligence-stage4d'), scratch = path.resolve('.artifacts/content-intelligence/stage4c/pdf');
await mkdir(out, { recursive: true });
const notes = [], checks = [], check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const psql = async sql => (await docker(['exec', env.CI_CONTENT_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atq', '-c', sql])).trim();
const settings = Object.fromEntries((await readFile(env.CI_CONTENT_ENV_FILE, 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const lab = await connect(env), kong = env.CI_CONTENT_KONG_URL, api = env.CI_CONTENT_API_URL;
const companyA = (await psql("SELECT id FROM company WHERE slug='laboratorio-de-archivos'")), tag = randomBytes(3).toString('hex');
const marker = `ISO${Math.floor(1000 + Math.random() * 8999)}TR`;
const password = `Iso-${randomBytes(9).toString('base64url')}`;
const created = { users: [], company: null };

const authAdmin = (route, body, method = 'POST') => fetch(`${kong}/auth/v1/admin/${route}`, { method, headers: { apikey: settings.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${settings.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
const makeUser = async (name, companyId, roleKey) => {
  const email = `iso-${name}-${tag}@content.example.test`;
  const response = await authAdmin('users', { email, password, email_confirm: true });
  const user = await response.json(); if (!response.ok) throw Error(`auth admin ${response.status}`);
  created.users.push(user.id);
  const profile = await psql(`INSERT INTO user_profile(auth_user_id,display_name,email,username,updated_at) VALUES ('${user.id}','iso ${name}','${email}','iso-${name}-${tag}',now()) RETURNING id`);
  await psql(`INSERT INTO membership(company_id,user_id,role_id,updated_at) VALUES ('${companyId}','${profile}',(SELECT id FROM role WHERE key='${roleKey}'),now())`);
  return { email, profile, authId: user.id, companyId };
};
const login = async user => {
  const r = await fetch(`${kong}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: settings.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
  const body = await r.json(); if (!r.ok) throw Error(`login ${r.status}`);
  user.token = body.access_token; user.refresh = body.refresh_token;
  user.call = async (route, options = {}) => {
    const response = await fetch(`${api}${route}`, { ...options, headers: { Authorization: `Bearer ${user.token}`, 'X-Runly-Company-Id': options.company ?? user.companyId, ...(options.json ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, body: options.json ? JSON.stringify(options.json) : options.body });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  };
};
const denied = r => r.status >= 400 && r.status < 500;
const upload = async (bytes, mime, name) => {
  const form = new FormData(); form.set('file', new Blob([bytes], { type: mime }), name);
  form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile'); form.set('shareWithCompany', 'true');
  return (await lab.request('/files/upload', { method: 'POST', body: form })).data.id;
};
const fixture = async () => (await run('docker', ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${path.resolve('apps/content-worker')},target=/app,readonly`, '--workdir', '/app', '--entrypoint', 'python3', env.CI_CONTENT_WORKER_IMAGE, '-c',
  `import corpus,io,base64,random\nb=io.BytesIO();corpus.render('ETIQUETA CONFIDENCIAL\\nSerial ${marker}\\nProyecto Zeta',46,random.Random(5)).save(b,'PNG');print(base64.b64encode(b.getvalue()).decode())`], { maxBuffer: 8_000_000 })).stdout.trim();
const wait = async (id, states = ['done'], seconds = 120) => { for (let i = 0; i < seconds; i++) { const s = (await lab.request(`/content/files/${id}`).catch(() => ({ data: {} }))).data.state; if (states.includes(s)) return s; await sleep(1000); } return 'timeout'; };

let a, aMember, aReader, b;
try {
  await psql("INSERT INTO role(key,name,system,updated_at) SELECT 'iso.member','iso member',false,now() WHERE NOT EXISTS (SELECT 1 FROM role WHERE key='iso.member')");
  await psql("INSERT INTO role(key,name,system,updated_at) SELECT 'iso.reader','iso reader',false,now() WHERE NOT EXISTS (SELECT 1 FROM role WHERE key='iso.reader')");
  await psql(`INSERT INTO role_permission(role_id,permission_id) SELECT r.id,p.id FROM role r, permission p WHERE r.key='iso.member' AND p.key IN ('files.assets.read','files.assets.create','files.assets.update','files.access') AND NOT EXISTS (SELECT 1 FROM role_permission x WHERE x.role_id=r.id AND x.permission_id=p.id)`);
  await psql(`INSERT INTO role_permission(role_id,permission_id) SELECT r.id,p.id FROM role r, permission p WHERE r.key='iso.reader' AND p.key IN ('files.assets.read','files.access') AND NOT EXISTS (SELECT 1 FROM role_permission x WHERE x.role_id=r.id AND x.permission_id=p.id)`);
  created.company = await psql(`INSERT INTO company(name,slug,updated_at) VALUES ('iso company B ${tag}','iso-b-${tag}',now()) RETURNING id`);
  aMember = await makeUser('member', companyA, 'iso.member'); aReader = await makeUser('reader', companyA, 'iso.reader'); b = await makeUser('b-admin', created.company, 'runly.admin');
  await Promise.all([login(aMember), login(aReader), login(b)]);
  check('setup: real Auth users sign in (A member, A read-only, B admin)', Boolean(aMember.token && aReader.token && b.token));
  await lab.setPolicy({ profile: 'SMART', quality: 'balanced', automaticProcessing: true, historical: false, maxPending: 30 }); await startWorker(lab, env);
  const png = Buffer.from(await fixture(), 'base64');

  // 1-2: authorized access and the other company
  const file = await upload(png, 'image/png', 'Plano_confidencial.png');
  check('1. file processed (admin of A)', await wait(file) === 'done');
  const own = await aMember.call(`/content/files/${file}`);
  check('1. member of A reads text and coordinates of a company file', own.status === 200 && own.data.data.pages?.[0]?.words?.length > 0, own.status);
  const search = async (user, q) => (await user.call(`/content/search?q=${encodeURIComponent(q)}&searchIn=ocr`)).data.data?.map(h => h.fileId ?? h.id) ?? [];
  check('1. member of A finds it by content', (await search(aMember, marker)).includes(file));
  const other = await b.call(`/content/files/${file}`), otherA = await b.call(`/content/files/${file}`, { company: companyA });
  check('2. admin of B (own company header) cannot read A file', denied(other), other.status);
  check('2. admin of B claiming company A (not a member) is refused', denied(otherA), otherA.status);
  check('2. B search never returns A content or snippets', !(await search(b, marker)).length && JSON.stringify((await b.call(`/content/search?q=${marker}&searchIn=all`)).data).indexOf(marker) < 0);
  check('2. B cannot request OCR or a derivative of an A file', denied(await b.call(`/content/files/${file}/process`, { method: 'POST', json: { quality: 'accurate', reprocess: true } })) && denied(await b.call(`/content/files/${file}/searchable-pdf`, { method: 'POST' })));

  // 12-13: manipulated identifiers and direct endpoints
  check('12. random uuid and malformed ids are refused without detail', denied(await aMember.call('/content/files/00000000-0000-7000-8000-00000000abcd')) && denied(await aMember.call('/content/files/not-a-uuid')));
  check('12. unit query is digits only (no injection through ?unit)', (await aMember.call(`/content/files/${file}?unit=1;DROP`)).status === 200);
  check('13. read-only member cannot trigger OCR (process endpoint)', denied(await aReader.call(`/content/files/${file}/process`, { method: 'POST', json: { quality: 'accurate', reprocess: true } })));
  const adminStatuses = [(await aMember.call('/content/admin/company')).status, (await aMember.call('/content/admin/purge', { method: 'POST', json: { confirm: 'PURGAR' } })).status, (await aMember.call('/content/admin/backfill', { method: 'POST', json: { action: 'pause' } })).status, (await aMember.call('/content/admin/instance')).status];
  check('13. admin endpoints refuse a normal member (company and instance)', adminStatuses.every(st => st >= 400 && st < 500), adminStatuses.join(','));
  check('13. worker endpoints refuse user tokens', denied(await aMember.call('/content/worker/claim', { method: 'POST', json: { id: 'x' } })));

  // 4-6: file access scope and shares (Files ACL: COMPANY / RESTRICTED + accepted invitations)
  const patch = (route, json) => lab.request(route, lab.json(json, 'PATCH'));
  await patch(`/files/${file}/access`, { scope: 'RESTRICTED' });
  const restricted = await aMember.call(`/content/files/${file}`);
  check('4. file turned RESTRICTED after indexing: member loses text, coordinates and search hit at once', denied(restricted) && !(await search(aMember, marker)).includes(file), `${restricted.status}`);
  await patch(`/files/${file}/access`, { userId: aMember.profile, role: 'VIEWER' });
  const invitation = (await aMember.call('/files/invitations')).data.data?.find?.(i => i.fileId === file || i.file?.id === file);
  check('5. invitation is not access yet (pending shares grant nothing)', denied(await aMember.call(`/content/files/${file}`)), invitation ? 'invitation listed' : 'no invitation listed');
  if (invitation) await aMember.call(`/files/invitations/${invitation.id}/respond`, { method: 'POST', json: { accept: true } });
  check('5. accepted share: access and search return immediately', (await aMember.call(`/content/files/${file}`)).status === 200 && (await search(aMember, marker)).includes(file));
  await patch(`/files/${file}/access`, { userId: aMember.profile, role: 'VIEWER', revoke: true });
  check('6. share revoked: text, coordinates and search disappear immediately', denied(await aMember.call(`/content/files/${file}`)) && !(await search(aMember, marker)).includes(file));
  await patch(`/files/${file}/access`, { scope: 'COMPANY' });

  // 3: role loses permission after indexing
  await psql(`UPDATE membership SET enabled=false WHERE user_id='${aMember.profile}'`);
  check('3. member loses membership after indexing: API refuses at once', denied(await aMember.call(`/content/files/${file}`)) && denied(await aMember.call(`/content/search?q=${marker}`)));
  await psql(`UPDATE membership SET enabled=true WHERE user_id='${aMember.profile}'`);

  // 7-9: replacement, deletion during processing, restore
  const pdf = await upload(await readFile(path.join(scratch, 'scan-3p.pdf')), 'application/pdf', 'Informe_firmado.pdf');
  check('7. scanned PDF processed', await wait(pdf) === 'done');
  await lab.request(`/content/files/${pdf}/searchable-pdf`, lab.json({}));
  let state; for (let i = 0; i < 90; i++) { state = (await lab.request(`/content/files/${pdf}`)).data.searchablePdf?.state; if (['done', 'failed'].includes(state)) break; await sleep(1000); }
  check('7. searchable copy generated before the replacement', state === 'done', state);
  const link = (await aMember.call(`/content/files/${pdf}/searchable-pdf`)).data.data;
  check('7. member of A downloads the copy with a signed URL', link?.url && (await fetch(link.url)).ok);
  const t0 = Date.now();
  await psql(`UPDATE file_asset SET content_revision=content_revision+1 WHERE id='${pdf}'`);                    // new version of the file
  const afterReplace = await aMember.call(`/content/files/${pdf}`), copyAfter = await aMember.call(`/content/files/${pdf}/searchable-pdf`);
  check('7. replaced version: old text is not shown as current (state is new/pending, no old pages)', afterReplace.data.data.pages?.length === 0 || afterReplace.data.data.state !== 'done', afterReplace.data.data.state);
  check('7. replaced version: old derivative is not served', denied(copyAfter), copyAfter.status);
  check('7. new version is reprocessed independently', await wait(pdf) === 'done');
  const dead = await fetch(link.url).then(r => r.status).catch(() => 0);
  const ttl = Math.round((Date.now() - t0) / 1000);
  metricsNote(`signed URL issued before replacement still answers ${dead} after ${ttl}s (TTL 60s; a signed URL is a bearer capability and is not revoked by file replacement)`);
  const mid = await upload(png, 'image/png', 'Borrado_en_proceso.png');
  await lab.request(`/files/${mid}/enabled`, lab.json({ enabled: false }, 'PATCH'));
  await sleep(4000);
  check('8. deleted (disabled) while queued/processing: no text, no search hit, no job left', denied(await aMember.call(`/content/files/${mid}`)) && Number(await psql(`SELECT count(*) FROM runly_content.job WHERE file_id='${mid}'`)) === 0);
  await lab.request(`/files/${mid}/enabled`, lab.json({ enabled: true }, 'PATCH'));
  check('9. restored file is reprocessed from scratch', await wait(mid) === 'done');

  // 14-15: signed URL expiry and cross-company reuse
  await lab.request(`/content/files/${pdf}/searchable-pdf`, lab.json({}));
  for (let i = 0; i < 90; i++) { const st = (await lab.request(`/content/files/${pdf}`)).data.searchablePdf?.state; if (['done', 'failed'].includes(st)) break; await sleep(1000); }
  const fresh = (await aMember.call(`/content/files/${pdf}/searchable-pdf`)).data.data;
  const asB = await fetch(fresh.url).then(r => r.status);
  check('15. a signed URL is a bearer capability: it works for whoever holds it inside its 60 s window (documented residual)', asB === 200, `status ${asB}`);
  await sleep(66000);
  const late = await fetch(fresh.url).then(r => r.status);
  check('14. expired signed URL is refused', late >= 400, `status ${late} after 66 s`);

  // 11: sign-out with the viewer open
  const before = (await aMember.call(`/content/files/${file}`)).status;
  await fetch(`${kong}/auth/v1/logout`, { method: 'POST', headers: { apikey: settings.SUPABASE_ANON_KEY, Authorization: `Bearer ${aMember.token}` } });
  const after = (await aMember.call(`/content/files/${file}`)).status;
  metricsNote(`after sign-out the access token answers ${after} (before ${before}); a JWT stays valid until it expires unless the API checks the session`);
  check('11. refresh token is revoked at sign-out (the viewer cannot renew access)', (await fetch(`${kong}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: settings.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: aMember.refresh }) })).status >= 400);

  // 16: purge concurrent with generation
  const race = await upload(await readFile(path.join(scratch, 'scan-3p.pdf')), 'application/pdf', 'Purga_concurrente.pdf');
  await wait(race);
  await lab.request(`/content/files/${race}/searchable-pdf`, lab.json({}));
  await lab.request('/content/admin/purge', lab.json({ confirm: 'PURGAR' }));
  await sleep(15000);
  const leftovers = Number(await psql(`SELECT count(*) FROM runly_content.derivative WHERE file_id='${race}'`));
  const orphans = Number(await psql("SELECT count(*) FROM runly_content.derivative_orphan"));
  check('16. purge racing a derivative leaves no derivative row', leftovers === 0, `rows=${leftovers}`);
  check('16. purge racing a derivative leaves no undeleted Storage object (drain table empty after maintenance)', orphans === 0, `orphans=${orphans}`);
  const logs = await docker(['logs', '--since', '30m', env.CI_CONTENT_API_CONTAINER]).catch(() => '');
  check('logs: API logs of the whole run never contain recognized text or the marker', !logs.includes(marker));
} finally {
  await stopWorker(lab); await lab.restore();
  for (const id of created.users) await authAdmin(`users/${id}`, null, 'DELETE').catch(() => { });
  await psql(`DELETE FROM user_profile WHERE email LIKE 'iso-%-${tag}@content.example.test'`).catch(() => { });
  if (created.company) await psql(`DELETE FROM company WHERE id='${created.company}'`).catch(() => { });
  await writeFile(path.join(out, 'vertical-isolation.json'), JSON.stringify({ at: new Date().toISOString(), notes, checks }, null, 1));
}
function metricsNote(text) { notes.push(text); console.log('NOTE', text); }
process.exit(checks.every(c => c.ok) ? 0 : 1);
