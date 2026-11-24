// Isolated backend runtime orchestrator (experimental, ADR option C).
//
// Trusted host code. It is the only component that talks to Docker; module
// code never reaches it: jobs run in throwaway containers on an --internal
// network whose only peer is an egress proxy that forwards to the gateway.
// Every docker invocation uses a fixed argument list (no shell, nothing taken
// from module input except the validated handler name).
//
// Per job container: non-root (65534), all capabilities dropped,
// no-new-privileges, default seccomp, read-only root, tmpfs /tmp (noexec),
// memory/swap, CPU, PID and file-descriptor limits, module code mounted
// read-only, no environment from the host, no Docker socket, timeout + kill.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTAINER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'container')
export const RUNNER_IMAGE = 'node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a'

function docker(args, { input = null, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stdout = '', stderr = ''
    child.stdout.on('data', (d) => { if (stdout.length < 256 * 1024) stdout += d })
    child.stderr.on('data', (d) => { if (stderr.length < 64 * 1024) stderr += d })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
    child.stdin.end(input ?? undefined)
  })
}

export function createIsolatedRuntime({ image = RUNNER_IMAGE, gatewayPort, gatewayHost = 'host.docker.internal', maxConcurrent = 4, maxQueue = 16, limits = {} }) {
  const id = randomBytes(5).toString('hex')
  const network = `runly-rt-${id}`
  const proxy = `runly-rt-proxy-${id}`
  const lim = { memoryMb: 128, cpus: 0.5, pids: 64, ...limits }
  let running = 0
  const queue = []
  const mount = (src, dst) => ['--mount', `type=bind,src=${src},dst=${dst},readonly`]
  const hardening = ['--user', '65534:65534', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', String(lim.pids), '--ulimit', 'nofile=64:64']

  async function start() {
    const net = await docker(['network', 'create', '--internal', network])
    if (net.code !== 0) throw new Error(`RUNTIME_NETWORK_FAILED: ${net.stderr.trim().slice(0, 200)}`)
    const started = await docker(['run', '-d', '--name', proxy, ...hardening, '--memory', '64m', '--add-host', `${gatewayHost}:host-gateway`,
      '-e', `RUNLY_GATEWAY_TARGET=${gatewayHost}:${gatewayPort}`, ...mount(CONTAINER_DIR, '/runner'), image, 'node', '/runner/egress-proxy.mjs'])
    if (started.code !== 0) throw new Error(`RUNTIME_PROXY_FAILED: ${started.stderr.trim().slice(0, 200)}`)
    const joined = await docker(['network', 'connect', '--alias', 'gateway', network, proxy])
    if (joined.code !== 0) throw new Error(`RUNTIME_PROXY_NETWORK_FAILED: ${joined.stderr.trim().slice(0, 200)}`)
  }

  async function stop() {
    await docker(['rm', '-f', proxy])
    await docker(['network', 'rm', network])
  }

  function acquire() {
    if (running < maxConcurrent) { running++; return Promise.resolve() }
    if (queue.length >= maxQueue) return Promise.reject(Object.assign(new Error('El runtime aislado está saturado.'), { code: 'RUNTIME_BUSY' }))
    return new Promise((resolve) => queue.push(resolve))
  }
  function release() { const next = queue.shift(); if (next) next(); else running-- }

  // extDir: the module's trusted package directory (module-trust.js decides).
  async function run({ extDir, handler, token, input = {}, timeoutMs = 5000 }) {
    if (!/^backend\/[a-z0-9_-]+\.mjs$/.test(handler)) throw Object.assign(new Error('Handler inválido.'), { code: 'HANDLER_INVALID' })
    await acquire()
    const name = `runly-rt-job-${randomBytes(6).toString('hex')}`
    const startedAt = performance.now()
    let timedOut = false
    const killer = setTimeout(() => { timedOut = true; docker(['kill', name]) }, timeoutMs)
    try {
      const result = await docker(['run', '-i', '--rm', '--name', name, '--network', network, ...hardening,
        '--memory', `${lim.memoryMb}m`, '--memory-swap', `${lim.memoryMb}m`, '--cpus', String(lim.cpus),
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--workdir', '/tmp',
        ...mount(path.resolve(extDir), '/ext'), ...mount(CONTAINER_DIR, '/runner'),
        image, 'node', `--max-old-space-size=${Math.max(16, lim.memoryMb - 48)}`, '/runner/runner.mjs', `/ext/${handler}`],
      { input: JSON.stringify({ gatewayUrl: 'http://gateway:8080', token, input }), timeoutMs: timeoutMs + 15_000 })
      const ms = Math.round(performance.now() - startedAt)
      const line = (tag) => result.stdout.split('\n').reverse().find((l) => l.startsWith(tag))
      const ok = line('RUNLY_RESULT:'), err = line('RUNLY_ERROR:')
      if (timedOut) return { ok: false, error: { code: 'RUNTIME_TIMEOUT' }, ms, exitCode: result.code }
      if (ok) return { ok: true, result: JSON.parse(ok.slice('RUNLY_RESULT:'.length)), ms, exitCode: result.code }
      if (err) return { ok: false, error: JSON.parse(err.slice('RUNLY_ERROR:'.length)), ms, exitCode: result.code }
      return { ok: false, error: { code: result.code === 137 ? 'RUNTIME_KILLED' : 'RUNTIME_CRASHED' }, ms, exitCode: result.code }
    } finally { clearTimeout(killer); release() }
  }

  return { start, stop, run, network, proxy, stats: () => ({ running, queued: queue.length }) }
}
