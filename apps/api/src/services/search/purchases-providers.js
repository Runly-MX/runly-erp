// runly.purchases: purchase orders, invoices and cases (expedientes).
import { Prisma } from "@prisma/client";
import { defineProvider, tokenSearch, joinParts, safeTitle } from "./helpers.js";
import { createPurchaseEconomicMode } from "../purchase-economic-mode.js";

const BASE = "/app/m/runly.purchases/purchases";
const money = (total, currency) =>
  total == null ? null : `${Number(total).toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${currency ?? ""}`.trim();
const DOC_JOINS = "LEFT JOIN contact s ON s.id = t.supplier_id LEFT JOIN purchase_case c ON c.id = t.case_id";

function documentProvider({ source, label, permission, icon, kind, table, titlePrefix, extraColumns }) {
  return defineProvider({
    source,
    moduleKey: "runly.purchases",
    label,
    permission,
    icon,
    target: (id) => `${BASE}/${kind}/${id}`,
    seeAllTarget: () => `${BASE}/${kind}`,
    search: async ({ prisma, companyId, q, limit }) => {
      const documentaryAvailable = await createPurchaseEconomicMode({ prisma }).available();
      const reference = documentaryAvailable ? 'COALESCE(dr.reference, t.number)' : 't.number';
      const referenceJoin = documentaryAvailable ? ` LEFT JOIN purchase_documentary_reference dr ON dr.document_id = t.id AND dr.company_id = t.company_id AND dr.document_type = '${table}'` : '';
      return tokenSearch(prisma, {
        q,
        limit,
        from: `${table} t ${DOC_JOINS}${referenceJoin}`,
        select: `t.id, ${reference} AS number, t.status, t.total, t.currency, s.name AS supplier_name, c.title AS case_title`,
        scope: Prisma.sql`t.company_id = ${companyId}::uuid`,
        columns: [reference, "t.number", "t.notes", ...extraColumns, "s.name", "s.legal_name", "c.number", "c.title"],
        titleColumn: reference,
        orderBy: "t.created_at DESC",
        map: (r) => ({
          id: r.id,
          title: safeTitle(label, r.number && `${titlePrefix} ${r.number}`),
          subtitle: joinParts([r.supplier_name, r.case_title, r.status, money(r.total, r.currency)]),
          icon,
        }),
      });
    },
  });
}

export const purchaseOrdersProvider = documentProvider({
  source: "purchase_orders", label: "Ordenes de compra", permission: "purchases.order.read", icon: "ClipboardList",
  kind: "orders", table: "purchase_order", titlePrefix: "Orden", extraColumns: ["t.supplier_reference", "t.payment_terms"],
});

export const purchaseInvoicesProvider = documentProvider({
  source: "purchase_invoices", label: "Facturas de compra", permission: "purchases.invoice.read", icon: "ReceiptText",
  kind: "invoices", table: "purchase_invoice", titlePrefix: "Factura", extraColumns: ["t.fiscal_uuid", "t.payment_reference"],
});

export const purchaseCasesProvider = defineProvider({
  source: "purchase_cases",
  moduleKey: "runly.purchases",
  label: "Expedientes de compra",
  permission: "purchases.case.read",
  icon: "FolderKanban",
  target: (id) => `${BASE}/cases/${id}`,
  seeAllTarget: () => `${BASE}/cases`,
  search: ({ prisma, companyId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "purchase_case t LEFT JOIN contact s ON s.id = t.supplier_id",
      select: "t.id, t.number, t.title, t.status, s.name AS supplier_name",
      scope: Prisma.sql`t.company_id = ${companyId}::uuid`,
      columns: ["t.number", "t.title", "t.description", "s.name", "s.legal_name"],
      titleColumn: "t.title",
      orderBy: "t.created_at DESC",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Expediente", joinParts([r.number, r.title])),
        subtitle: joinParts([r.supplier_name, r.status]),
        icon: "FolderKanban",
      }),
    }),
});
