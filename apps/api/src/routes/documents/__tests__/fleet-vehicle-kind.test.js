import assert from "node:assert/strict";
import { test } from "node:test";

import { kindLabels } from "../document-template-files.js";
import { createFleetVehicleDocumentKind } from "../kinds/fleet-vehicle-kind.js";
import { createKindRegistry } from "../kinds/kind-registry.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const SOURCE = "22222222-2222-7222-8222-222222222222";

function setup(vehicle) {
  const queries = [];
  const track = (name, result) => async (args) => { queries.push([name, args.where]); return result; };
  const prisma = {
    fleetVehicle: { findFirst: track("vehicle", vehicle) },
    fleetVehicleType: { findFirst: track("type", { name: "Pick up" }) },
    fleetDriver: { findFirst: track("driver", { firstName: "Juan", lastName: "Ramírez", phone: "555", licenseNumber: "L-1", licenseExpiryDate: new Date("2027-12-01") }) },
    fleetInsurancePolicy: { findMany: track("policies", [{ insurerName: "Seguros", policyNumber: "P-1", coverageType: null, startDate: null, expiryDate: new Date("2027-01-01") }]) },
  };
  const kinds = createKindRegistry();
  kinds.register(createFleetVehicleDocumentKind({ prisma }));
  return { kinds, queries };
}

const load = (kinds, permissionKeys, isAdmin = false) =>
  kinds.load({ sourceType: "fleet.vehicle", companyId: COMPANY, sourceId: SOURCE, permissionKeys, isAdmin });

test("fleet.vehicle requires fleet.vehicles.read to load", async () => {
  const { kinds } = setup({});
  await assert.rejects(load(kinds, []), (e) => e.code === "source_permission_denied");
});

test("fleet.vehicle schema is labeled and its vocabulary points at schema tags", () => {
  const kind = createFleetVehicleDocumentKind({ prisma: {} });
  const tags = new Set(kind.schema.map((e) => e.tag));
  assert.ok(kind.schema.every((e) => e.label && e.type));
  assert.ok(Object.values(kind.labels).every((tag) => tags.has(tag)));
  assert.equal(kindLabels(kind).get("placas"), "plate");
  assert.equal(kind.schema.find((e) => e.tag === "policies").type, "list");
  assert.equal(kind.moduleKey, "runly.fleet");
});

test("fleet.vehicle loads vehicle, driver and policies scoped to the company", async () => {
  const { kinds, queries } = setup({
    id: SOURCE, plate: "ABC", brand: "Nissan", modelName: "NP300", year: 2023, vehicleTypeId: "t1", driverId: "d1",
    economicGroupNumber: "10", economicIndividualNumber: "4", status: "active", isFinanced: true, financingEndDate: null,
  });
  const data = await load(kinds, ["fleet.vehicles.read"]);
  assert.equal(data.plate, "ABC");
  assert.equal(data.year, "2023");
  assert.equal(data.vehicleType, "Pick up");
  assert.equal(data.economicNumber, "10-4");
  assert.equal(data.isFinanced, "Sí");
  assert.equal(data.driverName, "Juan Ramírez");
  assert.equal(data.policies.length, 1);
  assert.equal(data.policies[0].coverageType, "");
  assert.ok(queries.every(([, where]) => where.companyId === COMPANY));
});

test("fleet.vehicle reports a missing vehicle", async () => {
  const { kinds } = setup(null);
  await assert.rejects(load(kinds, [], true), (e) => e.code === "source_not_found");
});
