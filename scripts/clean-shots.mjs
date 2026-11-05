// Deletes review screenshots older than N days (default 14): E2E captures in
// .e2e/shots and Impeccable review captures. Both are local, git-ignored output.
//   pnpm clean:shots [days]
import { readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const days = Number(process.argv[2] ?? 14)
if (!Number.isFinite(days) || days < 0) throw new Error('Usa un número de días válido.')
const cutoff = Date.now() - days * 86_400_000
const IMAGE = /\.(png|jpe?g|webp|gif)$/i

async function prune(dir) {
  let removed = 0
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return 0 }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      removed += await prune(path)
      if (!(await readdir(path)).length) await rm(path, { recursive: true })
    } else if (IMAGE.test(entry.name) && (await stat(path)).mtimeMs < cutoff) {
      await rm(path)
      removed++
    }
  }
  return removed
}

const targets = [join(root, '.e2e', 'shots'), join(root, 'apps', 'desktop', '.impeccable', 'review'), join(root, '.impeccable', 'review')]
let total = 0
for (const target of targets) total += await prune(target)
console.log(`Capturas de más de ${days} días eliminadas: ${total}`)
