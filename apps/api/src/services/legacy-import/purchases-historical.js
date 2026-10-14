// Historical purchase orders and supplier invoices for legacy migrations:
// final statuses (closed, paid, cancelled) written directly with the typed
// folio, skipping approvals and policies. Each document gets its own case
// like the normal flow (an invoice joins its order's case when linked).
import {
  MODULE_KEY, allocateNumber, cleanText, createCase, currency, normalizeLine, relate, replaceLines, totalsFromLines,
} from '../purchases-shared.js';
import { LegacyImportError, clip, toDateOnly, toTimestamp, writeImportAudit, sha256 } from './shared.js';
import { extractCfdiUuid, purchaseFileLabel } from './cfdi.js';

export const IMPORT_STATUSES = {
  orders: ['ISSUED', 'CLOSED', 'CANCELLED'],
  invoices: ['PENDING', 'PAID', 'CANCELLED'],
};

const KIND_META = {
  orders: { model: 'purchaseOrder', entityType: 'purchase_order', ownerType: 'PURCHASE_ORDER', entity: 'purchase_order', relation: 'PURCHASED_IN', label: 'Orden', event: 'purchase.order' },
  invoices: { model: 'purchaseInvoice', entityType: 'purchase_invoice', ownerType: 'PURCHASE_INVOICE', entity: 'purchase_invoice', relation: 'INVOICED_ITEM', label: 'Factura', event: 'purchase.invoice' },
};

export function assertImportStatus(kind, status) {
  const value = String(status ?? '').trim().toUpperCase();
  if (!IMPORT_STATUSES[kind]) throw new LegacyImportError('Tipo de documento no válido.');
  if (!IMPORT_STATUSES[kind].includes(value)) {
    throw new LegacyImportError(`Estado no importable para ${kind === 'orders' ? 'la orden' : 'la factura'}: ${status}. Usa ${IMPORT_STATUSES[kind].join(', ')}.`);
  }
  return value;
}

// Status of the auto-created case: a finished document closes its case.
export function caseStatusFor(status) {
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'CLOSED' || status === 'PAID') return 'CLOSED';
  return 'IN_PROGRESS';
}

// Totals: from lines when given, else from { subtotal, tax, total }.
function documentTotals(input) {
  const lines = (Array.isArray(input.lines) ? input.lines : []).map(normalizeLine).filter(Boolean);
  const totals = totalsFromLines(lines, input.totals ?? input);
  return { lines, totals };
}

