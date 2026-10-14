// Phase 7-8: custody records (resguardos) in date order with their original
// PDF and signatures, current holder from each item's latest COMPLETED record;
// then sinabe audit logs as historical item comments (EntityComment InvItem).
import { signatureBuffer } from '../../../apps/api/src/services/legacy-import/custody-historical.js'
import { normalizeUploadKey } from './paths.mjs'
import { dayOf } from './mapping/item.mjs'
import { mapCustodyStatus, assignmentMode, custodySnapshot, uniqueCustodyRows } from './mapping/custody.mjs'
import { delivererFor } from './mapping/people.mjs'
import { auditCommentBody } from './mapping/audit.mjs'
import { fetchFile, dryFile, errorCode } from './migrate-files.mjs'

const isReal = (id) => id && !String(id).startsWith('dry:')

// known: Map<inventoryLegacyId, itemId> of items already in Runly (or about to be, in dry-run).
export function custodyCandidates(model, known, scopeIds) {
  const inDump = new Set(model.inventories.map((inv) => inv.id))
  return model.custodyRecords.map((record) => {
    const rows = uniqueCustodyRows(model.custodyItemsByRecord.get(record.id) ?? [])
    if (!rows.length) return { record, rows, state: 'no_items' }
    const missing = rows.filter((row) => !known.has(row.inventoryId))
    if (!missing.length) return { record, rows, state: 'eligible' }
    if (missing.some((row) => !inDump.has(row.inventoryId))) return { record, rows, state: 'dangling' }
    if (missing.some((row) => !scopeIds.has(row.inventoryId))) return { record, rows, state: 'pending' }
    return { record, rows, state: 'blocked' }
  })
}

const SIGNATURE_DATA = /^data:image\//i

async function signatureInput(run, value, legacyId) {
  if (value == null || String(value).trim() === '') return null
  const text = String(value).trim()
  try {
    if (SIGNATURE_DATA.test(text) || (!text.includes('/') && !text.includes('\\') && text.length > 64)) return signatureBuffer(text)
    const key = normalizeUploadKey(text)
    if (!key) { run.report.warn('SIGNATURE_BAD_REFERENCE'); return null }
    if (!run.commit) return (await dryFile(run, key, 'custody', legacyId)) ? 'dry' : null
    const fetched = await fetchFile(run, key, 'custody', legacyId)
    return fetched ? signatureBuffer(fetched.buffer) : null
  } catch (error) {
    if (error?.code === 'RUN_ABORTED') throw error
    run.report.warn('SIGNATURE_INVALID')
    return null
  }
}

async function documentInput(run, record) {
  if (!record.fileId) return null
  const file = run.model.filesById.get(record.fileId)
  const key = normalizeUploadKey(file?.url)
  if (!key) { run.report.warn('CUSTODY_DOCUMENT_NOT_FOUND'); return null }
  if (!run.commit) return (await dryFile(run, key, 'custody', record.id)) ? { dry: true } : null
  const fetched = await fetchFile(run, key, 'custody', record.id)
  return fetched ? { buffer: fetched.buffer, fileName: key.split('/').pop(), mimeType: file.type || 'application/pdf' } : null
}

