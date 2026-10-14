// `synthetic` command: writes <out>/sinabe-synthetic.sql, <out>/uploads/** and
// <out>/uploads-listing.tsv (same format as the operator's `find -printf` listing).
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { generateDataset } from './synthetic-data.mjs'
import { makeBlob } from './synthetic-blobs.mjs'
import { writeSyntheticDump } from './synthetic-sql.mjs'

const MIN_SIZE = { jpg: 400, png: 120, pdf: 700, xml: 600, xlsx: 64, docx: 64 }

export async function generateSynthetic({ out, items = 5000, seed = 1, bytesScale = 0.001, clean = true } = {}) {
  if (!out) throw new Error('synthetic: --out es obligatorio')
  const started = Date.now()
  const uploadsDir = join(out, 'uploads')
  if (clean) await rm(uploadsDir, { recursive: true, force: true })
  await mkdir(uploadsDir, { recursive: true })
  const { tables, files } = generateDataset({ items, seed })
  const dumpPath = join(out, 'sinabe-synthetic.sql')
  await writeSyntheticDump(dumpPath, tables)

  const made = new Set()
  const listing = []
  let bytes = 0, written = 0
  for (const [index, file] of files.entries()) {
    if (!file.onDisk) continue
    const size = file.keepRealSize ? file.realSize : Math.max(MIN_SIZE[file.kind] ?? 64, Math.round(file.realSize * bytesScale))
    const blob = makeBlob(file.kind, size, seed * 100_003 + index, file.fiscalUuid)
    const full = join(uploadsDir, ...file.key.split('/'))
    const folder = dirname(full)
    if (!made.has(folder)) { await mkdir(folder, { recursive: true }); made.add(folder) }
    await writeFile(full, blob)
    bytes += blob.length; written++
    const day = new Date(Date.UTC(2025, 0, 1) + (index % 390) * 86_400_000)
    const ymd = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`
    listing.push(`${blob.length}\t${ymd}\t./${file.key}`)
  }
  const listingPath = join(out, 'uploads-listing.tsv')
  await writeFile(listingPath, `${listing.join('\n')}\n`)
  return {
    dumpPath, listingPath, uploadsDir,
    rows: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    filesWritten: written, bytesWritten: bytes,
    filesMissing: files.filter((f) => f.referenced && !f.onDisk).length,
    filesOrphan: files.filter((f) => !f.referenced).length,
    ms: Date.now() - started,
  }
}
