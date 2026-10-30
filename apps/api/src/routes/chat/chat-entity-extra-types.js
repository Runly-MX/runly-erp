import { toLocalIso } from "@runly/core";

// Chat connectors for records that live in Prisma models without a dedicated
// getter the chat can reuse: purchase cases/orders/invoices and POS orders.
// Same normalized shapes as chat-entity-references-service.js (resolve) and
// chat-entity-search-service.js (search).

export const EXTRA_REFERENCE_PERMISSIONS = {
  purchase_case: "purchases.case.read",
  purchase_order: "purchases.order.read",
  purchase_invoice: "purchases.invoice.read",
  pos_order: "pos.orders.read",
};

const STATUS_ES = {
  REGISTERED: "Referencia registrada",
  OPEN: "Abierto", CLOSED: "Cerrado", CANCELLED: "Cancelado", DRAFT: "Borrador", ISSUED: "Emitida",
  PENDING: "Pendiente", PAID: "Pagada", PARTIAL: "Pago parcial", APPROVED: "Aprobada", RECEIVED: "Recibida",
};
const statusLabel = (status) => STATUS_ES[String(status ?? "").toUpperCase()] ?? status ?? null;

function money(value, currency) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString("es-MX", { style: "currency", currency: currency || "MXN" })}`;
}

const dateOnly = (value) => (value ? toLocalIso(new Date(value)) : null);
const compact = (rows) => rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "");

export function createChatExtraEntityTypes({ prisma }) {
  const terms = (q) => String(q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const containsAny = (fields, word) => ({ OR: fields.map((field) => ({ [field]: { contains: word, mode: "insensitive" } })) });
  const whereTerms = (q, fields) => (terms(q).length ? { AND: terms(q).map((word) => containsAny(fields, word)) } : {});

  const caseOption = (row) => ({
    entityType: "purchase_case", recordId: row.id, label: `${row.number} · ${row.title}`,
    subtitle: [statusLabel(row.status), money(row.estimatedTotal, row.currency)].filter(Boolean).join(" · ") || null,
  });
  const orderOption = (row) => ({
    entityType: "purchase_order", recordId: row.id, label: `Orden ${row.number}`,
    subtitle: [statusLabel(row.status), money(row.total, row.currency), row.supplierReference].filter(Boolean).join(" · ") || null,
  });
  const invoiceOption = (row) => ({
    entityType: "purchase_invoice", recordId: row.id, label: `Factura ${row.number}`,
    subtitle: [statusLabel(row.status), money(row.total, row.currency), row.fiscalUuid ? row.fiscalUuid.slice(0, 8) : null].filter(Boolean).join(" · ") || null,
  });
  const posOption = (row) => ({
    entityType: "pos_order", recordId: row.id, label: `Pedido #${row.orderNumber}${row.customerName ? ` · ${row.customerName}` : ""}`,
    subtitle: [row.status, money(row.totalAmount, "MXN")].filter(Boolean).join(" · ") || null,
  });

  async function search(entityType, companyId, q, limit) {
    const take = Math.min(Math.max(limit, 1), 30);
    if (entityType === "purchase_case") {
      const rows = await prisma.purchaseCase.findMany({
        where: { companyId, ...whereTerms(q, ["number", "title", "description"]) },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map(caseOption);
    }
    if (entityType === "purchase_order") {
      const caseIds = terms(q).length
        ? (await prisma.purchaseCase.findMany({ where: { companyId, ...whereTerms(q, ["title", "number"]) }, select: { id: true }, take: 50 })).map((c) => c.id)
        : [];
      const rows = await prisma.purchaseOrder.findMany({
        where: terms(q).length
          ? { companyId, OR: [whereTerms(q, ["number", "supplierReference", "notes"]), ...(caseIds.length ? [{ caseId: { in: caseIds } }] : [])] }
          : { companyId },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map(orderOption);
    }
    if (entityType === "purchase_invoice") {
      const rows = await prisma.purchaseInvoice.findMany({
        where: { companyId, ...whereTerms(q, ["number", "fiscalUuid", "notes", "paymentReference"]) },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map(invoiceOption);
    }
    if (entityType === "pos_order") {
      const words = terms(q);
      const number = words.length === 1 && /^#?\d+$/.test(words[0]) ? Number(words[0].replace("#", "")) : null;
      const rows = await prisma.posOrder.findMany({
        where: words.length
          ? { companyId, OR: [
            ...(number !== null ? [{ orderNumber: number }] : []),
            whereTerms(q, ["customerName", "customerPhone", "externalOrderId", "notes"]),
          ] }
          : { companyId },
        orderBy: { openedAt: "desc" }, take,
      });
      return rows.map(posOption);
    }
    return null;
  }

  // Returns the card snapshot (+ `details` for the preview popover) or null.
  async function resolve(entityType, companyId, recordId) {
    if (entityType === "purchase_case") {
      const row = await prisma.purchaseCase.findFirst({ where: { id: recordId, companyId } });
      if (!row) return null;
      return {
        ...caseOption(row), entityType, recordId, title: `${row.number} · ${row.title}`,
        url: `/app/m/runly.purchases/purchases/cases/${recordId}`, status: row.status, statusLabel: statusLabel(row.status),
        details: compact([
          { label: "Folio", value: row.number }, { label: "Estado", value: statusLabel(row.status) },
          { label: "Total estimado", value: money(row.estimatedTotal, row.currency) },
          { label: "Descripción", value: row.description }, { label: "Creado", value: dateOnly(row.createdAt) },
        ]),
      };
    }
    if (entityType === "purchase_order") {
      const row = await prisma.purchaseOrder.findFirst({ where: { id: recordId, companyId } });
      if (!row) return null;
      return {
        ...orderOption(row), entityType, recordId, title: `Orden ${row.number}`,
        url: `/app/m/runly.purchases/purchases/orders/${recordId}`, status: row.status, statusLabel: statusLabel(row.status),
        details: compact([
          { label: "Folio", value: row.number }, { label: "Estado", value: statusLabel(row.status) },
          { label: "Total", value: money(row.total, row.currency) }, { label: "Fecha", value: dateOnly(row.issueDate) },
          { label: "Entrega estimada", value: dateOnly(row.expectedDate) }, { label: "Referencia", value: row.supplierReference },
          { label: "Condiciones de pago", value: row.paymentTerms }, { label: "Notas", value: row.notes },
        ]),
      };
    }
    if (entityType === "purchase_invoice") {
      const row = await prisma.purchaseInvoice.findFirst({ where: { id: recordId, companyId } });
      if (!row) return null;
      return {
        ...invoiceOption(row), entityType, recordId, title: `Factura ${row.number}`,
        url: `/app/m/runly.purchases/purchases/invoices/${recordId}`, status: row.status, statusLabel: statusLabel(row.status),
        details: compact([
          { label: "Folio", value: row.number }, { label: "Estado", value: statusLabel(row.status) },
          { label: "Total", value: money(row.total, row.currency) }, { label: "Pagado", value: money(row.paidAmount, row.currency) },
          { label: "Fecha", value: dateOnly(row.issueDate) }, { label: "Vence", value: dateOnly(row.dueDate) },
          { label: "UUID fiscal", value: row.fiscalUuid }, { label: "Notas", value: row.notes },
        ]),
      };
    }
    if (entityType === "pos_order") {
      const row = await prisma.posOrder.findFirst({ where: { id: recordId, companyId } });
      if (!row) return null;
      return {
        ...posOption(row), entityType, recordId, title: `Pedido #${row.orderNumber}`,
        url: "/app/m/runly.pos/pos/orders", status: row.status, statusLabel: row.status,
        details: compact([
          { label: "Pedido", value: `#${row.orderNumber}` }, { label: "Estado", value: row.status },
          { label: "Total", value: money(row.totalAmount, "MXN") }, { label: "Pagado", value: money(row.paidAmount, "MXN") },
          { label: "Cliente", value: row.customerName }, { label: "Teléfono", value: row.customerPhone },
          { label: "Abierto", value: dateOnly(row.openedAt) }, { label: "Notas", value: row.notes },
        ]),
      };
    }
    return null;
  }

  return { search, resolve };
}