export async function migrateCustody(run, candidates, known, employees) {
  const { companyId, model } = run
  for (const c of candidates) {
    if (c.state === 'eligible') continue
    if (c.state === 'pending') { run.report.count('custody', 'skipped'); run.report.warn('CUSTODY_ITEMS_PENDING') } else if (c.state === 'no_items') { run.report.count('custody', 'skipped'); run.report.warn('CUSTODY_WITHOUT_ITEMS') } else run.report.conflict('custody', c.state === 'dangling' ? 'CUSTODY_ITEM_NOT_IN_DUMP' : 'CUSTODY_ITEM_NOT_MIGRATED', c.record.id)
  }
  const eligible = candidates.filter((c) => c.state === 'eligible')
  const refs = await run.refs.findMany('inv_custody', eligible.map((c) => c.record.id))
  const existing = new Map()
  if (run.commit && refs.size) {
    const rows = await run.prisma.invCustody.findMany({ where: { id: { in: [...refs.values()] } }, select: { id: true, documentFileId: true, receiverSignatureFileId: true, delivererSignatureFileId: true } })
    for (const row of rows) existing.set(row.id, row)
  }
  for (const { record, rows } of eligible) {
    try {
      const refId = refs.get(record.id)
      const row = refId ? existing.get(refId) : null
      const complete = refId && (!run.commit || (row && (row.documentFileId || !record.fileId) && (row.receiverSignatureFileId || !record.receiverSignature) && (row.delivererSignatureFileId || !record.delivererSignature)))
      if (complete) { run.report.count('custody', 'matched'); continue }
      const employeeId = employees.get(record.receiverId)
      if (!employeeId) { run.report.conflict('custody', 'CUSTODY_RECEIVER_NOT_MIGRATED', record.id); continue }
      const status = mapCustodyStatus(record.status)
      const document = await documentInput(run, record)
      if (record.fileId && !document) run.report.warn('CUSTODY_DOCUMENT_MISSING')
      const receiverSignaturePng = await signatureInput(run, record.receiverSignature, record.id)
      const delivererSignaturePng = await signatureInput(run, record.delivererSignature, record.id)
      const mode = assignmentMode(record, rows, run.model.latestCustody)
      if (!run.commit) {
        run.report.count('custody', refId ? 'matched' : 'created')
        if (mode.mode === 'partial') run.report.warn('CUSTODY_PARTIAL_LATEST')
        continue
      }
      const when = record.date ?? record.createdAt
      const result = await run.toolkit.importCustody({
        companyId, actorId: run.actorId, source: run.sourceName, legacyId: record.id, employeeId,
        ...delivererFor(model.users.get(record.delivererId), run.deliverers),
        comments: record.comments ?? null, status, kind: 'DELIVERY', date: dayOf(when, model.timeZone), createdAt: record.createdAt ?? when,
        completedAt: status === 'COMPLETED' ? when : undefined, cancelledAt: status === 'CANCELLED' ? record.updatedAt ?? when : undefined, signedAt: when,
        items: rows.map((r) => ({ itemId: known.get(r.inventoryId), snapshot: custodySnapshot(r) })),
        applyAssignments: mode.mode === 'all',
        documentBuffer: document?.buffer, documentFileName: document?.fileName, documentMimeType: document?.mimeType,
        receiverSignaturePng: Buffer.isBuffer(receiverSignaturePng) ? receiverSignaturePng : null,
        delivererSignaturePng: Buffer.isBuffer(delivererSignaturePng) ? delivererSignaturePng : null,
      })
      if (result.warnings?.length) run.report.warn('CUSTODY_ASSIGNMENT_WARNING', result.warnings.length)
      run.report.count('custody', result.created ? 'created' : 'matched')
      if (result.created && mode.mode === 'partial') await partialAssignments(run, record, mode.itemIds, known, employeeId)
    } catch (error) {
      if (error?.code === 'RUN_ABORTED') throw error
      run.report.error('custody', errorCode('CUSTODY', error), record.id)
    }
  }
}

// Items whose latest COMPLETED record this is, when the record also lists
// items that changed hands later: a dated open assignment per item.
async function partialAssignments(run, record, inventoryIds, known, employeeId) {
  run.report.warn('CUSTODY_PARTIAL_LATEST')
  for (const inventoryId of inventoryIds) {
    try {
      const result = await run.toolkit.importAssignment({
        companyId: run.companyId, actorId: run.actorId, source: run.sourceName, legacyId: `custody:${record.id}:${inventoryId}`,
        itemId: known.get(inventoryId), employeeId, assignedAt: record.date ?? record.createdAt,
      })
      if (result.conflict) run.report.warn('ASSIGNMENT_ITEM_ALREADY_ASSIGNED')
    } catch (error) {
      run.report.warn(errorCode('ASSIGNMENT', error))
    }
  }
}

// Audit logs of the run's items -> EntityComment (InvItem) authored by the actor with the original date.
export async function migrateComments(run, itemIds) {
  const logs = []
  for (const [legacyId, itemId] of itemIds) for (const log of run.model.auditByInv.get(legacyId) ?? []) logs.push({ log, itemId })
  const refs = await run.refs.findMany('inv_item_comment', logs.map(({ log }) => log.id))
  for (const { log, itemId } of logs) {
    try {
      if (refs.has(log.id)) { run.report.count('comments', 'matched'); continue }
      if (!run.commit || !isReal(itemId)) { run.report.count('comments', 'created'); continue }
      const body = auditCommentBody(log, run.model.users.get(log.userId))
      const result = await run.refs.ensure('inv_item_comment', log.id, async (tx) => (await tx.entityComment.create({
        data: { companyId: run.companyId, entityType: 'InvItem', entityId: itemId, authorId: run.actorId, body, ...(log.createdAt ? { createdAt: log.createdAt } : {}) },
        select: { id: true },
      })).id)
      run.report.count('comments', result.created ? 'created' : 'matched')
    } catch (error) {
      if (error?.code === 'RUN_ABORTED') throw error
      run.report.error('comments', errorCode('COMMENT', error), log.id)
    }
  }
}
