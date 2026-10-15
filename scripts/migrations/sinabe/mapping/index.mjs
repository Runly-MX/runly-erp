// Builds the in-memory migration model from a loaded sinabe source: lookups,
// the asset tag decision and one pure mapping per inventory. No I/O.
import { fullName } from './people.mjs'
import { normalizeUploadKey, isThumbnailKey } from '../paths.mjs'
import { mapStatus, decideAssetTags, pickCondition, itemName, dayOf, DEFAULT_TIMEZONE } from './item.mjs'
import { itemCustomValues } from './custom-fields.mjs'
import { normalizeSupplierName, supplierLegacyId } from './people.mjs'
import { orderCustodyRecords, latestCompletedByItem } from './custody.mjs'

const groupBy = (rows, key) => {
  const out = new Map()
  for (const row of rows) {
    const k = row[key]
    if (k == null) continue
    if (!out.has(k)) out.set(k, [])
    out.get(k).push(row)
  }
  return out
}
const byId = (rows) => new Map(rows.map((row) => [row.id, row]))
const ts = (d) => d?.getTime?.() ?? 0
const baseName = (key) => key.split('/').pop()

export function sortInventories(inventories) {
  return [...inventories].sort((a, b) => ts(a.createdAt) - ts(b.createdAt) || String(a.id).localeCompare(String(b.id)))
}

// Attachments of one inventory: enabled images (first = cover, thumbnails skipped) then enabled files.
export function itemAttachments(inv, imagesByInv, filesByInv) {
  const out = []
  const warnings = []
  const images = (imagesByInv.get(inv.id) ?? []).filter((img) => img.enabled !== false).sort((a, b) => ts(a.createdAt) - ts(b.createdAt) || String(a.id).localeCompare(String(b.id)))
  for (const img of images) {
    const key = normalizeUploadKey(img.url)
    if (!key) { warnings.push('FILE_BAD_PATH'); continue }
    if (isThumbnailKey(key)) { warnings.push('IMAGE_IS_THUMBNAIL'); continue }
    out.push({ legacyId: `image:${img.id}`, kind: 'image', key, fileName: baseName(key), mimeType: img.type || 'image/jpeg', isCover: !out.some((a) => a.kind === 'image') })
  }
  const files = (filesByInv.get(inv.id) ?? []).filter((f) => f.enabled !== false).sort((a, b) => ts(a.createdAt) - ts(b.createdAt) || String(a.id).localeCompare(String(b.id)))
  for (const file of files) {
    const key = normalizeUploadKey(file.url)
    if (!key) { warnings.push('FILE_BAD_PATH'); continue }
    out.push({ legacyId: `file:${file.id}`, kind: 'file', key, fileName: baseName(key), mimeType: file.type || 'application/octet-stream', isCover: false })
  }
  return { attachments: out, warnings }
}

