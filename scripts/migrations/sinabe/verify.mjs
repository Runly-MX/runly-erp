// `verify` command: re-reads the dump and compares every record a LegacyRef
// of the source points to, field by field, against what sinabe says.
// Mismatches are reported by code with sinabe ids only. File checksums are
// compared by re-fetching through the throttled fetcher when --files-dir /
// --files-base-url is given; otherwise sizes are compared with the listing.
import { createReport, writeReport } from './report.mjs'
import { openRun } from './migrate.mjs'
import { probeFile } from './migrate-files.mjs'
import { documentNumber, invoiceFiles } from './migrate-purchases.mjs'
import { mapCustodyStatus, uniqueCustodyRows } from './mapping/custody.mjs'
import { dayOf } from './mapping/item.mjs'
import { normalizeUploadKey } from './paths.mjs'

const CHUNK = 200
const chunks = (list) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK))
// Postgres DATE values come back as UTC midnight: read the UTC calendar day.
const pad = (n) => String(n).padStart(2, '0')
const day = (date) => (date ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` : null)
const text = (value, max) => {
  const t = value == null ? '' : String(value).trim()
  return t ? t.slice(0, max) : null
}

async function loadTargets(prisma, modelName, ids, args = {}) {
  const out = new Map()
  for (const part of chunks(ids)) for (const row of await prisma[modelName].findMany({ where: { id: { in: part } }, ...args })) out.set(row.id, row)
  return out
}

// Checksum (or size) of a stored file against the source file.
async function compareFile(run, entity, legacyId, key, asset) {
  if (run.fetcher) {
    try {
      const fetched = await run.fetcher.fetch(key)
      run.report.file('checked')
      if (fetched.sha256 !== asset.checksum) { run.report.file('checksumMismatches'); run.report.conflict(entity, 'FILE_CHECKSUM_MISMATCH', legacyId) }
    } catch (error) {
      run.report.file('fetchErrors'); run.report.warn(`VERIFY_${error.code ?? 'FILE_FETCH_FAILED'}`)
    }
    return
  }
  const listed = run.listing?.get(key)
  if (listed && listed.size !== asset.sizeBytes) { run.report.file('sizeMismatches'); run.report.conflict(entity, 'FILE_SIZE_MISMATCH', legacyId) }
}

async function verifyItems(run, refs, docRefs) {
  const { model, prisma, report } = run
  const byLegacy = new Map(model.inventories.map((inv) => [inv.id, inv]))
  const targets = await loadTargets(prisma, 'invItem', refs.map((r) => r.targetId), {
    select: { id: true, assetTag: true, serialNumber: true, adminStatus: true, registeredAt: true, deregisteredAt: true, purchaseDate: true, enabled: true, invoiceNumber: true, vendorName: true,
      files: { select: { fileAsset: { select: { checksum: true, sizeBytes: true, metadata: true } } } } },
  })
  const relations = new Set()
  for (const part of chunks(refs.map((r) => r.targetId))) {
    for (const row of await prisma.entityRelation.findMany({ where: { companyId: run.companyId, targetType: 'inventory_item', targetId: { in: part } }, select: { sourceId: true, targetId: true } })) relations.add(`${row.sourceId}|${row.targetId}`)
  }
  for (const ref of refs) {
    const inv = byLegacy.get(ref.legacyId)
    const item = targets.get(ref.targetId)
    if (!inv) { report.conflict('items', 'ITEM_NOT_IN_DUMP', ref.legacyId); continue }
    if (!item) { report.conflict('items', 'ITEM_MISSING_IN_RUNLY', ref.legacyId); continue }
    const mapped = model.mapItem(inv)
    const d = mapped.data
    const diffs = []
    if (item.assetTag !== d.assetTag) diffs.push('ITEM_ASSET_TAG')
    if (item.serialNumber !== text(d.serialNumber, 255)) diffs.push('ITEM_SERIAL')
    if (item.adminStatus !== d.adminStatus) diffs.push('ITEM_ADMIN_STATUS')
    if (day(item.registeredAt) !== d.registeredAt) diffs.push('ITEM_REGISTERED_AT')
    if (day(item.deregisteredAt) !== d.deregisteredAt) diffs.push('ITEM_DEREGISTERED_AT')
    if (day(item.purchaseDate) !== d.purchaseDate) diffs.push('ITEM_PURCHASE_DATE')
    if (item.enabled !== mapped.enabled) diffs.push('ITEM_ENABLED')
    if (item.invoiceNumber !== text(d.invoiceNumber, 100)) diffs.push('ITEM_INVOICE_NUMBER')
    if (item.vendorName !== text(d.vendorName, 255)) diffs.push('ITEM_VENDOR_NAME')
    for (const [field, map, code] of [['invoiceId', docRefs.invoices, 'ITEM_INVOICE_LINK'], ['purchaseOrderId', docRefs.orders, 'ITEM_PO_LINK']]) {
      const docId = mapped[field] ? map.get(mapped[field]) : null
      if (docId && !relations.has(`${docId}|${item.id}`)) diffs.push(code)
    }
    const stored = new Map(item.files.map((f) => [f.fileAsset.metadata?.legacyId, f.fileAsset]).filter(([id]) => id && /^(image|file):/.test(id)))
    let expected = 0
    for (const attachment of mapped.attachments) {
      const asset = stored.get(attachment.legacyId)
      const probe = await probeFile(run, attachment.key)
      if (probe.ok) expected++
      if (asset) await compareFile(run, 'items', ref.legacyId, attachment.key, asset)
    }
    if (stored.size !== expected) diffs.push('ITEM_ATTACHMENT_COUNT')
    for (const code of diffs) report.conflict('items', code, ref.legacyId)
    if (!diffs.length) report.count('items', 'matched')
  }
}

async function verifyDocuments(run, refsByEntity) {
  const { model, prisma, report } = run
  for (const [entity, modelName, reportName, sinabeMap, prefix, status] of [
    ['purchase_order', 'purchaseOrder', 'purchaseOrders', model.purchaseOrders, 'PO', 'CLOSED'],
    ['purchase_invoice', 'purchaseInvoice', 'invoices', model.invoices, 'INVOICE', 'PAID'],
  ]) {
    const refs = refsByEntity.get(entity) ?? []
    const targets = await loadTargets(prisma, modelName, refs.map((r) => r.targetId), { select: { id: true, number: true, status: true, ...(prefix === 'INVOICE' ? { fiscalUuid: true } : {}) } })
    const silent = { warn: () => {} }
    for (const ref of refs) {
      const doc = sinabeMap.get(ref.legacyId)
      const row = targets.get(ref.targetId)
      if (!doc) { report.conflict(reportName, `${prefix}_NOT_IN_DUMP`, ref.legacyId); continue }
      if (!row) { report.conflict(reportName, `${prefix}_MISSING_IN_RUNLY`, ref.legacyId); continue }
      const diffs = []
      if (row.number !== documentNumber(doc, prefix, silent)) diffs.push(`${prefix}_NUMBER`)
      if (row.status !== status) diffs.push(`${prefix}_STATUS`)
      if (prefix === 'INVOICE' && doc.xmlUrl && (refsByEntity.get('purchase_file') ?? []).some((f) => f.legacyId === `invoice:${doc.id}:xml`) && !row.fiscalUuid) diffs.push('INVOICE_FISCAL_UUID')
      for (const code of diffs) report.conflict(reportName, code, ref.legacyId)
      if (!diffs.length) report.count(reportName, 'matched')
    }
  }
  const fileRefs = refsByEntity.get('purchase_file') ?? []
  const assets = await loadTargets(prisma, 'fileAsset', fileRefs.map((r) => r.targetId), { select: { id: true, checksum: true, sizeBytes: true } })
  const keyOf = new Map([...model.invoices.values()].flatMap((inv) => invoiceFiles(inv).map((f) => [f.legacyId, f.key])))
  for (const ref of fileRefs) {
    const asset = assets.get(ref.targetId)
    if (!asset) { report.conflict('invoiceFiles', 'INVOICE_FILE_MISSING_IN_RUNLY', ref.legacyId); continue }
    if (keyOf.has(ref.legacyId)) await compareFile(run, 'invoiceFiles', ref.legacyId.split(':')[1], keyOf.get(ref.legacyId), asset)
    report.count('invoiceFiles', 'matched')
  }
}

async function verifyCustody(run, refs) {
  const { model, prisma, report } = run
  const records = new Map(model.source.custodyRecords.map((r) => [r.id, r]))
  const targets = await loadTargets(prisma, 'invCustody', refs.map((r) => r.targetId), {
    select: { id: true, status: true, date: true, documentFileId: true, receiverSignatureFileId: true, delivererSignatureFileId: true, _count: { select: { items: true } } },
  })
  for (const ref of refs) {
    const record = records.get(ref.legacyId)
    const row = targets.get(ref.targetId)
    if (!record) { report.conflict('custody', 'CUSTODY_NOT_IN_DUMP', ref.legacyId); continue }
    if (!row) { report.conflict('custody', 'CUSTODY_MISSING_IN_RUNLY', ref.legacyId); continue }
    const diffs = []
    if (row.status !== mapCustodyStatus(record.status)) diffs.push('CUSTODY_STATUS')
    if (day(row.date) !== dayOf(record.date ?? record.createdAt, model.timeZone)) diffs.push('CUSTODY_DATE')
    if (row._count.items !== uniqueCustodyRows(model.custodyItemsByRecord.get(record.id) ?? []).length) diffs.push('CUSTODY_ITEM_COUNT')
    if (record.fileId && !row.documentFileId) {
      const file = model.filesById.get(record.fileId)
      const key = normalizeUploadKey(file?.url)
      if (key && (await probeFile(run, key)).ok) diffs.push('CUSTODY_DOCUMENT_MISSING')
    }
    if (record.receiverSignature && !row.receiverSignatureFileId) diffs.push('CUSTODY_RECEIVER_SIGNATURE_MISSING')
    if (record.delivererSignature && !row.delivererSignatureFileId) diffs.push('CUSTODY_DELIVERER_SIGNATURE_MISSING')
    for (const code of diffs) report.conflict('custody', code, ref.legacyId)
    if (!diffs.length) report.count('custody', 'matched')
  }
}

export async function runVerify(options) {
  if (!options.dump) throw new Error('verify: --dump es obligatorio')
  if (!options.company) throw new Error('verify: --company es obligatorio')
  const report = createReport({ command: 'verify', mode: 'lectura', source: options.source ?? 'sinabe', companyId: options.company })
  const run = await openRun(options, { needStorage: false })
  run.report = report
  try {
    const refs = await run.prisma.legacyRef.findMany({ where: { companyId: run.companyId, source: run.sourceName } })
    const refsByEntity = new Map()
    for (const ref of refs) { if (!refsByEntity.has(ref.entity)) refsByEntity.set(ref.entity, []); refsByEntity.get(ref.entity).push(ref) }
    const docRefs = {
      invoices: new Map((refsByEntity.get('purchase_invoice') ?? []).map((r) => [r.legacyId, r.targetId])),
      orders: new Map((refsByEntity.get('purchase_order') ?? []).map((r) => [r.legacyId, r.targetId])),
    }
    await verifyItems(run, refsByEntity.get('inv_item') ?? [], docRefs)
    await verifyDocuments(run, refsByEntity)
    await verifyCustody(run, refsByEntity.get('inv_custody') ?? [])
    // Remaining entities: the target row must exist.
    for (const [entity, modelName, reportName] of [['inv_item_comment', 'entityComment', 'comments'], ['hr_employee', 'hrEmployee', 'employees'], ['contact_supplier', 'contact', 'suppliers'],
      ['inv_category', 'invCategory', 'categories'], ['inv_brand', 'invBrand', 'brands'], ['inv_model', 'invModel', 'models'], ['inv_location', 'invLocation', 'locations'],
      ['inv_condition', 'invCondition', 'conditions'], ['inv_custom_field', 'invCustomField', 'customFields']]) {
      const list = refsByEntity.get(entity) ?? []
      const found = await loadTargets(run.prisma, modelName, list.map((r) => r.targetId), { select: { id: true } })
      for (const ref of list) {
        if (found.has(ref.targetId)) report.count(reportName, 'matched')
        else report.conflict(reportName, `${entity.toUpperCase()}_MISSING_IN_RUNLY`, ref.legacyId)
      }
    }
  } finally {
    await run.close()
  }
  return writeReport(report, options.out ?? '.', 'verify')
}
