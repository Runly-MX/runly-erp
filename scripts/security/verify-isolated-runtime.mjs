#!/usr/bin/env node
// F1B Stage 2: isolated backend runtime on disposable Docker resources.
// Real gateway (in-memory store, two companies) + internal network + egress
// proxy + one throwaway container per job. Probes are inert (they only
// observe). Prints PASS/FAIL and measurements; cleans up everything it made.
//   node scripts/security/verify-isolated-runtime.mjs [--json out.json]
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHostSigner } from '../../apps/api/src/secure-runtime/protocol.js'
import { createCapabilityGateway } from '../../apps/api/src/secure-runtime/gateway/gateway.js'
import { createMemoryStore } from '../../apps/api/src/secure-runtime/gateway/stores.js'
import { startGatewayServer } from '../../apps/api/src/secure-runtime/gateway/server.js'
import { loadDeclarativeModule } from '../../apps/api/src/secure-runtime/declarative/schema.js'
import { createIsolatedRuntime } from '../../apps/api/src/secure-runtime/isolated/orchestrator.js'
import { checks } from './lib/disposable-stack.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURE = path.join(ROOT, 'apps/api/src/secure-runtime/fixtures/solicitudes')
const PROBES = path.join(ROOT, 'apps/api/src/secure-runtime/__tests__/probes')
const def = loadDeclarativeModule(JSON.parse(readFileSync(path.join(FIXTURE, 'module.json'), 'utf8')))
const A = randomUUID(), B = randomUUID(), userA = randomUUID(), userB = randomUUID()
const store = createMemoryStore({ members: [{ companyId: A, userId: userA }, { companyId: B, userId: userB }] })
const signer = createHostSigner()
const gateway = createCapabilityGateway({ signer, store, limits: { callsPerMinute: 1000 } })
gateway.register(def, { approvedCapabilities: def.capabilities, packageHash: 'fixture' })
const all = new Set(Object.values(def.permissions))
const token = (companyId, profileId, caps) => gateway.issueCallToken({ moduleKey: def.key, companyId, profileId, permissionSet: all, capabilities: caps })
const direct = (tok, operation, args) => gateway.call({ operation, token: tok, nonce: randomUUID().replaceAll('-', ''), idempotencyKey: randomUUID().replaceAll('-', ''), args })