export function buildModel(source, { timeZone = DEFAULT_TIMEZONE } = {}) {
  const types = byId(source.inventoryTypes)
  const brands = byId(source.inventoryBrands)
  const models = byId(source.models)
  const conditions = byId(source.conditions)
  const verticals = byId(source.verticals)
  const invoices = byId(source.invoices)
  const purchaseOrders = byId(source.purchaseOrders)
  const users = byId(source.users)
  const filesById = byId(source.files)
  const conditionsByInv = groupBy(source.inventoryConditions, 'inventoryId')
  const customByInv = groupBy(source.inventoryCustomFields, 'inventoryId')
  const verticalsByModel = groupBy(source.modelVerticals, 'modelId')
  const imagesByInv = groupBy(source.images, 'inventoryId')
  const filesByInv = groupBy(source.files, 'inventoryId')
  const custodyItemsByRecord = groupBy(source.custodyItems, 'custodyRecordId')
  const auditByInv = groupBy(source.auditLogs.filter((log) => String(log.entityType ?? '').toLowerCase() === 'inventory'), 'entityId')
  const assetTags = decideAssetTags(source.inventories)
  const inventories = sortInventories(source.inventories)

  const mapItem = (inv) => {
    const tag = assetTags.get(inv.id)
    const status = mapStatus(inv, { timeZone })
    const model = models.get(inv.modelId) ?? null
    const typeName = model ? types.get(model.typeId)?.name : null
    const brandName = model ? brands.get(model.brandId)?.name : null
    const condition = pickCondition((conditionsByInv.get(inv.id) ?? []).map((row) => conditions.get(row.conditionId)?.name))
    const verticalNames = (verticalsByModel.get(inv.modelId) ?? []).map((row) => verticals.get(row.verticalId)?.name).filter(Boolean)
    const invoice = inv.invoiceId ? invoices.get(inv.invoiceId) ?? null : null
    const purchaseOrderId = inv.purchaseOrderId ?? invoice?.purchaseOrderId ?? null
    const order = purchaseOrderId ? purchaseOrders.get(purchaseOrderId) ?? null : null
    const { attachments, warnings: fileWarnings } = itemAttachments(inv, imagesByInv, filesByInv)
    const warnings = [...tag.warnings, ...status.warnings, ...fileWarnings]
    if (inv.modelId != null && !model) warnings.push('MODEL_NOT_FOUND')
    if (inv.invoiceId && !invoice) warnings.push('INVOICE_NOT_FOUND')
    if (purchaseOrderId && !order) warnings.push('PURCHASE_ORDER_NOT_FOUND')
    if (condition.list.length > 1) warnings.push('CONDITIONS_COLLAPSED')
    return {
      legacyId: inv.id,
      enabled: inv.enabled !== false,
      assetTag: tag.assetTag,
      assetTagOrigin: tag.origin,
      data: {
        assetTag: tag.assetTag,
        name: itemName({ typeName, brandName, modelName: model?.name, assetTag: tag.assetTag, serialNumber: inv.serialNumber }),
        enabled: inv.enabled !== false,
        legacyActor: fullName(users.get(inv.createdById)),
        serialNumber: inv.serialNumber ?? null,
        model: model?.name ?? null,
        notes: inv.comments ?? null,
        purchaseDate: dayOf(inv.receptionDate, timeZone),
        createdAt: inv.createdAt ?? null,
        adminStatus: status.adminStatus,
        registeredAt: status.registeredAt,
        deregisteredAt: status.deregisteredAt,
        deregistrationReason: status.deregistrationReason,
        invoiceNumber: invoice?.code ?? null,
        vendorName: normalizeSupplierName(invoice?.supplier) ?? normalizeSupplierName(order?.supplier),
        acquisitionOrigin: invoice || order ? 'PURCHASE' : 'OTHER',
      },
      sinabe: { modelId: model?.id ?? null, typeId: model?.typeId ?? null, brandId: model?.brandId ?? null, locationId: inv.locationId ?? null, condition: condition.primary },
      customValues: itemCustomValues(inv, { conditionNames: condition.list, verticalNames, customFieldRows: customByInv.get(inv.id) ?? [] }),
      invoiceId: invoice?.id ?? null,
      purchaseOrderId: order?.id ?? null,
      attachments,
      warnings,
    }
  }

  const custodyRecords = orderCustodyRecords(source.custodyRecords)
  return {
    source, timeZone, inventories, assetTags, mapItem,
    types, brands, models, conditions, invoices, purchaseOrders, users, filesById,
    custodyRecords, custodyItemsByRecord,
    latestCustody: latestCompletedByItem(custodyRecords, custodyItemsByRecord),
    auditByInv,
    supplierIdOf: (doc) => supplierLegacyId(doc?.supplier),
  }
}

// Scope of a run: the selected inventories plus the purchase documents they
// reference (all documents when no --only was given).
export function buildScope(model, onlyIds = null) {
  const only = onlyIds ? new Set(onlyIds) : null
  const items = model.inventories.filter((inv) => !only || only.has(inv.id))
  const unknownOnly = only ? [...only].filter((id) => !items.some((inv) => inv.id === id)).length : 0
  let invoiceIds, orderIds
  if (!only) {
    invoiceIds = new Set(model.invoices.keys())
    orderIds = new Set(model.purchaseOrders.keys())
  } else {
    invoiceIds = new Set(items.map((inv) => inv.invoiceId).filter((id) => id && model.invoices.has(id)))
    orderIds = new Set()
    for (const inv of items) {
      const po = inv.purchaseOrderId ?? model.invoices.get(inv.invoiceId)?.purchaseOrderId
      if (po && model.purchaseOrders.has(po)) orderIds.add(po)
    }
    for (const id of invoiceIds) {
      const po = model.invoices.get(id).purchaseOrderId
      if (po && model.purchaseOrders.has(po)) orderIds.add(po)
    }
  }
  return { items, itemIds: new Set(items.map((inv) => inv.id)), invoiceIds, orderIds, unknownOnly }
}
