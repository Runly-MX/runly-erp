import assert from "node:assert/strict";
import { test } from "node:test";

import { kindLabels } from "../document-template-files.js";
import { createKindRegistry } from "../kinds/kind-registry.js";
import { createPurchasesOrderDocumentKind } from "../kinds/purchases-order-kind.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const SOURCE = "22222222-2222-7222-8222-222222222222";

function setup(order) {
  const queries = [];
  const track = (name, result) => async (args) => { queries.push([name, args.where]); return result; };
  const prisma = {
    purchaseOrder: { findFirst: track("order", order) },
    purchaseCase: { findFirst: track("case", { number: "EXP-1", title: "Papelería" }) },
    contact: { findFirst: track("supplier", { name: "Prov", legalName: "Prov SA", taxId: "RFC", email: null, phone: "555" }) },
    purchaseLine: {
      findMany: track("lines", [{ description: "Papel", quantity: "10.0000", unit: null, unitAmount: "5.50", taxAmount: "8.80", total: "63.80" }]),
    },
  };
  const kinds = createKindRegistry();
  kinds.register(createPurchasesOrderDocumentKind({ prisma }));
  return { kinds, queries };
}

const load = (kinds, permissionKeys, isAdmin = false) =>
  kinds.load({ sourceType: "purchases.order", companyId: COMPANY, sourceId: SOURCE, permissionKeys, isAdmin });

test("purchases.order requires purchases.order.read to load", async () => {
  const { kinds } = setup({});
  await assert.rejects(load(kinds, ["purchases.request.read"]), (e) => e.code === "source_permission_denied");
});

test("purchases.order schema is labeled and its vocabulary points at schema tags", () => {
  const kind = createPurchasesOrderDocumentKind({ prisma: {} });
  const tags = new Set(kind.schema.map((e) => e.tag));
  assert.ok(kind.schema.every((e) => e.label && e.type));
  assert.ok(Object.values(kind.labels).every((tag) => tags.has(tag)));
  assert.equal(kindLabels(kind).get("proveedor"), "supplierName");
  assert.equal(kind.schema.find((e) => e.tag === "lines").fields.length, 6);
  assert.equal(kind.moduleKey, "runly.purchases");
});

test("purchases.order loads order, supplier and lines scoped to the company", async () => {
  const issueDate = new Date("2026-01-15");
  const { kinds, queries } = setup({
    id: SOURCE, caseId: "33333333-3333-7333-8333-333333333333", supplierId: "44444444-4444-7444-8444-444444444444",
    number: "OC-1", issueDate, expectedDate: null, status: "ISSUED", currency: "MXN", subtotal: "58.00", tax: "8.80", total: "66.80",
  });
  const data = await load(kinds, ["purchases.order.read"]);
  assert.equal(data.orderNumber, "OC-1");
  assert.equal(data.caseNumber, "EXP-1");
  assert.equal(data.supplierName, "Prov");
  assert.equal(data.supplierEmail, "");
  assert.equal(data.total, 66.8);
  assert.equal(data.issueDate, issueDate);
  assert.deepEqual(data.lines, [{ description: "Papel", quantity: 10, unit: "", unitAmount: 5.5, taxAmount: 8.8, total: 63.8 }]);
  assert.ok(queries.every(([, where]) => where.companyId === COMPANY));
  assert.deepEqual(queries.find(([name]) => name === "lines")[1], { companyId: COMPANY, ownerType: "PURCHASE_ORDER", ownerId: SOURCE });
});

test("purchases.order reports a missing order", async () => {
  const { kinds } = setup(null);
  await assert.rejects(load(kinds, [], true), (e) => e.code === "source_not_found");
});
