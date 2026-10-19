// MCP-only purchases action: register purchase orders and supplier invoices
// in bulk (an Excel export, or data the assistant read from PDFs) and link them
// to each other and to inventory items. Documents that already exist (same
// folio, same supplier for invoices) are reused and never modified; only the
// missing links are added. New documents are created as drafts through the
// same services the Compras screens use. No payments, receipts or issuing.
import { z } from 'zod';
import { insist } from '../config.js';
import { hasCapability } from '../../services/purchases-service.js';
import { inheritFromOrders } from '../../services/purchase-relations-service.js';
import { writeAudit } from '../../services/purchases-shared.js';

const text = max => z.string().trim().min(1).max(max);
const optText = max => z.string().trim().max(max).nullable().optional();
const date = z.iso.date().nullable().optional();
const money = z.number().finite().min(0).optional();
const itemRef = z.object({ itemId: z.uuid().optional(), serialNumber: text(255).optional(), assetTag: text(100).optional() }).strict()
  .refine(ref => ref.itemId || ref.serialNumber || ref.assetTag, 'Indica itemId, serialNumber o assetTag del equipo.');
const line = z.object({
  description: text(500), quantity: z.number().positive().optional(), unitAmount: z.number().finite().min(0).optional(),
  taxRate: z.number().min(0).max(1).optional().describe('Tasa decimal: 0.16 = 16 %.'), unit: optText(20), itemKind: z.enum(['GOODS', 'SERVICE']).optional(),
}).strict();
const supplier = z.object({ id: z.uuid().optional(), name: text(255).optional(), taxId: text(20).optional().describe('RFC del proveedor.') }).strict()
  .refine(value => value.id || value.name || value.taxId, 'Indica id, name o taxId del proveedor.');
const document = z.object({
  kind: z.enum(['order', 'invoice']),
  number: text(100).describe('Folio tal como aparece en el documento (OC 0006174, V265210187).'),
  supplier: supplier.optional(),
  issueDate: date, dueDate: date, expectedDate: date,
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  fiscalUuid: optText(36).describe('UUID fiscal del CFDI (solo facturas).'),
  supplierReference: optText(100), paymentTerms: optText(120), notes: optText(2000),
  subtotal: money, tax: money, total: money,
  lines: z.array(line).max(200).optional().describe('Conceptos. Sin conceptos se usan subtotal/tax/total.'),
  orderNumber: text(40).optional().describe('Solo facturas: folio de la orden que factura (existente o del mismo lote).'),
  inventory: z.array(itemRef).max(200).optional().describe('Equipos que ampara el documento.'),
}).strict();
export const purchasesImportInput = z.object({ documents: z.array(document).min(1).max(50) }).strict();

const LINK = { order: { relationType: 'PURCHASED_IN', sourceType: 'purchase_order', model: 'purchaseOrder', capability: 'purchaseOrders', label: 'Orden' },
  invoice: { relationType: 'INVOICED_ITEM', sourceType: 'purchase_invoice', model: 'purchaseInvoice', capability: 'invoices', label: 'Factura' } };
const ci = value => ({ equals: value, mode: 'insensitive' });

