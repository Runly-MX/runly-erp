// Test-only Node preload (NODE_OPTIONS=--require). It keeps update-installer.mjs and
// setup-*.mjs hermetic: the Installer download comes from $RUNLY_TEST_ORIGIN, image pulls
// and pruning are no-ops (images are already local), every other outbound fetch is refused
// and recorded, and optional faults are injected where an update can be interrupted.
const fs = require('node:fs'), path = require('node:path'), childProcess = require('node:child_process')
const origin = process.env.RUNLY_TEST_ORIGIN
const log = line => origin && fs.appendFileSync(path.join(origin, 'requests.log'), line + '\n')
const failMode = file => {
  try { return fs.readFileSync(path.join(origin, 'fail'), 'utf8').split('\n').map(l => l.split(' ')).find(([f]) => f === file)?.[1] } catch { return undefined }
}
if (origin && typeof fetch === 'function') {
  const realFetch = fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input)
    const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/Runly-MX\/runly-erp\/([a-f0-9]{40}|main)\/infra\/installer\/(.+)$/)
    log(url)
    if (match) {
      const [, requestedRef, file] = match, mode = failMode(file)
      const ref = requestedRef === 'main' ? fs.readFileSync(path.join(origin, 'main-ref'), 'utf8').trim() : requestedRef
      if (mode === 'network') throw new TypeError('simulated network failure')
      const target = path.join(origin, ref, file)
      if (!fs.existsSync(target)) return new Response('not found', { status: 404 })
      return new Response(mode === 'corrupt' ? Buffer.from('corrupted-in-transit') : fs.readFileSync(target), { status: 200 })
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)[:/]/.test(url)) return realFetch(input, init)
    log(`UNEXPECTED ${url}`)
    return new Response('blocked by the update test origin', { status: 404 })
  }
}
const realSpawnSync = childProcess.spawnSync
childProcess.spawnSync = function patchedSpawnSync(command, args, options) {
  if (command === 'docker' && Array.isArray(args)) {
    if (args[0] === 'pull') { log(`NOOP docker ${args.join(' ')}`); return { status: 0, signal: null, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), pid: 0 } }
    if (args.includes('compose') && args.includes('pull')) { log('NOOP docker compose pull'); return { status: 0, signal: null, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), pid: 0 } }
    if (args[0] === 'image' && args[1] === 'prune') { log('NOOP docker image prune'); return { status: 0, signal: null, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), pid: 0 } }
    // Interrupt the container recreation exactly once, after migrations have run.
    const flag = origin && path.join(origin, 'fail-compose-up-once')
    if (flag && args.includes('compose') && args.includes('up') && fs.existsSync(flag)) {
      fs.unlinkSync(flag); log('FAULT docker compose up interrupted')
      return { status: 1, signal: null, output: [], stdout: Buffer.alloc(0), stderr: Buffer.from('simulated interruption'), pid: 0 }
    }
  }
  return realSpawnSync.apply(this, arguments)
}
