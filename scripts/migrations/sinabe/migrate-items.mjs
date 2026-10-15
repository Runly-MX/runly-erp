// Phase 6: items batch by batch - the item (status, dates, catalogs, custom
// values), its images (first = cover) and files, and its relations to the
// purchase order / invoice. Every step is idempotent through LegacyRef.
import { foldName } from './mapping/item.mjs'
import { fetchFile, dryFile, errorCode } from './migrate-files.mjs'

const isReal = (id) => id && !String(id).startsWith('dry:')
const realOrNull = (id) => (isReal(id) ? id : null)

// Mapped item -> importItem data with Runly ids.
export function resolveItemData(mapped, catalogs) {
  const s = mapped.sinabe
  const customValues = []
  for (const { fieldKey, value } of mapped.customValues) {
    const fieldId = catalogs.fieldIdByKey.get(fieldKey)
    if (isReal(fieldId)) customValues.push({ fieldId, value })
  }
  return {
    ...mapped.data,
    categoryId: s.typeId != null ? realOrNull(catalogs.categories.get(String(s.typeId))) : null,
    brandId: s.brandId != null ? realOrNull(catalogs.brands.get(String(s.brandId))) : null,
    modelId: s.modelId != null ? realOrNull(catalogs.models.get(String(s.modelId))) : null,
    locationId: s.locationId != null ? realOrNull(catalogs.locations.get(String(s.locationId))) : null,
    conditionId: s.condition ? realOrNull(catalogs.conditionByName.get(foldName(s.condition))) : null,
    customValues,
  }
}

const RELATIONS = [
  ['invoiceId', 'purchase_invoice', 'INVOICED_ITEM', 'invoices'],
  ['purchaseOrderId', 'purchase_order', 'PURCHASED_IN', 'orders'],
]

async function linkPurchases(run, mapped, itemId, docIds) {
  for (const [field, sourceType, relationType, kind] of RELATIONS) {
    const legacyDoc = mapped[field]
    if (!legacyDoc) continue
    const docId = docIds[kind].get(legacyDoc)
    if (!isReal(docId) || !isReal(itemId)) {
      if (run.commit) run.report.warn('RELATION_DOCUMENT_NOT_MIGRATED')
      else if (docId) run.report.count('relations', 'created')
      continue
    }
    const where = { companyId: run.companyId, sourceModule: 'runly.purchases', sourceType, sourceId: docId, targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: itemId, relationType }
    if (await run.prisma.entityRelation.findFirst({ where, select: { id: true } })) { run.report.count('relations', 'matched'); continue }
    if (!run.commit) { run.report.count('relations', 'created'); continue }
    await run.relate(run.prisma, {
      companyId: run.companyId, actorId: run.actorId, sourceType, sourceId: docId, targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: itemId,
      relationType, origin: 'AUTOMATIC', metadata: { source: run.sourceName },
    })
    run.report.count('relations', 'created')
  }
}

async function attachFiles(run, mapped, itemId, fileRefs) {
  for (const attachment of mapped.attachments) {
    if (fileRefs.has(attachment.legacyId)) { run.report.count('itemFiles', 'matched'); run.report.file('alreadyStored'); continue }
    if (!run.commit) {
      run.report.count('itemFiles', (await dryFile(run, attachment.key, 'itemFiles', mapped.legacyId)) ? 'created' : 'skipped')
      continue
    }
    const fetched = await fetchFile(run, attachment.key, 'itemFiles', mapped.legacyId)
    if (!fetched) { run.report.count('itemFiles', 'skipped'); continue }
    try {
      const result = await run.toolkit.attachItemFile({
        companyId: run.companyId, actorId: run.actorId, source: run.sourceName, legacyId: attachment.legacyId, itemId,
        buffer: fetched.buffer, fileName: attachment.fileName, mimeType: attachment.mimeType, isCover: attachment.isCover,
        maxBytes: run.maxFileBytes,
      })
      if (result.overflow) { run.report.conflict('itemFiles', 'ITEM_FILES_OVERFLOW', mapped.legacyId); continue }
      run.report.count('itemFiles', result.created ? 'created' : 'matched')
    } catch (error) {
      run.report.error('itemFiles', errorCode('ITEM_FILE', error), mapped.legacyId)
    }
  }
}

