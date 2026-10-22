import test from "node:test";
import assert from "node:assert/strict";
import { buildInsights } from "../fleet-dashboard-service.js";

const base = () => ({
  totals: { maintenance: 0 },
  maintenanceDue: [],
  recurrentFailures: [],
  costTrend: { recent: 0, baseline: 0 },
  insurance: { expired: 0, expiringSoon: 0, uncovered: 0, upcoming: [] },
  licenses: { expired: 0, expiringSoon: 0, upcoming: [] },
  assignment: { vehiclesWithoutDriver: 0, driversWithoutVehicle: 0 },
});

test("a healthy fleet yields a single all-good insight", () => {
  const out = buildInsights(base());
  assert.deepEqual(out.map((i) => i.id), ["all-good"]);
});

test("critical insights sort before warnings and info", () => {
  const d = base();
  d.assignment.vehiclesWithoutDriver = 2;
  d.maintenanceDue = [
    { vehicleId: "a", plate: "AAA", daysLeft: -3 },
    { vehicleId: "b", plate: "BBB", daysLeft: 5 },
  ];
  d.recurrentFailures = [{ vehicleId: "c", plate: "CCC", failures: 3 }];
  const out = buildInsights(d);
  assert.equal(out[0].id, "service-overdue");
  assert.equal(out[0].severity, "critical");
  assert.equal(out.at(-1).id, "no-driver");
  assert.ok(out.some((i) => i.id === "service-soon"));
  assert.ok(out.some((i) => i.id === "failures-c"));
});

test("cost spike needs both a baseline and a material amount", () => {
  const d = base();
  d.costTrend = { recent: 500, baseline: 100 };
  assert.ok(!buildInsights(d).some((i) => i.id === "cost-spike"));
  d.costTrend = { recent: 9000, baseline: 3000 };
  assert.ok(buildInsights(d).some((i) => i.id === "cost-spike"));
});
