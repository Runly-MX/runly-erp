import assert from "node:assert/strict";
import { test } from "node:test";

import { kindLabels } from "../document-template-files.js";
import { createContactsContactDocumentKind } from "../kinds/contacts-contact-kind.js";
import { createKindRegistry } from "../kinds/kind-registry.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const SOURCE = "22222222-2222-7222-8222-222222222222";

function setup(row) {
  let query = null;
  const prisma = { contact: { findFirst: async (args) => { query = args; return row; } } };
  const kinds = createKindRegistry();
  kinds.register(createContactsContactDocumentKind({ prisma }));
  return { kinds, query: () => query };
}

const load = (kinds, permissionKeys, isAdmin = false) =>
  kinds.load({ sourceType: "contacts.contact", companyId: COMPANY, sourceId: SOURCE, permissionKeys, isAdmin });

test("contacts.contact requires contacts.contacts.read to load", async () => {
  const { kinds } = setup({});
  await assert.rejects(load(kinds, []), (e) => e.code === "source_permission_denied");
});

test("contacts.contact schema is labeled with list fields and a valid vocabulary", () => {
  const kind = createContactsContactDocumentKind({ prisma: {} });
  const tags = new Set(kind.schema.map((e) => e.tag));
  assert.ok(kind.schema.every((e) => e.label && e.type));
  assert.ok(kind.schema.filter((e) => e.type === "list").every((e) => e.fields.length));
  assert.ok(Object.values(kind.labels).every((tag) => tags.has(tag)));
  assert.equal(kindLabels(kind).get("rfc"), "taxId");
  assert.equal(kind.moduleKey, "runly.contacts");
});

test("contacts.contact loads scalars, addresses and persons", async () => {
  const { kinds, query } = setup({
    name: "Acme", legalName: "Acme SA", type: "company", email: null, phone: "555", taxId: "RFC1", tags: ["a", "b"],
    addresses: [{ label: "Fiscal", street: "Calle 1", extNumber: "10", neighborhood: "Centro", postalCode: "01000", city: "CDMX", state: "CDMX" }],
    persons: [{ name: "Ana", role: "Compras", email: "a@example.com", phone: null }],
  });
  const data = await load(kinds, ["contacts.contacts.read"]);
  assert.deepEqual(query().where, { id: SOURCE, companyId: COMPANY, enabled: true });
  assert.equal(data.contactName, "Acme");
  assert.equal(data.email, "");
  assert.equal(data.tags, "a, b");
  assert.deepEqual(data.addresses, [{ label: "Fiscal", address: "Calle 1, #10, Centro", postalCode: "01000", city: "CDMX", state: "CDMX" }]);
  assert.equal(data.primaryAddress, "Calle 1, #10, Centro, 01000, CDMX, CDMX");
  assert.deepEqual(data.persons, [{ name: "Ana", role: "Compras", email: "a@example.com", phone: "" }]);
  assert.equal(data.primaryContactName, "Ana");
});

test("contacts.contact reports a missing contact", async () => {
  const { kinds } = setup(null);
  await assert.rejects(load(kinds, [], true), (e) => e.code === "source_not_found");
});