export function createPurchasesHistorical({ prisma, refs, fileStore, defaultSource }) {
  async function defaultWorkflowId(companyId) {
    const workflow = await prisma.purchaseWorkflow.findFirst({ where: { companyId, enabled: true, isDefault: true }, select: { id: true } });
    return workflow?.id ?? null;
  }

  async function assertSupplier(companyId, supplierId) {
    if (!supplierId) return;
    const contact = await prisma.contact.findFirst({ where: { id: supplierId, companyId }, select: { id: true } });
    if (!contact) throw new LegacyImportError('El proveedor no existe en esta empresa.');
  }

  async function assertItems(companyId, itemIds) {
    const ids = [...new Set((itemIds ?? []).filter(Boolean))];
    if (!ids.length) return [];
    const rows = await prisma.invItem.findMany({ where: { companyId, id: { in: ids } }, select: { id: true } });
    if (rows.length !== ids.length) throw new LegacyImportError('Uno o más activos no existen en esta empresa.');
    return ids;
  }

  async function writeDocument(kind, tx, { companyId, actorId, source, legacyId, input, status, caseRow, itemIds, extra }) {
    const meta = KIND_META[kind];
    const { lines, totals } = documentTotals(input);
    const issueDate = toDateOnly(input.issueDate);
    const { sequence, number } = await allocateNumber(tx, { companyId, kind, number: input.number, date: issueDate });
    const purchaseCase = caseRow ?? await createCase(tx, {
      companyId, actorId, workflowId: await defaultWorkflowId(companyId), title: `${meta.label} ${number}`,
      currency: input.currency, estimatedTotal: totals.total, supplierId: input.supplierId,
    });
    if (!caseRow) {
      const caseStatus = caseStatusFor(status);
      await tx.purchaseCase.update({
        where: { id: purchaseCase.id },
        data: {
          status: caseStatus, description: `Importado desde ${source}`,
          ...(caseStatus === 'CLOSED' || caseStatus === 'CANCELLED' ? { closedAt: extra.closedAt ?? extra.cancelledAt ?? extra.paidAt ?? toTimestamp(input.issueDate) } : {}),
          ...(input.createdAt ? { createdAt: toTimestamp(input.createdAt) } : {}),
        },
      });
    }
    const doc = await tx[meta.model].create({
      data: {
        companyId, caseId: purchaseCase.id, number, sequence, status, supplierId: input.supplierId || null, issueDate,
        currency: currency(input.currency), notes: cleanText(input.notes), ...totals, ...extra, createdById: actorId || null,
        ...(input.createdAt ? { createdAt: toTimestamp(input.createdAt) } : {}),
      },
    });
    await replaceLines(tx, companyId, meta.ownerType, doc.id, lines);
    await relate(tx, { companyId, actorId, sourceType: 'purchase_case', sourceId: purchaseCase.id, targetType: meta.entityType, targetId: doc.id, relationType: 'CONTAINS', origin: 'AUTOMATIC' });
    for (const targetId of itemIds) {
      await relate(tx, {
        companyId, actorId, sourceType: meta.entityType, sourceId: doc.id, targetModule: 'runly.inventory', targetType: 'inventory_item', targetId,
        relationType: meta.relation, origin: 'AUTOMATIC', metadata: { source },
      });
    }
    await writeImportAudit(tx, {
      companyId, actorId, moduleKey: MODULE_KEY, entityType: meta.entityType, entityId: doc.id, action: `${meta.event}.imported`,
      after: { number: doc.number, status: doc.status, total: Number(doc.total) }, source, legacyId,
      extra: { note: `Importado desde ${source}` },
    });
    return doc;
  }

  async function numberConflict(kind, companyId, number, supplierId) {
    const where = kind === 'invoices' ? { companyId, number, supplierId: supplierId || null } : { companyId, number };
    const row = await prisma[KIND_META[kind].model].findFirst({ where, select: { id: true } });
    return row ? { reason: 'number_taken', number, existingId: row.id } : null;
  }

  async function prepare(kind, { companyId, source, legacyId, input }) {
    const number = cleanText(input.number, kind === 'orders' ? 40 : 100);
    if (!number) throw new LegacyImportError('El folio (number) es obligatorio en la importación.');
    if (!toDateOnly(input.issueDate)) throw new LegacyImportError('La fecha de emisión es obligatoria.');
    const status = assertImportStatus(kind, input.status);
    const previous = await refs.find({ companyId, source, entity: KIND_META[kind].entity, legacyId });
    if (previous) return { previous };
    const conflict = await numberConflict(kind, companyId, number, input.supplierId);
    if (conflict) return { conflict };
    await assertSupplier(companyId, input.supplierId);
    const itemIds = await assertItems(companyId, input.itemIds);
    return { status, number, itemIds };
  }

  // Returns { id, caseId, created } or { id: null, created: false, conflict }.
  async function importPurchaseOrder({ companyId, actorId = null, source = defaultSource, legacyId, ...input }) {
    const ready = await prepare('orders', { companyId, source, legacyId, input });
    if (ready.previous) return { id: ready.previous, created: false };
    if (ready.conflict) return { id: null, created: false, conflict: ready.conflict };
    const { status } = ready;
    const issued = status !== 'CANCELLED' || input.issuedAt ? toTimestamp(input.issuedAt ?? input.issueDate) : null;
    const extra = {
      expectedDate: toDateOnly(input.expectedDate),
      supplierReference: cleanText(input.supplierReference, 100),
      paymentTerms: cleanText(input.paymentTerms, 120),
      issuedAt: issued,
      closedAt: status === 'CLOSED' ? toTimestamp(input.closedAt ?? input.issueDate) : null,
      cancelledAt: status === 'CANCELLED' ? toTimestamp(input.cancelledAt ?? input.issueDate) : null,
    };
    let caseId = null;
    const result = await refs.ensure({ companyId, source, entity: 'purchase_order', legacyId }, async (tx) => {
      const doc = await writeDocument('orders', tx, { companyId, actorId, source, legacyId, input: { ...input, number: ready.number }, status, caseRow: null, itemIds: ready.itemIds, extra });
      caseId = doc.caseId;
      return doc.id;
    });
    return { ...result, caseId };
  }

  // purchaseOrderId: the invoice joins that order's case and is linked
  // BILLED_FROM, like the normal flow. fiscalUuid falls back to xmlBuffer.
  async function importPurchaseInvoice({ companyId, actorId = null, source = defaultSource, legacyId, xmlBuffer = null, purchaseOrderId = null, ...input }) {
    const ready = await prepare('invoices', { companyId, source, legacyId, input });
    if (ready.previous) return { id: ready.previous, created: false };
    if (ready.conflict) return { id: null, created: false, conflict: ready.conflict };
    const { status } = ready;
    let order = null;
    if (purchaseOrderId) {
      order = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, companyId }, select: { id: true, caseId: true } });
      if (!order) throw new LegacyImportError('La orden de compra indicada no existe en esta empresa.');
    }
    const caseRow = order ? await prisma.purchaseCase.findFirst({ where: { id: order.caseId, companyId } }) : null;
    const { totals } = documentTotals(input);
    const paid = status === 'PAID';
    const fiscalUuid = clip(input.fiscalUuid, 36) ?? (xmlBuffer ? extractCfdiUuid(xmlBuffer) : null);
    const extra = {
      fiscalUuid,
      dueDate: toDateOnly(input.dueDate),
      paidAt: paid ? toDateOnly(input.paidAt ?? input.issueDate) : null,
      paidAmount: paid ? (input.paidAmount != null ? Math.round(Number(input.paidAmount) * 100) / 100 : totals.total) : 0,
      paymentReference: cleanText(input.paymentReference, 120),
      paymentMethod: cleanText(input.paymentMethod, 40),
    };
    if (!Number.isFinite(extra.paidAmount) || extra.paidAmount < 0) throw new LegacyImportError('El monto pagado no es válido.');
    let caseId = null;
    const result = await refs.ensure({ companyId, source, entity: 'purchase_invoice', legacyId }, async (tx) => {
      const doc = await writeDocument('invoices', tx, { companyId, actorId, source, legacyId, input: { ...input, number: ready.number }, status, caseRow, itemIds: ready.itemIds, extra });
      if (order) {
        await relate(tx, { companyId, actorId, sourceType: 'purchase_invoice', sourceId: doc.id, targetType: 'purchase_order', targetId: order.id, relationType: 'BILLED_FROM', origin: 'AUTOMATIC' });
      }
      caseId = doc.caseId;
      return doc.id;
    });
    return { ...result, caseId, fiscalUuid };
  }

  // Attachment with the purchases UI convention (files with moduleKey
  // runly.purchases, entityType = owner type, metadata.sourceEntityId = owner
  // id; invoice PDF/XML labelled pdf/xml). legacyId defaults to the checksum.
  async function attachPurchaseFile({ companyId, actorId = null, source = defaultSource, legacyId, ownerType, ownerId, buffer, fileName, mimeType, label, maxBytes }) {
    const kind = ownerType === 'purchase_order' ? 'orders' : ownerType === 'purchase_invoice' ? 'invoices' : null;
    if (!kind) throw new LegacyImportError('ownerType debe ser purchase_order o purchase_invoice.');
    fileStore.checkBuffer(buffer, maxBytes);
    const checksum = sha256(buffer);
    const key = { companyId, source, entity: 'purchase_file', legacyId: legacyId ?? `${ownerId}:${checksum}` };
    const previous = await refs.find(key);
    if (previous) return { id: previous, created: false, checksum };
    const owner = await prisma[KIND_META[kind].model].findFirst({ where: { id: ownerId, companyId }, select: { id: true } });
    if (!owner) throw new LegacyImportError('El documento de compra no existe en esta empresa.');
    const fileLabel = clip(label, 100) ?? purchaseFileLabel(fileName, mimeType);
    const result = await refs.ensure(key, async (tx, assetData) => {
      const asset = await tx.fileAsset.create({ data: assetData });
      await writeImportAudit(tx, {
        companyId, actorId, moduleKey: MODULE_KEY, entityType: ownerType, entityId: ownerId, action: 'purchase.file.imported',
        after: { fileId: asset.id, name: asset.originalName }, source, legacyId: key.legacyId,
      });
      return asset.id;
    }, {
      prepare: () => fileStore.upload({
        companyId, uploadedById: actorId, buffer, fileName, mimeType, moduleKey: MODULE_KEY, entityType: ownerType, sourceEntityId: ownerId,
        metadata: { ...(fileLabel ? { label: fileLabel } : {}), source, legacyId: key.legacyId }, limit: maxBytes,
      }),
      cleanup: (assetData) => fileStore.remove(assetData.objectKey),
    });
    return { ...result, checksum };
  }

  return { importPurchaseOrder, importPurchaseInvoice, attachPurchaseFile, extractCfdiUuid };
}
