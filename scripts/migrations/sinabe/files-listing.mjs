// Reads the operator's uploads listing, produced on the sinabe server with
//   find . -type f -printf '%s\t%TY-%Tm-%Td\t%p\n'
// from inside backend/src/uploads. Each line: `size<TAB>YYYY-MM-DD<TAB>./relative/path`.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { normalizeUploadKey } from './paths.mjs'

export function parseListingLine(line) {
  const trimmed = line.replace(/\r$/, '')
  if (!trimmed.trim()) return null
  const first = trimmed.indexOf('\t')
  const second = trimmed.indexOf('\t', first + 1)
  if (first < 0 || second < 0) return { error: 'LISTING_BAD_LINE' }
  const size = Number(trimmed.slice(0, first))
  const date = trimmed.slice(first + 1, second)
  const key = normalizeUploadKey(trimmed.slice(second + 1))
  if (!Number.isFinite(size) || size < 0) return { error: 'LISTING_BAD_SIZE' }
  if (!key) return { error: 'LISTING_BAD_PATH' }
  return { key, size, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null }
}

// Returns { files: Map<key, { key, size, date }>, errors: { [code]: count }, lines }.
export async function readFilesListing(filePath) {
  const files = new Map()
  const errors = {}
  let lines = 0
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of rl) {
    lines++
    const entry = parseListingLine(line)
    if (!entry) continue
    if (entry.error) { errors[entry.error] = (errors[entry.error] ?? 0) + 1; continue }
    if (files.has(entry.key)) errors.LISTING_DUPLICATE_KEY = (errors.LISTING_DUPLICATE_KEY ?? 0) + 1
    files.set(entry.key, entry)
  }
  return { files, errors, lines }
}
