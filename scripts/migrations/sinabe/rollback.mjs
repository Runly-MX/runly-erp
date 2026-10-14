// `rollback` command: removes what the migrator CREATED for a source, driven
// by LegacyRef in reverse order (custody -> comments -> item files -> items ->
// purchase files -> invoices/orders -> suppliers/employees it created ->
// catalogs it created), deleting the stored files. Matched pre-existing records
// are never touched (only their LegacyRef pointer is removed).
// --only <ids> (needs --dump): only those items, their files/comments and the
// custody records that include them; shared documents and catalogs stay.
import { readOnlyIds } from './plan.mjs'
import { createReport, writeReport } from './report.mjs'
import { openRun } from './migrate.mjs'
import { createdMarker } from './migrate-catalogs.mjs'
import { uniqueCustodyRows } from './mapping/custody.mjs'
import { errorCode } from './migrate-files.mjs'

const CHUNK = 200
const chunks = (list) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK))

async function deleteFileAssets(run, ids) {
  const real = [...new Set(ids.filter(Boolean))]
  if (!real.length) return 0
  const keys = []
  let count = 0
  for (const part of chunks(real)) {
    const rows = await run.prisma.fileAsset.findMany({ where: { id: { in: part } }, select: { objectKey: true } })
    keys.push(...rows.map((row) => row.objectKey).filter(Boolean))
    // The DB constraint on item file links does not cascade: remove links first.
    await run.prisma.invItemFile.deleteMany({ where: { fileAssetId: { in: part } } })
    count += (await run.prisma.fileAsset.deleteMany({ where: { id: { in: part } } })).count
  }
  const removed = await run.removeObjects(keys)
  run.report.file('deleted', count)
  if (removed < keys.length) run.report.warn('STORAGE_OBJECT_NOT_REMOVED', keys.length - removed)
  return count
}

async function deleteAudit(run, entityIds) {
  for (const part of chunks(entityIds)) {
    await run.prisma.auditLog.deleteMany({ where: { companyId: run.companyId, entityId: { in: part }, metadata: { path: ['source'], equals: run.sourceName } } })
  }
}

function selectRefs(refs, entity, filter = null) {
  return refs.filter((ref) => ref.entity === entity && (!filter || filter(ref.legacyId)))
}

