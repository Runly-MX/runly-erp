#!/usr/bin/env node
// F1B Stage 4: cost of concurrent custom-code jobs (one throwaway container
// each) and whether every resource is released afterwards.
//   node scripts/security/bench-isolated-concurrency.mjs <dir-with-backend/noop.mjs>
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createIsolatedRuntime } from '../../apps/api/src/secure-runtime/isolated/orchestrator.js'

const dir = process.argv[2]
const docker = async (...a) => (await promisify(execFile)('docker', a)).stdout.trim()
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]) }
const rt = createIsolatedRuntime({ gatewayPort: 9, maxConcurrent: 8, maxQueue: 64 })
const out = { image: 'pinned by digest', rounds: [] }
const t0 = performance.now(); await rt.start(); out.startMs = Math.round(performance.now() - t0)
try {
  await rt.run({ extDir: dir, handler: 'backend/noop.mjs', token: 'x'.repeat(40), timeoutMs: 8000 }) // warm image layers
  for (const n of [1, 4, 8, 16]) {
    const times = [], start = performance.now()
    const results = await Promise.all(Array.from({ length: n }, async () => { const t = performance.now(); const r = await rt.run({ extDir: dir, handler: 'backend/noop.mjs', token: 'x'.repeat(40), timeoutMs: 8000 }); times.push(performance.now() - t); return r }))
    out.rounds.push({ concurrentJobs: n, ok: results.filter((r) => r.ok).length, wallMs: Math.round(performance.now() - start), perJobMs: { p50: pct(times, 0.5), p95: pct(times, 0.95), max: pct(times, 1) }, runningDuring: null })
  }
} finally {
  await rt.stop()
  out.leftoverJobContainers = Number(await docker('ps', '-aq', '--filter', 'name=runly-rt-', '--format', '{{.ID}}').then((s) => s.split('\n').filter(Boolean).length))
  out.leftoverNetworks = (await docker('network', 'ls', '--filter', 'name=runly-rt-', '--format', '{{.Name}}')).split('\n').filter(Boolean).length
  console.log(JSON.stringify(out, null, 2))
}
