// `plan` command: groups the inventories of the dump (or of an --only list)
// into batches of N and lists each batch's files with their bytes from the
// uploads listing. Writes <out>/plan.json (contains file paths: keep it inside
// the customer network, like the dump) and <out>/batches/batch-NNN.txt with the
// sinabe inventory ids of each batch (usable as --only).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadSinabe } from './source.mjs'
import { readFilesListing } from './files-listing.mjs'
import { buildModel, buildScope } from './mapping/index.mjs'

export const DEFAULT_BATCH_SIZE = 50

// File with one sinabe inventory id per line ('#' comments and blanks ignored).
export async function readOnlyIds(path) {
  if (!path) return null
  const text = await readFile(path, 'utf8')
  return [...new Set(text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean))]
}

export function buildPlan(model, { listing = null, batchSize = DEFAULT_BATCH_SIZE, onlyIds = null, maxFileBytes = Infinity } = {}) {
  const scope = buildScope(model, onlyIds)
  const size = Math.max(1, Math.floor(batchSize) || DEFAULT_BATCH_SIZE)
  const batches = []
  const totals = { items: scope.items.length, files: 0, bytes: 0, missing: 0, oversize: 0, unknownSize: 0, unknownOnly: scope.unknownOnly }
  for (let start = 0; start < scope.items.length; start += size) {
    const slice = scope.items.slice(start, start + size)
    const batch = { index: batches.length + 1, inventoryIds: slice.map((inv) => inv.id), files: [], bytes: 0, missing: 0, oversize: 0 }
    for (const inv of slice) {
      for (const attachment of model.mapItem(inv).attachments) {
        const entry = listing ? listing.get(attachment.key) : null
        const bytes = entry ? entry.size : null
        if (listing && !entry) batch.missing++
        if (bytes != null && bytes > maxFileBytes) batch.oversize++
        batch.files.push({ key: attachment.key, bytes })
        batch.bytes += bytes ?? 0
        if (bytes == null) totals.unknownSize++
      }
    }
    totals.files += batch.files.length
    totals.bytes += batch.bytes
    totals.missing += batch.missing
    totals.oversize += batch.oversize
    batches.push(batch)
  }
  return { batchSize: size, totals, batches, purchaseOrders: scope.orderIds.size, invoices: scope.invoiceIds.size }
}

export async function runPlan({ dump, listing = null, only = null, batchSize = DEFAULT_BATCH_SIZE, out, maxFileBytes, timeZone }) {
  if (!dump) throw new Error('plan: --dump es obligatorio')
  if (!out) throw new Error('plan: --out es obligatorio')
  const started = Date.now()
  const source = await loadSinabe(dump)
  const model = buildModel(source, { timeZone })
  const files = listing ? (await readFilesListing(listing)).files : null
  const plan = buildPlan(model, { listing: files, batchSize, onlyIds: await readOnlyIds(only), maxFileBytes })
  await mkdir(join(out, 'batches'), { recursive: true })
  for (const batch of plan.batches) {
    await writeFile(join(out, 'batches', `batch-${String(batch.index).padStart(3, '0')}.txt`), `${batch.inventoryIds.join('\n')}\n`)
  }
  await writeFile(join(out, 'plan.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...plan }, null, 2))
  return { ...plan, ms: Date.now() - started }
}
