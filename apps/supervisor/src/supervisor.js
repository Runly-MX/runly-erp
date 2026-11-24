// Execution supervisor (F1B Stage 3, experimental). The ONLY Runly process
// that talks to Docker. Threat model and recovery:
// docs/architecture/2026-11-24-execution-supervisor.md
//
// Accepts a closed, signed job contract from the API; everything that shapes
// the container (image, limits, network, mounts, command) comes from this
// file's allowlisted profiles, never from the request or the module. Module
// code is located by the supervisor itself and must match the trusted hash
// the API sent. A ledger on disk makes each jobId run at most once across
// restarts; jobs that were running when the supervisor died are recorded as
// INTERRUPTED and never re-run automatically.
import http from 'node:http'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { hashModuleDirectory } from '../../api/src/lib/module-trust.js'
import { createIsolatedRuntime, RUNNER_IMAGE } from '../../api/src/secure-runtime/isolated/orchestrator.js'

export const PROFILES = Object.freeze({
  standard: { image: RUNNER_IMAGE, memoryMb: 128, cpus: 0.5, pids: 64, maxTimeoutMs: 10_000 },
})
const SKEW_MS = 30_000
const jobSchema = z.strictObject({
  jobId: z.string().uuid(),
  moduleKey: z.string().regex(/^custom\.[a-z][a-z0-9_]{1,40}$/),
  packageHash: z.string().regex(/^[0-9a-f]{64}$/),
  handler: z.string().regex(/^backend\/[a-z0-9_-]+\.mjs$/),
  profile: z.enum(Object.keys(PROFILES)).default('standard'),
  timeoutMs: z.number().int().min(100).max(10_000),
  input: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 32_768, 'input too large'),
  callToken: z.string().min(20).max(8192),
})