export async function runRollback(options) {
  if (!options.company) throw new Error('rollback: --company es obligatorio')
  const only = await readOnlyIds(options.only)
  if (only && !options.dump) throw new Error('rollback --only requiere --dump')
  const report = createReport({ command: 'rollback', mode: 'commit', source: options.source ?? 'sinabe', companyId: options.company })
  const run = await openRun(options, { needSource: Boolean(only) })
  run.report = report
  const { prisma, companyId } = run
  const deletedRefIds = []
  try {
    const refs = await prisma.legacyRef.findMany({ where: { companyId, source: run.sourceName } })
    const markers = new Set(refs.filter((ref) => ref.entity.startsWith('created.')).map((ref) => `${ref.entity.slice(8)}:${ref.legacyId}`))
    let itemFilter = null, fileFilter = null, commentFilter = null, custodyFilter = null
    if (only) {
      const items = new Set(only)
      const fileIds = new Set(), logIds = new Set(), custodyIds = new Set()
      for (const inv of run.model.inventories.filter((row) => items.has(row.id))) {
        for (const attachment of run.model.mapItem(inv).attachments) fileIds.add(attachment.legacyId)
        for (const log of run.model.auditByInv.get(inv.id) ?? []) logIds.add(log.id)
      }
      for (const record of run.model.source.custodyRecords) {
        if (uniqueCustodyRows(run.model.custodyItemsByRecord.get(record.id) ?? []).some((row) => items.has(row.inventoryId))) custodyIds.add(record.id)
      }
      itemFilter = (id) => items.has(id)
      fileFilter = (id) => fileIds.has(id)
      commentFilter = (id) => logIds.has(id)
      custodyFilter = (id) => custodyIds.has(id) || [...custodyIds].some((c) => id.startsWith(`custody:${c}:`))
    }

    // 1. Custody records (cascade: custody items) + their files.
    for (const ref of selectRefs(refs, 'inv_custody', custodyFilter)) {
      try {
        const custody = await prisma.invCustody.findUnique({ where: { id: ref.targetId }, select: { id: true, source: true, documentFileId: true, receiverSignatureFileId: true, delivererSignatureFileId: true } })
        if (custody && custody.source === run.sourceName.slice(0, 20)) {
          await prisma.invCustody.delete({ where: { id: custody.id } })
          await deleteFileAssets(run, [custody.documentFileId, custody.receiverSignatureFileId, custody.delivererSignatureFileId])
          await deleteAudit(run, [custody.id])
          report.count('custody', 'created')
        } else {
          if (!custody) await deleteAudit(run, [ref.targetId])
          report.count('custody', custody ? 'matched' : 'skipped')
        }
        deletedRefIds.push(ref.id)
      } catch (error) { report.error('custody', errorCode('ROLLBACK_CUSTODY', error), ref.legacyId) }
    }
    deletedRefIds.push(...selectRefs(refs, 'inv_assignment', custodyFilter).map((ref) => ref.id))

    // 2. Comments, 3. item files.
    const comments = selectRefs(refs, 'inv_item_comment', commentFilter)
    for (const part of chunks(comments)) {
      const { count } = await prisma.entityComment.deleteMany({ where: { id: { in: part.map((ref) => ref.targetId) }, companyId } })
      report.count('comments', 'created', count)
      deletedRefIds.push(...part.map((ref) => ref.id))
    }
    const itemFiles = selectRefs(refs, 'inv_item_file', fileFilter)
    report.count('itemFiles', 'created', await deleteFileAssets(run, itemFiles.map((ref) => ref.targetId)))
    deletedRefIds.push(...itemFiles.map((ref) => ref.id))

    // 4. Items (cascade: admin events, custom values, file links, assignments).
    const items = selectRefs(refs, 'inv_item', itemFilter)
    for (const part of chunks(items)) {
      const ids = part.map((ref) => ref.targetId)
      await prisma.entityRelation.deleteMany({ where: { companyId, targetType: 'inventory_item', targetId: { in: ids } } })
      await prisma.entityComment.deleteMany({ where: { companyId, entityType: 'InvItem', entityId: { in: ids } } })
      try {
        report.count('items', 'created', (await prisma.invItem.deleteMany({ where: { companyId, id: { in: ids } } })).count)
        deletedRefIds.push(...part.map((ref) => ref.id))
      } catch {
        for (const ref of part) {
          try { await prisma.invItem.delete({ where: { id: ref.targetId } }); report.count('items', 'created'); deletedRefIds.push(ref.id) } catch (error) { report.error('items', errorCode('ROLLBACK_ITEM', error), ref.legacyId) }
        }
      }
      await deleteAudit(run, ids)
    }

    if (!only) {
      // 5. Purchase files, 6. invoices then orders (lines, relations, own case).
      const purchaseFiles = selectRefs(refs, 'purchase_file')
      report.count('invoiceFiles', 'created', await deleteFileAssets(run, purchaseFiles.map((ref) => ref.targetId)))
      deletedRefIds.push(...purchaseFiles.map((ref) => ref.id))
      for (const [entity, modelName, reportName] of [['purchase_invoice', 'purchaseInvoice', 'invoices'], ['purchase_order', 'purchaseOrder', 'purchaseOrders']]) {
        for (const ref of selectRefs(refs, entity)) {
          try {
            const doc = await prisma[modelName].findUnique({ where: { id: ref.targetId }, select: { id: true, caseId: true } })
            if (doc) {
              await prisma.purchaseLine.deleteMany({ where: { companyId, ownerId: doc.id } })
              await prisma.entityRelation.deleteMany({ where: { companyId, OR: [{ sourceId: doc.id }, { targetId: doc.id }] } })
              await prisma[modelName].delete({ where: { id: doc.id } })
              const [orders, invoices] = await Promise.all([prisma.purchaseOrder.count({ where: { caseId: doc.caseId } }), prisma.purchaseInvoice.count({ where: { caseId: doc.caseId } })])
              if (!orders && !invoices) {
                await prisma.entityRelation.deleteMany({ where: { companyId, OR: [{ sourceId: doc.caseId }, { targetId: doc.caseId }] } })
                await prisma.purchaseCase.deleteMany({ where: { id: doc.caseId, companyId } })
              }
              await deleteAudit(run, [doc.id])
              report.count(reportName, 'created')
            } else { await deleteAudit(run, [ref.targetId]); report.count(reportName, 'skipped') }
            deletedRefIds.push(ref.id)
          } catch (error) { report.error(reportName, errorCode('ROLLBACK_PURCHASE', error), ref.legacyId) }
        }
      }

      // 7. Suppliers and employees the migrator created (metadata.importedFrom = source).
      for (const [entity, modelName, reportName] of [['contact_supplier', 'contact', 'suppliers'], ['hr_employee', 'hrEmployee', 'employees']]) {
        for (const ref of selectRefs(refs, entity)) {
          try {
            const row = await prisma[modelName].findUnique({ where: { id: ref.targetId }, select: { id: true, metadata: true } })
            const created = row?.metadata?.importedFrom === run.sourceName && String(row.metadata.legacyId ?? '') === ref.legacyId
            if (created) {
              if (modelName === 'contact') await prisma.purchaseSupplierProfile.deleteMany({ where: { companyId, contactId: row.id } })
              await prisma[modelName].delete({ where: { id: row.id } })
              await deleteAudit(run, [row.id])
              report.count(reportName, 'created')
            } else report.count(reportName, row ? 'matched' : 'skipped')
            deletedRefIds.push(ref.id)
          } catch (error) { report.error(reportName, errorCode('ROLLBACK_PERSON', error), ref.legacyId) }
        }
      }

      // 8. Catalogs the migrator created (created.<entity> marker).
      const CATALOGS = [['inv_custom_field', 'invCustomField', 'customFields'], ['inv_model', 'invModel', 'models'], ['inv_category', 'invCategory', 'categories'],
        ['inv_brand', 'invBrand', 'brands'], ['inv_location', 'invLocation', 'locations'], ['inv_condition', 'invCondition', 'conditions']]
      for (const [entity, modelName, reportName] of CATALOGS) {
        for (const ref of [...selectRefs(refs, entity), ...selectRefs(refs, createdMarker(entity))]) {
          if (ref.entity !== entity) { deletedRefIds.push(ref.id); continue }
          try {
            if (markers.has(`${entity}:${ref.legacyId}`)) {
              const { count } = await prisma[modelName].deleteMany({ where: { id: ref.targetId, companyId } })
              report.count(reportName, count ? 'created' : 'skipped')
            } else report.count(reportName, 'matched')
            deletedRefIds.push(ref.id)
          } catch (error) { report.error(reportName, errorCode('ROLLBACK_CATALOG', error), ref.legacyId) }
        }
      }

      // 9. Sweep: any stored file of this source left behind by an interrupted run.
      const leftovers = await prisma.fileAsset.findMany({ where: { entityId: companyId, metadata: { path: ['source'], equals: run.sourceName } }, select: { id: true } })
      if (leftovers.length) report.warn('ROLLBACK_ORPHAN_FILES_REMOVED', await deleteFileAssets(run, leftovers.map((row) => row.id)))
    }
  } finally {
    for (const part of chunks(deletedRefIds)) await prisma.legacyRef.deleteMany({ where: { id: { in: part } } })
    report.warn('LEGACY_REFS_REMOVED', deletedRefIds.length)
    await run.close()
  }
  return writeReport(report, options.out ?? '.', 'rollback')
}
