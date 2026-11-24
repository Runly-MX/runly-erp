// Execution supervisor contract: signed requests only, closed job contract,
// package hash check, at-most-once across restarts, revocation kills jobs.
// Uses a fake runtime (no Docker); real containers: verify-supervisor-integration.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createSupervisor } from '../supervisor.js'
import { signSupervisorRequest } from '../../../api/src/secure-runtime/supervisor-client.js'
import { hashModuleDirectory } from '../../../api/src/lib/module-trust.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const SECRET = 's'.repeat(40)
const KEY = 'custom.ref_solicitudes'

async function setup(t, { runtime = {} } = {}) {
  const base = await fs.mkdtemp(path.join(ROOT, '.tmp-supervisor-'))
  t.after(() => fs.rm(base, { recursive: true, force: true }))
  await fs.cp(path.join(ROOT, 'apps/api/src/secure-runtime/fixtures/solicitudes'), path.join(base, 'modules', KEY), { recursive: true })
  const calls = { run: [], killed: [] }
  const fake = () => ({ start: async () => {}, stop: async () => {}, stats: () => ({}), killModule: async (k) => { calls.killed.push(k); return 1 },
    run: async (job) => { calls.run.push(job); if (runtime.hang) await new Promise(() => {}); if (runtime.busy) throw Object.assign(new Error('busy'), { code: 'RUNTIME_BUSY' }); return { ok: true, result: { total: 0 }, ms: 1 } } })
  const make = () => createSupervisor({ secret: SECRET, modulesDir: path.join(base, 'modules'), stateDir: path.join(base, 'state'), gatewayPort: 1, gatewayHost: 'gw', runtimeFactory: fake, reapOrphans: async () => { calls.reaped = (calls.reaped ?? 0) + 1; return 0 } })
  let sup = await make()
  let port = await sup.listen()
  t.after(() => sup.close())
  const hash = await hashModuleDirectory(path.join(base, 'modules', KEY))
  const job = (extra = {}) => ({ jobId: randomUUID(), moduleKey: KEY, packageHash: hash, handler: 'backend/resumen.mjs', timeoutMs: 4000, input: {}, callToken: 'x'.repeat(40), ...extra })
  const send = async (method, p, payload, { headers, secret = SECRET } = {}) => {
    const body = payload ? JSON.stringify(payload) : ''
    const res = await fetch(`http://127.0.0.1:${port}${p}`, { method, body: body || undefined, headers: { 'content-type': 'application/json', ...(headers ?? signSupervisorRequest({ secret, method, path: p, body })) } })
    return { status: res.status, body: await res.json() }
  }
  const restart = async () => { await sup.close(); sup = await make(); port = await sup.listen() }
  return { base, calls, job, send, restart, hash }
}

test('only correctly signed, fresh requests are accepted', async (t) => {
  const { send, job } = await setup(t)
  assert.equal((await send('POST', '/v1/jobs', job(), { headers: {} })).status, 401)
  assert.equal((await send('POST', '/v1/jobs', job(), { secret: 'w'.repeat(40) })).status, 401)
  const payload = job(), body = JSON.stringify(payload)
  const headers = signSupervisorRequest({ secret: SECRET, method: 'POST', path: '/v1/jobs', body })
  assert.equal((await send('POST', '/v1/jobs', payload, { headers })).status, 200)
  assert.equal((await send('POST', '/v1/jobs', payload, { headers })).status, 401, 'replayed nonce')
  assert.equal((await send('POST', '/v1/jobs', { ...payload, jobId: randomUUID() }, { headers: signSupervisorRequest({ secret: SECRET, method: 'POST', path: '/v1/jobs', body }) })).status, 401, 'body changed after signing')
  assert.equal((await send('POST', '/v1/jobs', job(), { headers: signSupervisorRequest({ secret: SECRET, method: 'POST', path: '/v1/jobs', body: JSON.stringify(job()), timestamp: Date.now() - 120_000 }) })).status, 401, 'stale timestamp')
})

test('the job contract is closed: no image, mount, network, command or profile from the caller', async (t) => {
  const { send, job, calls } = await setup(t)
  for (const extra of [{ image: 'alpine' }, { mounts: ['/:/host'] }, { network: 'host' }, { command: ['sh'] }, { profile: 'privileged' }, { handler: '../../etc/passwd' }, { moduleKey: 'runly.core' }, { timeoutMs: 60_000 }]) {
    assert.equal((await send('POST', '/v1/jobs', job(extra))).status, 422, JSON.stringify(extra))
  }
  assert.equal(calls.run.length, 0)
})

test('package hash must match the bytes the supervisor finds on disk', async (t) => {
  const { send, job, base, calls } = await setup(t)
  assert.equal((await send('POST', '/v1/jobs', job({ packageHash: 'a'.repeat(64) }))).body.error, 'PACKAGE_HASH_MISMATCH')
  await fs.appendFile(path.join(base, 'modules', KEY, 'backend', 'resumen.mjs'), '\n// tampered\n')
  assert.equal((await send('POST', '/v1/jobs', job())).body.error, 'PACKAGE_HASH_MISMATCH')
  assert.equal(calls.run.length, 0)
})

test('at most once: duplicate jobIds are refused, interrupted jobs are not re-run after restart', async (t) => {
  const s = await setup(t, { runtime: { hang: true } })
  const j = s.job()
  const pending = s.send('POST', '/v1/jobs', j).catch(() => null)
  await new Promise((r) => setTimeout(r, 200))
  await s.restart()
  await pending
  assert.equal(s.calls.reaped, 2, 'orphan containers are reaped on every start')
  const again = await s.send('POST', '/v1/jobs', j)
  assert.equal(again.status, 409); assert.equal(again.body.state, 'INTERRUPTED')
  const ledger = await fs.readFile(path.join(s.base, 'state', 'jobs.jsonl'), 'utf8')
  assert.match(ledger, /"state":"INTERRUPTED"/)
})

test('revocation kills the module jobs; saturation is refused; audit is written', async (t) => {
  const s = await setup(t, { runtime: { busy: true } })
  assert.equal((await s.send('POST', '/v1/jobs', s.job())).status, 429)
  const r = await s.send('POST', `/v1/modules/${KEY}/cancel`)
  assert.equal(r.status, 200)
  assert.equal(r.body.killed >= 0, true)
  const audit = await fs.readFile(path.join(s.base, 'state', 'audit.jsonl'), 'utf8')
  assert.match(audit, /module\.cancelled/)
  assert.ok(!/callToken|x{40}/.test(audit), 'audit never contains call tokens')
})