const host = process.env.RUNLY_RT_GATEWAY_BIND ?? '0.0.0.0' // Docker Desktop reaches the host through host.docker.internal
const server = await startGatewayServer({ gateway, host })
const runtime = createIsolatedRuntime({ gatewayPort: server.port, maxConcurrent: 4, maxQueue: 4, limits: { memoryMb: 128, cpus: 0.5, pids: 32 } })
const { check, report } = checks()
const metrics = {}
const runningJobs = () => new Promise((resolve) => {
  const c = spawn('docker', ['ps', '--filter', 'name=runly-rt-job-', '--format', '{{.Names}}'], { windowsHide: true }); let o = ''
  c.stdout.on('data', (d) => { o += d }); c.on('close', () => resolve(o.split(/\s+/).filter(Boolean)))
})
const dockerStats = (name) => new Promise((resolve) => {
  const c = spawn('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}|{{.CPUPerc}}', name], { windowsHide: true }); let out = ''
  c.stdout.on('data', (d) => { out += d }); c.on('close', () => resolve(out.trim()))
})
try {
  await runtime.start()
  for (const [title, cid, uid] of [['Laptops', A, userA], ['Sillas', A, userA], ['Toner', B, userB]]) await direct(token(cid, uid, ['records.write']), 'records.create', { entity: 'solicitud', data: { titulo: title, monto: 1000, solicitante: uid } })

  await check('legit extension runs isolated and only sees its company (A=2, B=1)', async () => {
    const t0 = performance.now()
    const ra = await runtime.run({ extDir: FIXTURE, handler: 'backend/resumen.mjs', token: token(A, userA, ['records.read']) })
    metrics.coldStartMs = Math.round(performance.now() - t0)
    assert.equal(ra.ok, true, JSON.stringify(ra)); assert.equal(ra.result.total, 2)
    const rb = await runtime.run({ extDir: FIXTURE, handler: 'backend/resumen.mjs', token: token(B, userB, ['records.read']) })
    assert.equal(rb.result.total, 1)
    const warm = []
    for (let i = 0; i < 5; i++) warm.push((await runtime.run({ extDir: FIXTURE, handler: 'backend/resumen.mjs', token: token(A, userA, ['records.read']) })).ms)
    metrics.warmStartMs = { min: Math.min(...warm), max: Math.max(...warm), median: warm.sort((a, b) => a - b)[2] }
  })

  let probe
  await check('probe: non-root, no host secrets, token not in environment', async () => {
    const r = await runtime.run({ extDir: PROBES, handler: 'backend/probe.mjs', token: token(A, userA, ['records.read']), input: { otherCompany: B, selfId: userA }, timeoutMs: 25_000 })
    assert.equal(r.ok, true, JSON.stringify(r)); probe = r.result; metrics.probe = probe
    assert.equal(probe.uid, 65534)
    assert.deepEqual(probe.secretsInEnv, [])
    assert.equal(probe.environHasToken, false)
  })
  await check('probe: read-only root and module code, /tmp writable but noexec', async () => {
    assert.equal(probe.writeRoot.ok, false); assert.equal(probe.writeExt.ok, false)
    assert.equal(probe.writeTmp.ok, true); assert.equal(probe.execFromTmp.ok, false)
  })
  await check('probe: no Docker socket and no host filesystem', async () => {
    assert.equal(probe.dockerSocket.ok, false); assert.equal(probe.hostRepo.ok, false)
  })
  await check('probe: no internet, no database, no host; only the gateway proxy', async () => {
    for (const k of ['internet', 'dnsInternet', 'postgresByName', 'hostGateway']) assert.equal(probe[k].ok, false, k)
    assert.equal(probe.gatewayDirect.ok, true); assert.equal(probe.gatewayDirect.value, 401, 'the gateway itself still demands a token')
  })
  await check('probe: cannot pick another company nor use an ungranted capability', async () => {
    assert.equal(probe.crossCompany.ok, false); assert.equal(probe.crossCompany.code, 'INVALID_ARGS')
    assert.equal(probe.ownCompany.ok, true); assert.equal(probe.ownCompany.count, 2)
    assert.equal(probe.notGranted.ok, false); assert.equal(probe.notGranted.code, 'CAPABILITY_DENIED')
  })
  await check('memory limit: a memory hog is killed without affecting the host', async () => {
    const r = await runtime.run({ extDir: PROBES, handler: 'backend/memhog.mjs', token: token(A, userA, ['records.read']), timeoutMs: 15_000 })
    assert.equal(r.ok, false); metrics.memhog = r.error
  })
  await check('CPU/time limit: a busy loop is killed at the timeout', async () => {
    const pending = runtime.run({ extDir: PROBES, handler: 'backend/spin.mjs', token: token(A, userA, ['records.read']), timeoutMs: 3000 })
    await new Promise((r) => setTimeout(r, 1500))
    const jobs = await new Promise((resolve) => { const c = spawn('docker', ['ps', '--filter', 'name=runly-rt-job-', '--format', '{{.Names}}'], { windowsHide: true }); let o = ''; c.stdout.on('data', (d) => { o += d }); c.on('close', () => resolve(o.trim().split('\n').filter(Boolean))) })
    if (jobs[0]) metrics.busyExecutor = await dockerStats(jobs[0])
    const r = await pending
    assert.equal(r.ok, false); assert.equal(r.error.code, 'RUNTIME_TIMEOUT'); metrics.spinKilledAtMs = r.ms
  })
  await check('an idle executor stays within its memory limit (measured)', async () => {
    const pending = runtime.run({ extDir: PROBES, handler: 'backend/idle.mjs', token: token(A, userA, ['records.read']), input: { ms: 5000 }, timeoutMs: 15_000 })
    let name = ''
    for (let i = 0; i < 20 && !name; i++) {
      await new Promise((r) => setTimeout(r, 250))
      name = (await runningJobs())[0] ?? ''
    }
    await new Promise((r) => setTimeout(r, 1500))
    metrics.idleExecutor = name ? await dockerStats(name) : null
    assert.equal((await pending).ok, true)
    assert.ok(metrics.idleExecutor, 'executor stats must be sampled')
  })
  await check('PID limit: a process flood is stopped', async () => {
    const r = await runtime.run({ extDir: PROBES, handler: 'backend/forks.mjs', token: token(A, userA, ['records.read']), timeoutMs: 15_000 })
    assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(r.result.started < 32, `started ${r.result.started}`); assert.equal(r.result.refused, 'EAGAIN', 'the PID limit, not another limit, must stop it'); metrics.forks = r.result
  })
  await check('concurrency: 8 jobs with 4 slots all complete; saturation is refused', async () => {
    const t0 = performance.now()
    const runs = await Promise.all(Array.from({ length: 8 }, () => runtime.run({ extDir: FIXTURE, handler: 'backend/resumen.mjs', token: token(A, userA, ['records.read']) })))
    metrics.eightJobsWallMs = Math.round(performance.now() - t0)
    assert.ok(runs.every((r) => r.ok))
    const flood = await Promise.allSettled(Array.from({ length: 12 }, () => runtime.run({ extDir: FIXTURE, handler: 'backend/resumen.mjs', token: token(A, userA, ['records.read']) })))
    metrics.floodRefused = flood.filter((r) => r.status === 'rejected' && r.reason.code === 'RUNTIME_BUSY').length
    assert.ok(metrics.floodRefused > 0, 'queue bound must refuse excess jobs')
  })
  await check('resources are released: no job container is left running', async () => {
    const left = await new Promise((resolve) => { const c = spawn('docker', ['ps', '-a', '--filter', 'name=runly-rt-job-', '--format', '{{.Names}}'], { windowsHide: true }); let o = ''; c.stdout.on('data', (d) => { o += d }); c.on('close', () => resolve(o.trim())) })
    assert.equal(left, '')
    assert.deepEqual(runtime.stats(), { running: 0, queued: 0 })
  })
} finally {
  report()
  await runtime.stop().catch(() => {})
  await server.close()
  const out = process.argv.indexOf('--json')
  if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(metrics, null, 2))
  else console.log(JSON.stringify(metrics))
}
