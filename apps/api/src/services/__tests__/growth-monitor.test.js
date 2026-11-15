import assert from "node:assert/strict";
import test from "node:test";

import {
  createGrowthMonitorProbes,
  evaluateHttpCheck,
  evaluateSslCheck,
} from "../growth-monitor-probes.js";
import { createGrowthMonitorWorker } from "../growth-monitor-worker.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("probeHttp refuses hosts that resolve to private addresses", async () => {
  const probes = createGrowthMonitorProbes({
    resolveHost: async () => [{ address: "10.0.0.5", family: 4 }],
    request: async () => assert.fail("must not connect"),
  });
  const result = await probes.probeHttp({ url: "https://internal.example/" });
  assert.match(result.error, /publica/);
});

test("probeHttp revalidates every redirect hop", async () => {
  const hosts = { "site.example": "93.184.216.34", "evil.example": "127.0.0.1" };
  const probes = createGrowthMonitorProbes({
    resolveHost: async (host) => [{ address: hosts[host], family: 4 }],
    request: async ({ url }) =>
      url.hostname === "site.example"
        ? { statusCode: 302, location: "http://evil.example/admin" }
        : assert.fail("must not reach the internal host"),
  });
  const result = await probes.probeHttp({ url: "https://site.example/" });
  assert.match(result.error, /publica/);
});

test("probeHttp rejects non-http schemes and returns status for public hosts", async () => {
  const probes = createGrowthMonitorProbes({
    resolveHost: publicLookup,
    request: async () => ({ statusCode: 200, location: null }),
  });
  assert.match((await probes.probeHttp({ url: "ftp://site.example/" })).error, /http/);
  assert.equal((await probes.probeHttp({ url: "https://site.example/" })).statusCode, 200);
});

test("http and ssl evaluators classify results", () => {
  assert.equal(evaluateHttpCheck({ statusCode: 200, latencyMs: 50 }).state, "up");
  assert.equal(evaluateHttpCheck({ statusCode: 500, latencyMs: 50 }).ok, false);
  assert.equal(evaluateHttpCheck({ error: "boom" }).state, "down");
  assert.equal(evaluateHttpCheck({ statusCode: 200, latencyMs: 900 }, { maxLatencyMs: 500 }).state, "degraded");

  const now = new Date("2026-11-14T00:00:00Z");
  const at = (days) => new Date(now.getTime() + days * 86_400_000).toISOString();
  assert.equal(evaluateSslCheck({ authorized: true, validTo: at(90) }, {}, now).state, "up");
  assert.equal(evaluateSslCheck({ authorized: true, validTo: at(5) }, {}, now).state, "degraded");
  assert.equal(evaluateSslCheck({ authorized: true, validTo: at(-1) }, {}, now).ok, false);
  assert.equal(evaluateSslCheck({ authorized: false, authorizationError: "SELF_SIGNED", validTo: at(90) }, {}, now).ok, false);
});

function fakePrisma(monitor) {
  const db = { checks: [], incidents: [], monitor: { ...monitor } };
  return {
    db,
    membership: {
      findMany: async () => [{ userId: "u1", role: { key: "runly.admin", enabled: true, permissions: [] } }],
    },
    growthMonitorCheck: {
      create: async ({ data }) => db.checks.push(data),
      findFirst: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
    growthMonitor: {
      update: async ({ data }) => Object.assign(db.monitor, data),
    },
    growthIncident: {
      create: async ({ data }) => db.incidents.push({ id: `i${db.incidents.length}`, resolvedAt: null, ...data }),
      findFirst: async () => db.incidents.find((i) => !i.resolvedAt) ?? null,
      update: async ({ where, data }) => Object.assign(db.incidents.find((i) => i.id === where.id), data),
    },
  };
}

test("monitor opens an incident after repeated failures and closes it on recovery", async () => {
  const prisma = fakePrisma({
    id: "m1", companyId: "c1", propertyId: "p1", name: "Tienda", type: "http",
    config: { url: "https://site.example/" }, status: "unknown", consecutiveFailures: 0,
  });
  const published = [];
  let up = false;
  const worker = createGrowthMonitorWorker({
    prisma,
    notificationService: { publish: async (event) => published.push(event.input.eventType) },
    probes: { probeHttp: async () => (up ? { statusCode: 200, latencyMs: 10 } : { statusCode: 503, latencyMs: 10 }) },
    failureThreshold: 2,
  });

  await worker.checkMonitor(prisma.db.monitor);
  assert.equal(prisma.db.incidents.length, 0, "a single failure must not open an incident");
  await worker.checkMonitor(prisma.db.monitor);
  assert.equal(prisma.db.monitor.status, "down");
  assert.equal(prisma.db.incidents.length, 1);
  await worker.checkMonitor(prisma.db.monitor);
  assert.equal(prisma.db.incidents.length, 1, "no duplicate incident while down");

  up = true;
  await worker.checkMonitor(prisma.db.monitor);
  assert.equal(prisma.db.monitor.status, "up");
  assert.ok(prisma.db.incidents[0].resolvedAt);
  assert.deepEqual(published, ["growth.monitor.down", "growth.monitor.recovered"]);
});
