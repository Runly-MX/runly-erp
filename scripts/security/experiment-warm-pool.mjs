#!/usr/bin/env node
// F1B Stage 3, independent experiment (NOT used by the runtime): a warm
// executor per (module, company) that runs each job as a fresh process with
// `docker exec`, versus a fresh container per job. Measures latency and
// checks residual state between jobs (files, background processes), with and
// without a cleanup step. Inert jobs only; disposable containers only.
//   node scripts/security/experiment-warm-pool.mjs
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { RUNNER_IMAGE } from '../../apps/api/src/secure-runtime/isolated/orchestrator.js'

const docker = (args, input) => new Promise((done) => {
  const c = spawn('docker', args, { windowsHide: true }); let out = '', err = ''
  c.stdout.on('data', (d) => { out += d }); c.stderr.on('data', (d) => { err += d })
  c.on('close', (code) => done({ code, out: out.trim(), err: err.trim() })); c.stdin.end(input)
})
const HARDEN = ['--user', '65534:65534', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '64', '--memory', '128m', '--memory-swap', '128m', '--cpus', '0.5', '--network', 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m']
const JOB_WRITE = "require('fs').writeFileSync('/tmp/leak','secret-of-job-1'); require('child_process').spawn('sleep',['300'],{detached:true,stdio:'ignore'}).unref(); console.log('wrote')"
const JOB_READ = "const fs=require('fs'); let leak=null; try{leak=fs.readFileSync('/tmp/leak','utf8')}catch{}; const procs=fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p)).map(p=>{try{return fs.readFileSync('/proc/'+p+'/cmdline','utf8').replace(/\\0/g,' ').trim()}catch{return ''}}).filter(c=>c.startsWith('sleep 300')); console.log(JSON.stringify({leak, strayProcesses: procs.length}))"
const CLEANUP = "pkill -9 -u 65534 -f 'sleep 300' 2>/dev/null; find /tmp -mindepth 1 -delete 2>/dev/null; true"
const time = async (fn) => { const t = performance.now(); const r = await fn(); return [Math.round(performance.now() - t), r] }
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const out = {}
const cold = []
for (let i = 0; i < 5; i++) cold.push((await time(() => docker(['run', '--rm', ...HARDEN, RUNNER_IMAGE, 'node', '-e', 'console.log(1)'])))[0])
out.coldContainerPerJobMs = { median: median(cold), min: Math.min(...cold), max: Math.max(...cold) }

const name = `runly-warm-exp-${randomBytes(4).toString('hex')}`
await docker(['run', '-d', '--name', name, ...HARDEN, RUNNER_IMAGE, 'sleep', 'infinity'])
try {
  const warm = []
  for (let i = 0; i < 10; i++) warm.push((await time(() => docker(['exec', name, 'node', '-e', 'console.log(1)'])))[0])
  out.warmExecMs = { median: median(warm), min: Math.min(...warm), max: Math.max(...warm) }
  await docker(['exec', name, 'node', '-e', JOB_WRITE])
  out.residualWithoutCleanup = JSON.parse((await docker(['exec', name, 'node', '-e', JOB_READ])).out)
  await docker(['exec', name, 'node', '-e', JOB_WRITE])
  const [cleanupMs] = await time(() => docker(['exec', name, 'sh', '-c', CLEANUP]))
  out.cleanupMs = cleanupMs
  out.residualAfterCleanup = JSON.parse((await docker(['exec', name, 'node', '-e', JOB_READ])).out)
} finally { await docker(['rm', '-f', name]) }
out.verdict = out.residualWithoutCleanup.leak || out.residualWithoutCleanup.strayProcesses
  ? 'A warm executor leaks state between jobs unless cleaned; even with cleanup, isolation depends on the cleanup being complete (kernel keyrings, shm, timing of detached processes): keep one container per job for untrusted code.'
  : 'No residual state observed.'
console.log(JSON.stringify(out, null, 2))
