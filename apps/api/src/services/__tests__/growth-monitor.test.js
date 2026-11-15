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

test("keyword, api and heartbeat evaluators", async () => {
  const { evaluateKeywordCheck, evaluateApiCheck, evaluateHeartbeat } = await import("../growth-monitor-probes.js");
  const page = { statusCode: 200, latencyMs: 5, body: "<h1>Tienda</h1> Agregar al carrito" };
  assert.equal(evaluateKeywordCheck(page, { mustContain: "agregar al carrito" }).ok, true);
  assert.equal(evaluateKeywordCheck(page, { mustContain: "checkout" }).ok, false);
  assert.equal(evaluateKeywordCheck(page, { mustNotContain: "tienda" }).ok, false);
  const json = { statusCode: 200, latencyMs: 5, body: '{"data":{"ok":true}}' };
  assert.equal(evaluateApiCheck(json, { assert: { path: "data.ok", equals: true } }).ok, true);
  assert.equal(evaluateApiCheck(json, { assert: { path: "data.ok", equals: false } }).ok, false);
  assert.equal(evaluateApiCheck({ ...json, body: "<html>" }, { assert: { path: "data.ok" } }).ok, false);
  assert.equal(evaluateApiCheck({ statusCode: 401, latencyMs: 5, body: "" }, { expectedMin: 401, expectedMax: 401 }).ok, true);

  const now = new Date("2026-11-14T12:00:00Z");
  const monitor = { intervalSeconds: 300, config: { graceSeconds: 60 }, createdAt: new Date("2026-11-14T11:00:00Z") };
  assert.equal(evaluateHeartbeat({ ...monitor, lastPingAt: new Date("2026-11-14T11:57:00Z") }, now).ok, true);
  assert.equal(evaluateHeartbeat({ ...monitor, lastPingAt: new Date("2026-11-14T11:50:00Z") }, now).ok, false);
  assert.equal(evaluateHeartbeat(monitor, now).ok, false, "never pinged falls back to creation time");
});

test("probeHttp sends custom headers only to the configured host and caps nothing sensitive in errors", async () => {
  const hosts = { "a.example": "93.184.216.34", "b.example": "93.184.216.35" };
  const seen = [];
  const probes = createGrowthMonitorProbes({
    resolveHost: async (host) => [{ address: hosts[host], family: 4 }],
    request: async ({ url, headers }) => {
      seen.push({ host: url.hostname, headers });
      return url.hostname === "a.example"
        ? { statusCode: 302, location: "https://b.example/" }
        : { statusCode: 200, location: null, body: "x", headers: {} };
    },
  });
  await probes.probeHttp({ url: "https://a.example/", headers: { Authorization: "secret" }, readBody: true });
  assert.deepEqual(seen[0].headers, { Authorization: "secret" });
  assert.equal(seen[1].headers, undefined, "headers must not follow a cross-host redirect");
});

test("discovery detects the platform and ignores HTML catch-all on API paths", async () => {
  const { detectPlatform, createGrowthMonitorDiscovery } = await import("../../routes/growth/growth-monitor-discovery.js");
  assert.equal(detectPlatform({}, '<script src="https://cdn.shopify.com/x.js">'), "shopify");
  assert.equal(detectPlatform({}, "wp-content/themes"), "wordpress");
  assert.equal(detectPlatform({}, "hola"), "generic");
  let calls = 0;
  const discovery = createGrowthMonitorDiscovery({
    probes: {
      probeHttp: async ({ url }) => {
        calls += 1;
        if (url.endsWith("/")) return { statusCode: 200, headers: {}, body: "hola" };
        if (url.endsWith("/api/health")) return { statusCode: 200, headers: { "content-type": "text/html" } };
        if (url.endsWith("tienda.example/health")) return { statusCode: 200, headers: { "content-type": "application/json" } };
        if (url === "https://tienda.example/login") return { statusCode: 200, headers: { "content-type": "text/html" } };
        return { statusCode: 404, headers: {} };
      },
    },
  });
  const result = await discovery.discover("https://tienda.example");
  const names = result.suggestions.map((s) => s.name).join("|");
  assert.match(names, /estado del servidor \(\/health\)/);
  assert.doesNotMatch(names, /\/api\/health/, "SPA catch-all HTML is not a health route");
  assert.match(names, /acceso \(\/login\)/);
  assert.ok(result.suggestions.some((s) => s.type === "ssl"));
  assert.ok(calls <= 13, "request cap");
});