export async function createSupervisor({ secret, modulesDir, stateDir, gatewayPort, gatewayHost, maxConcurrent = 4, maxQueue = 8, runtimeFactory = createIsolatedRuntime, now = () => Date.now() }) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SUPERVISOR_SECRET_REQUIRED')
  await fs.mkdir(stateDir, { recursive: true })
  const ledgerPath = path.join(stateDir, 'jobs.jsonl'), auditPath = path.join(stateDir, 'audit.jsonl')
  const jobs = new Map() // jobId -> { state, moduleKey, result? }
  const nonces = new Map()
  const append = (file, entry) => fs.appendFile(file, `${JSON.stringify({ at: new Date(now()).toISOString(), ...entry })}\n`)
  const audit = (event, details) => append(auditPath, { event, ...details })

  // Recovery: replay the ledger; anything not finished is INTERRUPTED (at most once).
  try {
    const rl = readline.createInterface({ input: createReadStream(ledgerPath) })
    for await (const line of rl) { try { const e = JSON.parse(line); jobs.set(e.jobId, { ...(jobs.get(e.jobId) ?? {}), ...e }) } catch {} }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const [jobId, job] of jobs) if (job.state === 'ACCEPTED' || job.state === 'RUNNING') {
    jobs.set(jobId, { ...job, state: 'INTERRUPTED' })
    await append(ledgerPath, { jobId, moduleKey: job.moduleKey, state: 'INTERRUPTED' })
    await audit('job.interrupted', { jobId, moduleKey: job.moduleKey })
  }

  const runtimes = new Map() // profile -> runtime
  async function runtimeFor(name) {
    if (!runtimes.has(name)) {
      const p = PROFILES[name]
      const rt = runtimeFactory({ image: p.image, gatewayPort, gatewayHost, maxConcurrent, maxQueue, limits: { memoryMb: p.memoryMb, cpus: p.cpus, pids: p.pids } })
      await rt.start()
      runtimes.set(name, rt)
    }
    return runtimes.get(name)
  }
  const cancelledModules = new Map() // moduleKey -> cancelled-at

  function verify(req, body) {
    const ts = Number(req.headers['x-runly-timestamp']), nonce = String(req.headers['x-runly-nonce'] ?? ''), sig = String(req.headers['x-runly-signature'] ?? '')
    if (!Number.isFinite(ts) || Math.abs(now() - ts) > SKEW_MS || !/^[A-Za-z0-9-]{16,64}$/.test(nonce)) return false
    const expected = createHmac('sha256', secret).update(`${req.method}\n${req.url}\n${ts}\n${nonce}\n${body}`).digest()
    const given = Buffer.from(sig, 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false
    for (const [n, exp] of nonces) if (exp < now()) nonces.delete(n)
    if (nonces.has(nonce)) return false
    nonces.set(nonce, now() + 2 * SKEW_MS)
    return true
  }

  async function runJob(raw) {
    const parsed = jobSchema.safeParse(raw)
    if (!parsed.success) return [422, { error: 'JOB_CONTRACT_INVALID' }]
    const job = parsed.data
    const seen = jobs.get(job.jobId)
    if (seen) return [409, { error: 'JOB_ALREADY_SEEN', state: seen.state }]
    const dir = path.join(modulesDir, job.moduleKey)
    let hash
    try { hash = await hashModuleDirectory(dir) } catch { hash = null }
    if (hash !== job.packageHash) { await audit('job.rejected', { jobId: job.jobId, moduleKey: job.moduleKey, reason: 'PACKAGE_HASH_MISMATCH' }); return [409, { error: 'PACKAGE_HASH_MISMATCH' }] }
    const profile = PROFILES[job.profile]
    if (job.timeoutMs > profile.maxTimeoutMs) return [422, { error: 'JOB_CONTRACT_INVALID' }]
    jobs.set(job.jobId, { jobId: job.jobId, moduleKey: job.moduleKey, state: 'ACCEPTED' })
    await append(ledgerPath, { jobId: job.jobId, moduleKey: job.moduleKey, state: 'ACCEPTED' })
    const startedAt = now()
    try {
      const rt = await runtimeFor(job.profile)
      await append(ledgerPath, { jobId: job.jobId, moduleKey: job.moduleKey, state: 'RUNNING' })
      const result = await rt.run({ extDir: dir, handler: job.handler, token: job.callToken, input: job.input, timeoutMs: job.timeoutMs, moduleKey: job.moduleKey })
      const cancelled = (cancelledModules.get(job.moduleKey) ?? 0) >= startedAt
      const final = cancelled ? { ok: false, error: { code: 'JOB_CANCELLED' } } : result
      jobs.set(job.jobId, { jobId: job.jobId, moduleKey: job.moduleKey, state: final.ok ? 'SUCCEEDED' : 'FAILED' })
      await append(ledgerPath, { jobId: job.jobId, moduleKey: job.moduleKey, state: final.ok ? 'SUCCEEDED' : 'FAILED', code: final.error?.code ?? null, ms: final.ms ?? null })
      await audit('job.finished', { jobId: job.jobId, moduleKey: job.moduleKey, ok: final.ok, code: final.error?.code ?? null })
      return [200, final]
    } catch (error) {
      const code = error?.code === 'RUNTIME_BUSY' ? 'RUNTIME_BUSY' : 'RUNTIME_FAILED'
      jobs.set(job.jobId, { jobId: job.jobId, moduleKey: job.moduleKey, state: 'FAILED' })
      await append(ledgerPath, { jobId: job.jobId, moduleKey: job.moduleKey, state: 'FAILED', code })
      return [code === 'RUNTIME_BUSY' ? 429 : 500, { ok: false, error: { code } }]
    }
  }

  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    try {
      let size = 0; const chunks = []
      for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) return reply(413, { error: 'PAYLOAD_TOO_LARGE' }); chunks.push(chunk) }
      const body = Buffer.concat(chunks).toString('utf8')
      if (!verify(req, body)) { await audit('request.denied', { path: req.url?.slice(0, 120) }); return reply(401, { error: 'UNAUTHORIZED' }) }
      if (req.method === 'POST' && req.url === '/v1/jobs') { let payload; try { payload = JSON.parse(body) } catch { return reply(400, { error: 'JSON_INVALID' }) } const [s, b] = await runJob(payload); return reply(s, b) }
      const cancel = req.method === 'POST' && req.url.match(/^\/v1\/modules\/(custom\.[a-z][a-z0-9_]{1,40})\/cancel$/)
      if (cancel) {
        cancelledModules.set(cancel[1], now())
        let killed = 0
        for (const rt of runtimes.values()) killed += await rt.killModule(cancel[1]).catch(() => 0)
        await audit('module.cancelled', { moduleKey: cancel[1], killed })
        return reply(200, { cancelled: cancel[1], killed })
      }
      if (req.method === 'GET' && req.url === '/v1/health') return reply(200, { ok: true, runtimes: Object.fromEntries([...runtimes].map(([k, rt]) => [k, rt.stats()])) })
      return reply(404, { error: 'NOT_FOUND' })
    } catch { return reply(500, { error: 'SUPERVISOR_FAILED' }) }
  })
  server.requestTimeout = 60_000

  return {
    listen: (port = 0, host = '127.0.0.1') => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    // Shutdown does not wait for running jobs: they are INTERRUPTED in the ledger on the next start.
    async close() { const closed = new Promise((r) => server.close(r)); server.closeAllConnections(); await closed; for (const rt of runtimes.values()) await rt.stop().catch(() => {}) },
    jobs,
  }
}
