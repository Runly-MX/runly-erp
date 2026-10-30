// Document kind "purchases.order" (orden de compra): proveedor, totales y
// partidas. Purchases fills it with hub.engine.generate({ kind, sourceId: orderId }).
import { DocumentProviderError } from "../document-errors.js";

export const PURCHASES_ORDER_KIND = "purchases.order";

export const PURCHASES_ORDER_SCHEMA = [
  { tag: "orderNumber", label: "Folio", type: "text" },
  { tag: "caseNumber", label: "Expediente", type: "text" },
  { tag: "caseTitle", label: "Asunto", type: "text" },
  { tag: "issueDate", label: "Fecha de emisión", type: "date" },
  { tag: "expectedDate", label: "Fecha esperada", type: "date" },
  { tag: "status", label: "Estatus", type: "text" },
  { tag: "currency", label: "Moneda", type: "text" },
  { tag: "subtotal", label: "Subtotal", type: "number" },
  { tag: "tax", label: "Impuestos", type: "number" },
  { tag: "total", label: "Total", type: "number" },
  { tag: "paymentTerms", label: "Condiciones de pago", type: "text" },
  { tag: "supplierReference", label: "Referencia del proveedor", type: "text" },
  { tag: "notes", label: "Notas", type: "text" },
  { tag: "supplierName", label: "Proveedor", type: "text" },
  { tag: "supplierLegalName", label: "Razón social del proveedor", type: "text" },
  { tag: "supplierTaxId", label: "RFC del proveedor", type: "text" },
  { tag: "supplierEmail", label: "Correo del proveedor", type: "text" },
  { tag: "supplierPhone", label: "Teléfono del proveedor", type: "text" },
  {
    tag: "lines", label: "Partidas", type: "list",
    fields: [
      { tag: "description", label: "Descripción", type: "text" },
      { tag: "quantity", label: "Cantidad", type: "number" },
      { tag: "unit", label: "Unidad", type: "text" },
      { tag: "unitAmount", label: "Precio unitario", type: "number" },
      { tag: "taxAmount", label: "Impuesto", type: "number" },
      { tag: "total", label: "Importe", type: "number" },
    ],
  },
];

const LABELS = {
  folio: "orderNumber", "numero de orden": "orderNumber", "orden de compra": "orderNumber", "no de orden": "orderNumber", oc: "orderNumber",
  expediente: "caseNumber", asunto: "caseTitle", fecha: "issueDate", "fecha de emision": "issueDate",
  "fecha esperada": "expectedDate", "fecha de entrega": "expectedDate", estatus: "status", estado: "status", moneda: "currency",
  subtotal: "subtotal", impuestos: "tax", iva: "tax", total: "total",
  "condiciones de pago": "paymentTerms", "terminos de pago": "paymentTerms", "referencia del proveedor": "supplierReference",
  notas: "notes", observaciones: "notes",
  proveedor: "supplierName", "nombre del proveedor": "supplierName", "razon social": "supplierLegalName", "razon social del proveedor": "supplierLegalName",
  rfc: "supplierTaxId", "rfc del proveedor": "supplierTaxId", correo: "supplierEmail", "correo del proveedor": "supplierEmail",
  telefono: "supplierPhone", "telefono del proveedor": "supplierPhone",
};

const SAMPLE = {
  orderNumber: "OC-2026-0001", caseNumber: "EXP-2026-0007", caseTitle: "Material de oficina", issueDate: "15/01/2026",
  expectedDate: "30/01/2026", status: "ISSUED", currency: "MXN", subtotal: "1000.00", tax: "160.00", total: "1160.00",
  paymentTerms: "30 días", supplierReference: "COT-123", notes: "Entregar en almacén.",
  supplierName: "Proveedor Ejemplo", supplierLegalName: "Proveedor Ejemplo SA de CV", supplierTaxId: "XAXX010101000",
  supplierEmail: "ventas@example.com", supplierPhone: "55 1234 5678",
  lines: [
    { description: "Resma de papel", quantity: "10", unit: "pza", unitAmount: "50.00", taxAmount: "80.00", total: "580.00" },
    { description: "Tóner", quantity: "2", unit: "pza", unitAmount: "250.00", taxAmount: "80.00", total: "580.00" },
  ],
};

const num = (value) => (value === null || value === undefined ? null : Number(value));

export function createPurchasesOrderDocumentKind({ prisma }) {
  return {
    key: PURCHASES_ORDER_KIND,
    label: "Orden de compra",
    moduleKey: "runly.purchases",
    permissionKey: "purchases.order.read",
    formats: ["docx", "xlsx", "pptx", "pdf"],
    schema: PURCHASES_ORDER_SCHEMA,
    labels: LABELS,
    sampleData: SAMPLE,
    async load({ companyId, sourceId }) {
      const order = await prisma.purchaseOrder.findFirst({ where: { id: sourceId, companyId } });
      if (!order) throw new DocumentProviderError("Orden de compra no encontrada.", 404, "source_not_found");
      const [purchaseCase, supplier, lines] = await Promise.all([
        prisma.purchaseCase.findFirst({ where: { id: order.caseId, companyId }, select: { number: true, title: true } }),
        order.supplierId
          ? prisma.contact.findFirst({ where: { id: order.supplierId, companyId }, select: { name: true, legalName: true, taxId: true, email: true, phone: true } })
          : null,
        prisma.purchaseLine.findMany({ where: { companyId, ownerType: "PURCHASE_ORDER", ownerId: order.id }, orderBy: { sortOrder: "asc" } }),
      ]);
      return {
        orderNumber: order.number, caseNumber: purchaseCase?.number ?? "", caseTitle: purchaseCase?.title ?? "",
        issueDate: order.issueDate, expectedDate: order.expectedDate, status: order.status, currency: order.total === null ? null : order.currency,
        subtotal: num(order.subtotal), tax: num(order.tax), total: num(order.total),
        paymentTerms: order.paymentTerms ?? "", supplierReference: order.supplierReference ?? "", notes: order.notes ?? "",
        supplierName: supplier?.name ?? "", supplierLegalName: supplier?.legalName ?? "", supplierTaxId: supplier?.taxId ?? "",
        supplierEmail: supplier?.email ?? "", supplierPhone: supplier?.phone ?? "",
        lines: lines.map((l) => ({
          description: l.description, quantity: num(l.quantity), unit: l.unit ?? "", unitAmount: num(l.unitAmount),
          taxAmount: num(l.taxAmount), total: num(l.total),
        })),
      };
    },
  };
}