export function createPurchasesImportAction({ prisma, documents, relations, workflow }) {
  async function resolveSupplier(companyId, ref, pending) {
    if (!ref) return { supplierId: null, label: 'Sin proveedor' };
    if (ref.id) {
      const row = await prisma.contact.findFirst({ where: { id: ref.id, companyId, enabled: true }, select: { id: true, name: true } });
      insist(row, 'invalid_proposal', `El proveedor ${ref.id} no existe en esta empresa.`);
      return { supplierId: row.id, label: row.name };
    }
    for (const where of [ref.taxId && { taxId: ci(ref.taxId) }, ref.name && { OR: [{ name: ci(ref.name) }, { legalName: ci(ref.name) }] }].filter(Boolean)) {
      const rows = await prisma.contact.findMany({ where: { companyId, enabled: true, ...where }, select: { id: true, name: true }, take: 2 });
      insist(rows.length < 2, 'invalid_proposal', `Hay varios contactos que coinciden con el proveedor "${ref.taxId ?? ref.name}". Indica su id.`);
      if (rows.length) return { supplierId: rows[0].id, label: rows[0].name };
    }
    insist(ref.name, 'invalid_proposal', `No existe un proveedor con RFC ${ref.taxId}; agrega su nombre para darlo de alta.`);
    // One new contact per supplier in the batch, whether rows name it by RFC, name or both.
    const taxId = ref.taxId?.toUpperCase() ?? null, name = ref.name.toLowerCase();
    let entry = [...pending.values()].find(value => (taxId && value.taxId === taxId) || value.name.toLowerCase() === name);
    insist(!entry || !taxId || !entry.taxId || entry.taxId === taxId, 'invalid_proposal', `El proveedor "${ref.name}" aparece con RFC distintos en el lote.`);
    if (!entry) { entry = { key: `s${pending.size + 1}`, name: ref.name, taxId }; pending.set(entry.key, entry); }
    else entry.taxId ??= taxId;
    return { supplierId: null, newSupplier: entry.key, label: `${entry.name} (nuevo)` };
  }

  async function resolveItem(companyId, ref) {
    const where = ref.itemId ? { id: ref.itemId } : ref.serialNumber ? { serialNumber: ci(ref.serialNumber) } : { assetTag: ci(ref.assetTag) };
    const rows = await prisma.invItem.findMany({ where: { companyId, enabled: true, ...where }, select: { id: true, name: true, serialNumber: true, assetTag: true }, take: 2 });
    const label = ref.itemId ?? ref.serialNumber ?? ref.assetTag;
    insist(rows.length, 'invalid_proposal', `No encontré el equipo ${label} en Inventario.`);
    insist(rows.length === 1, 'invalid_proposal', `Varios equipos coinciden con ${label}; usa itemId.`);
    return rows[0];
  }

  // Item -> documents of that kind it is already linked to.
  async function currentLinks(companyId, kind, itemIds) {
    if (!itemIds.length) return new Map();
    const rows = await prisma.entityRelation.findMany({ where: { companyId, sourceModule: 'runly.purchases', targetType: 'inventory_item', relationType: LINK[kind].relationType, targetId: { in: itemIds } }, select: { targetId: true, sourceId: true } });
    const out = new Map();
    for (const row of rows) out.set(row.targetId, [...(out.get(row.targetId) ?? []), row.sourceId]);
    return out;
  }

  async function prepare(input, actx) {
    const { companyId } = actx;
    const current = await workflow.ensureWorkflow(companyId);
    const pendingSuppliers = new Map(), plan = [], claimed = { order: new Map(), invoice: new Map() };
    for (const [index, doc] of input.documents.entries()) {
      const meta = LINK[doc.kind], row = `Fila ${index + 1} (${meta.label} ${doc.number})`;
      insist(hasCapability(current.capabilities, meta.capability), 'capability_disabled', `${row}: habilita ${doc.kind === 'order' ? 'órdenes de compra' : 'facturas'} en el flujo de Compras.`, 409);
      insist(doc.kind === 'invoice' || !doc.orderNumber, 'invalid_proposal', `${row}: orderNumber solo aplica a facturas.`);
      const who = await resolveSupplier(companyId, doc.supplier, pendingSuppliers);
      // Order folios are unique per company; invoice folios per supplier.
      const matches = doc.kind === 'order'
        ? await prisma.purchaseOrder.findMany({ where: { companyId, number: ci(doc.number) }, take: 2 })
        : who.newSupplier ? [] : await prisma.purchaseInvoice.findMany({ where: { companyId, number: ci(doc.number), ...(doc.supplier ? { supplierId: who.supplierId } : {}) }, take: 2 });
      insist(matches.length < 2, 'invalid_proposal', `${row}: hay varias facturas con ese folio; indica el proveedor.`);
      const existing = matches[0] ?? null;
      if (existing) {
        insist(existing.status !== 'CANCELLED', 'invalid_proposal', `${row}: el documento existe pero está cancelado.`);
        insist(!doc.supplier || !existing.supplierId || existing.supplierId === who.supplierId, 'invalid_proposal', `${row}: la orden ya existe con otro proveedor.`);
      } else insist(actx.can(`purchases.${doc.kind}.create`), 'permission_denied', `${row}: no tienes permiso para crear ${doc.kind === 'order' ? 'órdenes' : 'facturas'}.`, 403);
      const dupKey = `${doc.kind}:${doc.number.toLowerCase()}:${doc.kind === 'order' ? '' : who.supplierId ?? who.newSupplier ?? ''}`;
      insist(!plan.some(entry => entry.dupKey === dupKey), 'invalid_proposal', `${row}: está repetido en el lote; combina sus conceptos y equipos en una sola fila.`);
      const items = [];
      for (const ref of doc.inventory ?? []) {
        const item = await resolveItem(companyId, ref);
        const owner = claimed[doc.kind].get(item.id);
        insist(!owner || owner === dupKey, 'invalid_proposal', `${row}: el equipo ${item.serialNumber ?? item.name} ya está en otra ${doc.kind === 'order' ? 'orden' : 'factura'} del lote.`);
        claimed[doc.kind].set(item.id, dupKey);
        if (!items.some(entry => entry.id === item.id)) items.push(item);
      }
      if (items.length) {
        insist(hasCapability(current.capabilities, 'inventoryRelations'), 'capability_disabled', 'Habilita la relación con Inventario en el flujo de Compras.', 409);
        insist(existing ? actx.can('purchases.relation.manage') : true, 'permission_denied', `${row}: no tienes permiso para relacionar compras con inventario.`, 403);
      }
      const links = await currentLinks(companyId, doc.kind, items.map(item => item.id));
      const newItems = [];
      for (const item of items) {
        const others = (links.get(item.id) ?? []).filter(id => id !== existing?.id);
        if (others.length) {
          const other = await prisma[meta.model].findFirst({ where: { id: others[0], companyId }, select: { number: true } });
          insist(false, 'invalid_proposal', `${row}: el equipo ${item.serialNumber ?? item.name} ya está relacionado con ${doc.kind === 'order' ? 'la orden' : 'la factura'} ${other?.number ?? others[0]}. Cámbialo desde la ficha del equipo.`, 409);
        }
        if (!(links.get(item.id) ?? []).includes(existing?.id)) newItems.push(item);
      }
      plan.push({ index, dupKey, doc, existing: existing ? { id: existing.id, number: existing.number, caseId: existing.caseId } : null, supplierId: who.supplierId, newSupplier: who.newSupplier ?? null, supplierLabel: who.label, items: newItems.map(item => item.id), itemLabels: newItems.map(item => item.serialNumber ?? item.assetTag ?? item.name) });
    }
    // Invoice -> order, by folio: an existing order or one in this batch.
    for (const entry of plan.filter(entry => entry.doc.kind === 'invoice' && entry.doc.orderNumber)) {
      const row = `Fila ${entry.index + 1} (Factura ${entry.doc.number})`;
      const inBatch = plan.find(other => other.doc.kind === 'order' && other.doc.number.toLowerCase() === entry.doc.orderNumber.toLowerCase());
      const order = inBatch?.existing ?? (inBatch ? null : await prisma.purchaseOrder.findFirst({ where: { companyId, number: ci(entry.doc.orderNumber), status: { not: 'CANCELLED' } }, select: { id: true, number: true } }));
      insist(inBatch || order, 'invalid_proposal', `${row}: la orden ${entry.doc.orderNumber} no existe; agrégala al lote con kind "order".`);
      entry.order = { id: order?.id ?? null, number: order?.number ?? inBatch.doc.number, batchIndex: inBatch && !inBatch.existing ? inBatch.index : null };
      if (entry.existing) {
        const billed = await prisma.entityRelation.findFirst({ where: { companyId, sourceModule: 'runly.purchases', sourceType: 'purchase_invoice', sourceId: entry.existing.id, targetType: 'purchase_order', relationType: 'BILLED_FROM' }, select: { targetId: true } });
        insist(!billed || billed.targetId === entry.order.id, 'invalid_proposal', `${row}: la factura ya está relacionada con otra orden de compra.`, 409);
        entry.order.alreadyLinked = Boolean(billed);
        insist(billed || actx.can('purchases.relation.manage'), 'permission_denied', `${row}: no tienes permiso para relacionar documentos de compra.`, 403);
      }
    }
    if (pendingSuppliers.size) insist(actx.can('contacts.contacts.create'), 'permission_denied', 'No tienes permiso para dar de alta proveedores nuevos en Contactos.', 403);
    const fields = [
      ...[...pendingSuppliers.values()].map(value => ({ label: 'Proveedor nuevo', value: value.taxId ? `${value.name} · RFC ${value.taxId}` : value.name })),
      ...plan.map(entry => ({
        label: `${LINK[entry.doc.kind].label} ${entry.doc.number}`,
        value: [entry.existing ? 'Ya existe: solo se agregan relaciones' : `Nueva en borrador · ${entry.supplierLabel}${entry.doc.total != null ? ` · total ${entry.doc.total} ${entry.doc.currency ?? 'MXN'}` : ''}${entry.doc.lines?.length ? ` · ${entry.doc.lines.length} concepto(s)` : ''}`,
          entry.order && !entry.order.alreadyLinked ? `factura la orden ${entry.order.number} (hereda sus equipos)` : null,
          entry.itemLabels.length ? `equipos: ${entry.itemLabels.join(', ')}` : null].filter(Boolean).join(' · '),
      })),
    ];
    return {
      input: { suppliers: [...pendingSuppliers.values()], plan: plan.map(({ itemLabels: _labels, dupKey: _dup, ...entry }) => entry) },
      preview: { title: `Registrar ${plan.length} documento(s) de compra`, fields },
    };
  }

  async function execute(input, actx) {
    const { companyId, actorProfileId: actorId } = actx;
    const supplierIds = new Map(), results = [], createdOrders = new Map();
    for (const value of input.suppliers) {
      const contact = await prisma.contact.create({ data: { companyId, type: 'company', name: value.name, legalName: value.name, taxId: value.taxId } });
      await writeAudit(prisma, { companyId, actorId, entityType: 'contact', entityId: contact.id, action: 'purchase.supplier.created_from_import', after: contact });
      supplierIds.set(value.key, contact.id);
    }
    const ordered = [...input.plan].sort((a, b) => (a.doc.kind === b.doc.kind ? a.index - b.index : a.doc.kind === 'order' ? -1 : 1));
    for (const entry of ordered) {
      const { doc } = entry, kind = doc.kind === 'order' ? 'orders' : 'invoices';
      const orderId = entry.order ? entry.order.id ?? createdOrders.get(entry.order.batchIndex) : null;
      let id = entry.existing?.id, number = entry.existing?.number;
      if (!entry.existing) {
        const created = await documents.create(kind, companyId, actorId, {
          number: doc.number, supplierId: entry.supplierId ?? supplierIds.get(entry.newSupplier) ?? null, issueDate: doc.issueDate, currency: doc.currency,
          notes: doc.notes, expectedDate: doc.expectedDate, supplierReference: doc.supplierReference, paymentTerms: doc.paymentTerms,
          dueDate: doc.dueDate, fiscalUuid: doc.fiscalUuid, subtotal: doc.subtotal, tax: doc.tax, total: doc.total, lines: doc.lines ?? [],
          inventoryIds: entry.items, orderIds: orderId ? [orderId] : [], inheritItems: Boolean(orderId),
        });
        ({ id, number } = created);
      } else {
        if (entry.items.length) await relations.bulkRelate(companyId, actorId, { sourceType: LINK[doc.kind].sourceType, sourceId: id, targetIds: entry.items });
        if (orderId && !entry.order.alreadyLinked) {
          await relations.createRelation(companyId, actorId, { sourceType: 'purchase_invoice', sourceId: id, targetType: 'purchase_order', targetId: orderId, relationType: 'BILLED_FROM' });
          await inheritFromOrders(prisma, { companyId, actorId, invoiceId: id, orderIds: [orderId] });
        }
      }
      if (doc.kind === 'order') createdOrders.set(entry.index, id);
      results.push({ kind: doc.kind, id, number, created: !entry.existing, linkedItems: entry.items.length, orderId, link: `/app/m/runly.purchases/${kind}/${id}` });
    }
    const made = results.filter(row => row.created).length;
    return { summary: `${made} documento(s) creados, ${results.length - made} reutilizados, ${input.suppliers.length} proveedor(es) nuevos.`, documents: results };
  }

  return {
    key: 'purchases.documents.import',
    moduleKey: 'runly.purchases',
    operation: 'create',
    label: 'Registrar órdenes y facturas de compra',
    permission: 'purchases.relation.read',
    description: 'Registra en lote (hasta 50 por propuesta) órdenes de compra y facturas de proveedor, por ejemplo filas de un Excel o datos leídos de PDFs, remisiones o actas. Si el folio ya existe (las facturas también por proveedor) se reutiliza sin modificarlo y solo se agregan las relaciones faltantes; si no, se crea en borrador. Proveedores por id, RFC o nombre (se dan de alta si no existen). Factura -> orden con orderNumber; equipos por itemId, serialNumber o assetTag. La factura hereda los equipos de su orden. Nunca inventes importes: omítelos si no vienen en la fuente. Después adjunta el PDF con runly_files_import_prepare usando el id devuelto (purchases.order / purchases.invoice).',
    inputSchema: purchasesImportInput,
    prepare,
    execute,
  };
}