// Imports one batch of sinabe inventories. Returns Map<legacyId, itemId> of the batch.
// A serial already used by an active Runly item, or by an earlier active item of this same run.
function isSerialTaken(mapped, takenSerials, run) {
  const serial = String(mapped.data.serialNumber ?? '').trim().toLowerCase()
  if (!serial) return false
  if (takenSerials.has(serial)) return true
  if (run.commit) return false // the toolkit checks the database itself
  if (run.seenSerials.has(serial)) return true
  run.seenSerials.add(serial)
  return false
}

export async function migrateItemBatch(run, inventories, catalogs, docIds) {
  const { companyId, prisma } = run
  const out = new Map()
  const mappedList = inventories.map((inv) => run.model.mapItem(inv))
  const refs = await run.refs.findMany('inv_item', mappedList.map((m) => m.legacyId))
  const fileRefs = await run.refs.findMany('inv_item_file', mappedList.flatMap((m) => m.attachments.map((a) => a.legacyId)))
  const fresh = mappedList.filter((m) => !refs.has(m.legacyId))
  // Active Runly items that already use a serial / asset number (case-insensitive).
  const takenTags = new Map() // lower-cased value -> id of the active Runly item that uses it
  const takenSerials = new Map()
  const freshActive = fresh.filter((m) => m.enabled)
  const tags = freshActive.map((m) => m.assetTag).filter(Boolean)
  const serials = freshActive.map((m) => String(m.data.serialNumber ?? '').trim()).filter(Boolean)
  if (tags.length || serials.length) {
    const rows = await prisma.invItem.findMany({
      where: { companyId, enabled: true, OR: [...(tags.length ? [{ assetTag: { in: tags, mode: 'insensitive' } }] : []), ...(serials.length ? [{ serialNumber: { in: serials, mode: 'insensitive' } }] : [])] },
      select: { id: true, assetTag: true, serialNumber: true },
    })
    for (const row of rows) {
      if (row.assetTag) takenTags.set(row.assetTag.toLowerCase(), row.id)
      if (row.serialNumber) takenSerials.set(row.serialNumber.trim().toLowerCase(), row.id)
    }
  }
  run.seenSerials ??= new Set() // dry-run: serials of items this run would create
  for (const mapped of mappedList) {
    run.report.warnAll(mapped.warnings)
    try {
      let itemId = refs.get(mapped.legacyId) ?? null
      if (itemId) run.report.count('items', 'matched')
      else if (mapped.enabled && mapped.assetTag && takenTags.has(mapped.assetTag.toLowerCase())) { run.report.conflict('items', 'ASSET_TAG_TAKEN', mapped.legacyId, takenTags.get(mapped.assetTag.toLowerCase())); continue }
      else if (mapped.enabled && isSerialTaken(mapped, takenSerials, run)) { run.report.conflict('items', 'SERIAL_TAKEN', mapped.legacyId, takenSerials.get(String(mapped.data.serialNumber ?? '').trim().toLowerCase())); continue }
      else if (!run.commit) { run.report.count('items', 'created'); itemId = `dry:item:${mapped.legacyId}` }
      else {
        const result = await run.toolkit.importItem({ companyId, actorId: run.actorId, source: run.sourceName, legacyId: mapped.legacyId, data: resolveItemData(mapped, catalogs) })
        if (result.conflict) { run.report.conflict('items', result.conflict.reason === 'serial_taken' ? 'SERIAL_TAKEN' : 'ASSET_TAG_TAKEN', mapped.legacyId, result.conflict.existingId); continue }
        itemId = result.id
        if (result.warnings?.length) run.report.warn('ITEM_CUSTOM_FIELD_UNKNOWN', result.warnings.length)
        run.report.count('items', result.created ? 'created' : 'matched')
      }
      if (!mapped.enabled) run.report.warn('ITEM_DISABLED_IN_SINABE')
      out.set(mapped.legacyId, itemId)
      await linkPurchases(run, mapped, itemId, docIds)
      await attachFiles(run, mapped, itemId, fileRefs)
    } catch (error) {
      if (error?.code === 'RUN_ABORTED') throw error
      run.report.error('items', errorCode('ITEM', error), mapped.legacyId)
    }
  }
  return out
}
