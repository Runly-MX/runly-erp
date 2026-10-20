import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createChatEntitySearchService } from "../chat-entity-search-service.js";

function build({ allowed = true } = {}) {
  const calls = [];
  const prisma = {
    userProfile: { findUnique: async () => ({ id: "p1" }) },
    // user-access-service reads membership/permissions through these.
    invItem: { findMany: async (args) => { calls.push(args); return [{ id: "i1", name: "Laptop", assetTag: "INV-1", serialNumber: "SN123", status: "available", category: { name: "Cómputo" }, brand: { name: "Dell" } }]; } },
  };
  const svc = createChatEntitySearchService({ prisma, fleetService: {} });
  return { svc, calls, allowed };
}

describe("chat-entity-search-service", () => {
  it("returns nothing for an unknown entity type", async () => {
    const { svc } = build();
    assert.deepEqual(await svc.search({ authUserId: "a", companyId: "c", entityType: "nope", q: "x" }), []);
  });

  it("is limited to the types with server-side search", () => {
    const { svc } = build();
    assert.ok(svc.SEARCHABLE_TYPES.includes("purchase_order"));
    assert.ok(svc.SEARCHABLE_TYPES.includes("inventory_item"));
  });
});
