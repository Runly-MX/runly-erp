import test from "node:test";
import assert from "node:assert/strict";
import { createRelationTargetsService } from "../relation-targets-service.js";

function setup({ allowed = true } = {}) {
  const contactQueries = [];
  const prisma = {
    userProfile: { findUnique: async () => ({ id: "p1" }) },
    contact: { findMany: async (args) => { contactQueries.push(args); return [{ id: "c1", name: "Ana", email: "ana@x.mx", phone: null }]; } },
    runlyModule: { findMany: async () => [{ key: "runly.fleet" }] },
  };
  const services = {
    access: { assertCompanyMember: async (_company, _profile, permission) => { if (!allowed) throw new Error(`denied ${permission}`); } },
    fleetService: { listVehicles: async ({ search }) => ({ data: [{ id: "v1", plate: "ABC-123", vehicle_brand_name: "Nissan", vehicle_model_name: "NP300", vehicle_model_year: 2022, search }] }) },
    references: { resolveReferences: async ({ refs }) => refs.filter((ref) => ref.recordId === "v1").map((ref) => ({ ...ref, title: "ABC-123", subtitle: "Nissan NP300", url: "/app/m/runly.fleet/vehicles/v1" })) },
  };
  return { service: createRelationTargetsService({ prisma, services }), contactQueries };
}

test("search is company scoped, uses the owning module and maps to {id,title,subtitle}", async () => {
  const { service, contactQueries } = setup();
  const vehicles = await service.search({ authUserId: "a1", companyId: "co1", type: "vehicle", q: "abc" });
  assert.deepEqual(vehicles, [{ id: "v1", title: "ABC-123", subtitle: "Nissan NP300 2022" }]);
  const contacts = await service.search({ authUserId: "a1", companyId: "co1", type: "contact", q: "an" });
  assert.deepEqual(contacts, [{ id: "c1", title: "Ana", subtitle: "ana@x.mx" }]);
  assert.equal(contactQueries[0].where.companyId, "co1");
  assert.equal(contactQueries[0].where.enabled, true);
});

test("search needs the target module permission and a known type", async () => {
  const { service } = setup({ allowed: false });
  await assert.rejects(service.search({ authUserId: "a1", companyId: "co1", type: "vehicle" }), { status: 403 });
  await assert.rejects(service.search({ authUserId: "a1", companyId: "co1", type: "nave" }), { status: 404 });
});

test("resolve returns only visible records; catalog marks installed modules", async () => {
  const { service } = setup();
  const found = await service.resolve({ authUserId: "a1", companyId: "co1", type: "vehicle", ids: ["v1", "v2", "v1"] });
  assert.deepEqual([...found.keys()], ["v1"]);
  assert.equal(found.get("v1").url, "/app/m/runly.fleet/vehicles/v1");
  const catalog = await service.catalog();
  assert.equal(catalog.find((entry) => entry.type === "vehicle").installed, true);
  assert.equal(catalog.find((entry) => entry.type === "contact").installed, false);
  assert.equal(catalog.length, 9);
});

test("inventory_item search passes the actor's inventory area scope to listItems", async () => {
  const scope = { all: false, roles: new Map([["area-a", "viewer"]]) };
  let received = null;
  const prisma = { userProfile: { findUnique: async () => ({ id: "p1" }) } };
  const services = {
    access: { assertCompanyMember: async () => {} },
    inventoryAccess: { scopeFor: async (identity) => { assert.equal(identity.actorId, "p1"); return scope; } },
    inventoryService: { listItems: async (args) => { received = args.scope; return { data: [{ id: "i1", name: "Laptop", assetTag: "A-1" }] }; } },
    references: {},
  };
  const service = createRelationTargetsService({ prisma, services });
  const found = await service.search({ authUserId: "a1", companyId: "co1", type: "inventory_item", q: "lap" });
  assert.equal(received, scope);
  assert.deepEqual(found, [{ id: "i1", title: "Laptop", subtitle: "A-1" }]);
});
