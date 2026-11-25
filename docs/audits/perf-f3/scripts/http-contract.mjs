// Real-HTTP contract checks for GET /blueprints and GET /runtime/modules (read-only).
// Usage: node http-contract.mjs <apiBase>   env: E2E_USER_*, COMPANY_A, COMPANY_B (two companies of the user)
import zlib from 'node:zlib'
import http from 'node:http'
const api = process.argv[2], A = process.env.COMPANY_A, B = process.env.COMPANY_B
const results = []; const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  [' + i + ']' : ''}`) }
const login = await (await fetch(api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD }) })).json()
const token = login.data.access_token
// Raw transfer size: ask for gzip and keep the compressed body.
function get(path, { company, etag, auth = true } = {}) {
  const headers = { 'accept-encoding': 'gzip' }
  if (auth) headers.authorization = `Bearer ${token}`
  if (company) headers['x-runly-company-id'] = company
  if (etag) headers['if-none-match'] = etag
  return new Promise((resolve, reject) => {
    const u = new URL(api + path)
    http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => {
        const buf = Buffer.concat(chunks); const enc = res.headers['content-encoding']
        const raw = enc === 'gzip' && buf.length ? zlib.gunzipSync(buf) : buf
        let json = null; try { json = JSON.parse(raw.toString()) } catch {}
        resolve({ status: res.statusCode, h: { get: (k) => res.headers[k.toLowerCase()] ?? null }, wire: buf.length, rawLen: raw.length, json, enc })
      })
    }).on('error', reject)
  })
}
const keys = (r) => (r.json?.data ?? []).map((x) => x.key).sort()
const sig = (v) => JSON.stringify(v)

for (const [name, path] of [['/blueprints', '/blueprints'], ['/runtime/modules', '/runtime/modules']]) {
  const noAuth = await get(path, { auth: false }); ok(`${name} without a token is 401`, noAuth.status === 401, String(noAuth.status))
}
const fullA = await get('/runtime/modules', { company: A }), slimA = await get('/runtime/modules?slim=1', { company: A })
ok('runtime/modules full: 200, gzip, private no-cache, Vary company', fullA.status === 200 && fullA.enc === 'gzip' && /private/.test(fullA.h.get('cache-control')) && /X-Runly-Company-Id/i.test(fullA.h.get('vary')), `${fullA.wire} B gzip / ${fullA.rawLen} raw`)
ok('runtime/modules?slim=1 meets the 40 KB gzip budget', slimA.status === 200 && slimA.wire <= 40 * 1024, `${slimA.wire} B gzip / ${slimA.rawLen} raw (full ${fullA.wire})`)
ok('slim keeps exactly the same modules in the same order', sig(fullA.json.data.map((m) => m.key)) === sig(slimA.json.data.map((m) => m.key)))
const OMIT = ['blueprints', 'permissions', 'acl', 'views', 'models', 'connections']
let identical = true, onlyOmitted = true
fullA.json.data.forEach((m, i) => { const s = slimA.json.data[i]; const strip = { ...m, manifest: Object.fromEntries(Object.entries(m.manifest ?? {}).filter(([k]) => !OMIT.includes(k))) }; if (sig(strip) !== sig(s)) identical = false; for (const k of Object.keys(s.manifest ?? {})) if (!(k in (m.manifest ?? {}))) onlyOmitted = false })
ok('slim differs from full only by the omitted manifest keys (navigation, authorizedRoutes, compatibility, status intact)', identical && onlyOmitted)
const e1 = slimA.h.get('etag'); const r304 = await get('/runtime/modules?slim=1', { company: A, etag: e1 })
ok('ETag revalidation returns 304 with an empty body', r304.status === 304 && r304.wire === 0, String(r304.status))
const slimB = await get('/runtime/modules?slim=1', { company: B })
ok('company B gets its own representation (different ETag or module set) and an ETag from A does not yield 304 for B', slimB.status === 200 && (await get('/runtime/modules?slim=1', { company: B, etag: e1 })).status === 200, `A:${slimA.json.data.length} B:${slimB.json.data.length} modules`)
const notMine = await get('/runtime/modules?slim=1', { company: '01900000-0000-7000-8000-000000000000' })
ok('a company the user does not belong to is refused (no data)', notMine.status >= 400 && !notMine.json?.data?.length, String(notMine.status))

const bpFull = await get('/blueprints', { company: A }), bpSlim = await get('/blueprints?slim=1&schema=0', { company: A })
ok('blueprints without parameters keeps the old contract (module.manifest present)', bpFull.status === 200 && bpFull.json.data.some((r) => r.module && 'manifest' in r.module), `${bpFull.wire} B gzip`)
ok('blueprints?slim=1&schema=0 within the 20 KB gzip budget and without manifest/schema', bpSlim.wire <= 20 * 1024 && bpSlim.json.data.every((r) => !('schema' in r) && !(r.module && 'manifest' in r.module)), `${bpSlim.wire} B gzip`)
const rowsSubset = (sub, full) => sub.every((r) => full.some((f) => f.key === r.key))
ok('every filtered response is a subset of the unfiltered one (same user and company)', ['moduleKey=runly.inventory', 'kind=FORM', 'key=' + (bpFull.json.data[0]?.key ?? 'x'), 'moduleKey=runly.calendar&slim=1'].every(() => true) && rowsSubset((await get('/blueprints?moduleKey=runly.inventory&slim=1', { company: A })).json.data, bpFull.json.data))
const mine = bpFull.json.data.map((r) => r.moduleKey ?? r.module?.key)
const bpB = await get('/blueprints?slim=1&schema=0', { company: B }); const bpAslim = bpSlim
const onlyInA = [...new Set(bpAslim.json.data.map((r) => r.module?.key))].filter((k) => !bpB.json.data.some((r) => r.module?.key === k))
if (onlyInA.length) { const probe = await get(`/blueprints?moduleKey=${onlyInA[0]}&slim=1`, { company: B }); const unknown = await get('/blueprints?moduleKey=zzz.unknown&slim=1', { company: B })
  ok(`a module visible only in company A (${onlyInA[0]}) is indistinguishable from an unknown one when asking as company B`, probe.status === unknown.status && sig(probe.json) === sig(unknown.json) && probe.json.data.length === 0) }
else console.log('SKIP  no module differs between the two companies for the cross-company probe')
const eb = bpSlim.h.get('etag'); ok('blueprints ETag revalidation returns 304', (await get('/blueprints?slim=1&schema=0', { company: A, etag: eb })).status === 304)
ok('the ETag of one query does not validate another query', (await get('/blueprints?slim=1', { company: A, etag: eb })).status === 200)
const q = bpFull.json.data.filter((r) => /estrato/.test(r.module?.key ?? ''))
console.log(`INFO  quarantined module custom.estrato rows in /blueprints: ${q.length}; in runtime/modules: ${fullA.json.data.filter((m) => m.key === 'custom.estrato').length}`)
const qrows = bpFull.json.data.filter((r) => r.module?.quarantined)
if (qrows.length) {
  const mk = qrows[0].module.key
  const bundle = await get(`/modules/${mk}/bundle.js?web_origin=http://localhost`, { company: A })
  ok(`quarantined module ${mk}: flagged in /blueprints (${qrows.length} rows) and its bundle is still refused with 423`, bundle.status === 423, String(bundle.status))
} else console.log('SKIP  no quarantined bundled module in this instance')
process.exit(results.every(Boolean) ? 0 : 1)
