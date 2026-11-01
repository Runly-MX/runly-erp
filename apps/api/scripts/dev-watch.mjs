// Dev runner for the API. Replaces `node --watch-path`, which on Windows
// restarts on any directory notification (access-time, attribute or
// antivirus/indexer touches) and clears the terminal each time. This one
// restarts only when a source file's mtime or size actually changes.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const roots = ['src', '../../packages/core', '../../packages/module-engine', '../../packages/module-compiler', '../../packages/validators']
  .map((p) => path.resolve(apiDir, p))
const ignored = /[\\/](node_modules|\.git|__tests__)([\\/]|$)|\.test\.[cm]?js$/
const watched = /\.(m?js|cjs|json)$/

const snapshot = new Map()
const signature = (file) => {
  try {
    const s = fs.statSync(file)
    return s.isFile() ? `${s.mtimeMs}:${s.size}` : null
  } catch {
    return null
  }
}
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (ignored.test(full)) continue
    if (entry.isDirectory()) walk(full)
    else if (watched.test(entry.name)) snapshot.set(full, signature(full))
  }
}
roots.forEach((root) => fs.existsSync(root) && walk(root))

let child = null
let stopping = false
const start = () => {
  child = spawn(process.execPath, ['src/index.js'], { cwd: apiDir, stdio: 'inherit' })
  child.on('exit', (code, sig) => {
    child = null
    if (!stopping && !pending) console.log(`[dev-watch] api exited (${sig || code}); waiting for changes`)
  })
}

let pending = null
let timer = null
const restart = () => {
  console.log(`[dev-watch] ${path.relative(apiDir, pending)} changed, restarting`)
  const relaunch = () => { pending = null; start() }
  if (!child) return relaunch()
  if (child.killed) return
  child.once('exit', relaunch)
  child.kill()
}

for (const root of roots) {
  if (!fs.existsSync(root)) continue
  fs.watch(root, { recursive: true }, (_event, name) => {
    if (!name) return
    const full = path.join(root, name)
    if (ignored.test(full) || !watched.test(full)) return
    const next = signature(full)
    if (snapshot.get(full) === next) return
    snapshot.set(full, next)
    pending = full
    clearTimeout(timer)
    timer = setTimeout(restart, 300)
  })
}

const shutdown = () => {
  stopping = true
  if (child) child.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start()
