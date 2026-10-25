import assert from "node:assert/strict";
import { test } from "node:test";

import { createKindRegistry } from "../kinds/kind-registry.js";
import { DocumentProviderError } from "../document-provider-registry.js";
import { createGrowthLeadDocumentProvider } from "../providers/growth-lead-provider.js";

function kind(overrides = {}) {
  return {
    key: "test.record",
    permissionKey: "test.records.read",
    schema: [{ tag: "name", label: "Nombre", type: "text" }],
    load: async () => ({ name: "Ana" }),
    ...overrides,
  };
}

test("rejects kinds missing key, schema, permissionKey or load with a Spanish error", () => {
  for (const field of ["key", "schema", "permissionKey", "load"]) {
    const registry = createKindRegistry();
    assert.throws(
      () => registry.register(kind({ [field]: undefined })),
      (err) => err instanceof DocumentProviderError && /tipo de documento/i.test(err.message),
    );
  }
});

test("validates schema entries (tag, label and allowed type)", () => {
  const registry = createKindRegistry();
  assert.throws(() => registry.register(kind({ schema: [{ tag: "x", label: "X", type: "bool" }] })), /tipo/i);
  assert.throws(() => registry.register(kind({ schema: [{ label: "X", type: "text" }] })), /etiqueta/i);
  assert.throws(() => registry.register(kind({ schema: [{ tag: "x", type: "text" }] })), /nombre/i);
});

test("getKind returns the kind and rejects duplicates", () => {
  const registry = createKindRegistry();
  registry.register(kind());
  assert.equal(registry.getKind("test.record").key, "test.record");
  assert.equal(registry.getKind("nope"), null);
  assert.throws(() => registry.register(kind()), (err) => err.status === 409);
  assert.deepEqual(registry.listKinds().map((k) => k.key), ["test.record"]);
});

test("checks the kind permission before loading data", async () => {
  const registry = createKindRegistry();
  registry.register(kind());
  assert.deepEqual(await registry.load({ sourceType: "test.record", sourceId: "1", permissionKeys: ["test.records.read"] }), { name: "Ana" });
  await assert.rejects(registry.load({ sourceType: "test.record", sourceId: "1", permissionKeys: [] }), (err) => err.status === 403);
});

test("legacy providers register as kinds keyed by sourceType", () => {
  const registry = createKindRegistry();
  registry.register(createGrowthLeadDocumentProvider({ prisma: {} }));
  const growth = registry.getKind("growth.lead");
  assert.ok(growth.schema.length > 10);
  assert.ok(growth.schema.every((entry) => entry.tag && entry.label && entry.type));
  assert.equal(registry.getSchema({ sourceType: "growth.lead", isAdmin: true }).sourceType, "growth.lead");
});
