import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

// relative path (forward slashes) -> { size, sha256 } for every regular file; symbolic links and special files are an error.
export async function hashTree(root, { skipTopLevel = [] } = {}) {
  const files = new Map()
  async function visit(directory, relative) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!relative && skipTopLevel.includes(entry.name)) continue
      const key = relative ? `${relative}/${entry.name}` : entry.name, full = join(directory, entry.name)
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw Error(`TREE_SPECIAL_FILE: ${key}`)
      if (entry.isDirectory()) await visit(full, key)
      else files.set(key, { size: (await lstat(full)).size, sha256: await hashFile(full) })
    }
  }
  await visit(root, '')
  return files
}

export function compareTrees(expected, actual) {
  const missing = [], extra = [], different = []
  for (const [key, value] of expected) {
    const found = actual.get(key)
    if (!found) missing.push(key)
    else if (found.sha256 !== value.sha256 || found.size !== value.size) different.push(key)
  }
  for (const key of actual.keys()) if (!expected.has(key)) extra.push(key)
  return { missing, extra, different, equal: !missing.length && !extra.length && !different.length }
}

// Does any file under `root` contain `needle` (a string or Buffer)? Used to look for plaintext inside an encrypted repository.
export async function containsBytes(root, needle) {
  const pattern = Buffer.isBuffer(needle) ? needle : Buffer.from(needle)
  const hits = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) { await visit(full); continue }
      if (!entry.isFile()) continue
      let tail = Buffer.alloc(0)
      for await (const chunk of createReadStream(full)) {
        const window = Buffer.concat([tail, chunk])
        if (window.includes(pattern)) { hits.push(full); break }
        tail = window.subarray(Math.max(0, window.length - pattern.length + 1))
      }
    }
  }
  await visit(root)
  return hits
}

export const sha256 = value => createHash('sha256').update(value).digest('hex')
