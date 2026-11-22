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
    resolveHost: async () => [{ address: "127.0.0.5", family: 4 }],
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
  const db = { checks: [], incidents: [], events: [], monitor: { ...monitor } };
  return {
    db,
    growthProperty: { findUnique: async () => ({ name: "Mi tienda" }) },
    domainEventOutbox: { create: async ({ data }) => db.events.push(data) },
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
  assert.deepEqual(prisma.db.events.map((e) => e.event), ["growth.monitor.down", "growth.monitor.recovered"]);
  assert.equal(prisma.db.events[0].payload.siteName, "Mi tienda");
  assert.match(prisma.db.events[0].payload.error, /503/);
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
  const text = result.suggestions.map((s) => `${s.name} ${s.reason}`).join("|");
  assert.match(text, /estado del servidor.*ruta de salud \/health\./);
  assert.doesNotMatch(text, /\/api\/health/, "SPA catch-all HTML is not a health route");
  assert.match(text, /pagina de acceso.*\/login/);
  assert.ok(result.suggestions.every((s) => !s.name.includes("(/")), "names are public on status pages: no internal paths");
  assert.ok(result.suggestions.some((s) => s.type === "ssl"));
  assert.ok(calls <= 13, "request cap");
});

test("registrable domain, domain/tcp/dns evaluators and Spanish network errors", async () => {
  const p = await import("../growth-monitor-probes.js");
  assert.equal(p.registrableDomain("www.tienda.example.com"), "example.com");
  assert.equal(p.registrableDomain("shop.empresa.com.mx"), "empresa.com.mx");
  assert.equal(p.registrableDomain("runly.mx"), "runly.mx");
  assert.match(p.describeNetworkError({ code: "ENOTFOUND" }), /no existe/);

  const now = new Date("2026-11-14T00:00:00Z");
  const at = (d) => new Date(now.getTime() + d * 86_400_000).toISOString();
  assert.equal(p.evaluateDomainCheck({ domain: "a.com", expiresAt: at(200) }, {}, now).state, "up");
  assert.equal(p.evaluateDomainCheck({ domain: "a.com", expiresAt: at(10) }, {}, now).state, "degraded");
  assert.equal(p.evaluateDomainCheck({ domain: "a.com", expiresAt: at(-2) }, {}, now).ok, false);
  const unknown = p.evaluateDomainCheck({ domain: "a.mx", expiresAt: null }, {}, now);
  assert.ok(unknown.ok && unknown.state === "unknown", "no RDAP data is not an outage");

  assert.equal(p.evaluateTcpCheck({ connected: true }).ok, true);
  assert.equal(p.evaluateTcpCheck({ connected: false, error: "x" }).ok, false);
  assert.equal(p.evaluateDnsCheck({ values: [] }).ok, false);
  assert.equal(p.evaluateDnsCheck({ values: ["192.0.2.4"] }, { expected: "192.0.2.4" }).ok, true);
  assert.equal(p.evaluateDnsCheck({ values: ["192.0.2.4"] }, { expected: "198.51.100.9" }).ok, false);

  const probes = p.createGrowthMonitorProbes({
    resolveHost: async () => [{ address: "127.0.0.1", family: 4 }],
    rdapFetch: async (url) => ({ ok: true, json: async () => String(url).includes("iana.org") ? { services: [[["com"], ["https://rdap.example-registry.com/com/v1/"]]] } : { events: [{ eventAction: "expiration", eventDate: at(40) }] } }),
  });
  assert.equal((await probes.probeTcp({ host: "x.example", port: 25 })).connected, false, "tcp refuses private addresses");
  assert.equal((await probes.probeDomain({ host: "www.a.com" })).expiresAt, at(40));
  assert.equal((await probes.probeDomain({ host: "sitio.zz" })).noData, true, "unknown TLD is no data, not an error");
});

test("maintenance window skips checks and incidents", async () => {
  const { inMaintenance } = await import("../growth-monitor-worker.js");
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(inMaintenance({ config: { maintenanceUntil: "2026-11-14T13:00:00Z" } }, now), true);
  assert.equal(inMaintenance({ config: { maintenanceUntil: "2026-11-14T11:00:00Z" } }, now), false);
  assert.equal(inMaintenance({ config: {} }, now), false);
});

test("MirAI growth tools summarize monitors and incidents", async () => {
  const { createGrowthMiraiCapabilities } = await import("../../routes/growth/mirai-capabilities.js");
  const started = new Date("2026-11-14T10:00:00Z");
  const prisma = {
    growthMonitor: {
      findMany: async ({ where }) => where.companyId === "c1" && where.enabled
        ? [
            { id: "m1", propertyId: "p1", name: "Web", type: "http", status: "up", config: {}, lastError: null, lastCheckedAt: started },
            { id: "m2", propertyId: "p1", name: "API", type: "api", status: "down", config: {}, lastError: "Respuesta HTTP 503.", lastCheckedAt: started },
            { id: "m3", propertyId: "p1", name: "SSL", type: "ssl", status: "degraded", config: {}, lastError: "vence en 5 dias", lastCheckedAt: started },
          ]
        : [{ id: "m2", name: "API" }],
    },
    growthProperty: { findMany: async () => [{ id: "p1", name: "Mi tienda" }] },
    growthIncident: {
      findMany: async () => [{ id: "i1", monitorId: "m2", startedAt: started, resolvedAt: null, cause: "Respuesta HTTP 503." }],
      count: async () => 1,
    },
  };
  const cap = createGrowthMiraiCapabilities({ prisma });
  const status = await cap.tools.find((t) => t.name === "growth_monitors_status").run({}, { companyId: "c1" });
  assert.equal(status.total, 3);
  assert.deepEqual([status.up, status.down, status.degraded], [1, 1, 1]);
  assert.equal(status.monitores[0].estado, "down", "problems first");
  const onlyProblems = await cap.tools.find((t) => t.name === "growth_monitors_status").run({ onlyProblems: true }, { companyId: "c1" });
  assert.equal(onlyProblems.monitores.length, 2);
  const incidents = await cap.tools.find((t) => t.name === "growth_incidents_recent").run({}, { companyId: "c1" });
  assert.equal(incidents.abiertos, 1);
  assert.equal(incidents.incidentes[0].monitor, "API");
  assert.ok(cap.tools.every((t) => t.permission === "growth.access"));
});

test("review fixes: hard deadline against a slow-drip server", async () => {
  const http = await import("node:http");
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    const timer = setInterval(() => res.write("x"), 100); // keeps the idle timeout alive forever
    res.on("close", () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const probes = createGrowthMonitorProbes({ allowPrivate: true });
  const started = Date.now();
  const result = await probes.probeHttp({ url: `http://127.0.0.1:${server.address().port}/`, timeoutMs: 600, readBody: true });
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  assert.ok(Date.now() - started < 3000, "must give up near the deadline, not drip forever");
  assert.match(result.error, /agotado|aborted|socket/i);
});

test("review fixes: worker bounds a probe that never settles", async () => {
  const prisma = fakePrisma({ id: "m1", companyId: "c1", propertyId: "p1", name: "Lento", type: "http", config: { url: "https://x.example/" }, status: "unknown", consecutiveFailures: 0 });
  const worker = createGrowthMonitorWorker({ prisma, probes: { probeHttp: () => new Promise(() => {}) }, probeDeadlineMs: 50, failureThreshold: 1 });
  const started = Date.now();
  const result = await worker.checkMonitor(prisma.db.monitor);
  assert.ok(Date.now() - started < 2000);
  assert.equal(result.ok, false);
  assert.match(result.error, /agotado/);
});

test("review fixes: custom headers are not re-sent after an https to http redirect", async () => {
  const seen = [];
  const probes = createGrowthMonitorProbes({
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    request: async ({ url, headers }) => {
      seen.push({ proto: url.protocol, headers });
      return url.protocol === "https:" ? { statusCode: 301, location: "http://a.example/" } : { statusCode: 200, location: null };
    },
  });
  await probes.probeHttp({ url: "https://a.example/", headers: { Authorization: "secret" } });
  assert.deepEqual(seen.map((s) => s.proto), ["https:", "http:"]);
  assert.equal(seen[1].headers, undefined);
});

test("review fixes: DNS monitor never returns private A/AAAA answers", async () => {
  const probes = createGrowthMonitorProbes({ resolveDns: async () => ["127.0.0.5", "8.8.8.8", "fd00::1"] });
  assert.deepEqual((await probes.probeDns({ host: "x.example", recordType: "A" })).values, ["8.8.8.8"]);
  const txt = createGrowthMonitorProbes({ resolveDns: async () => [["v=spf1 -all"]] });
  assert.deepEqual((await txt.probeDns({ host: "x.example", recordType: "TXT" })).values, ["v=spf1 -all"]);
});

test("review fixes: editing or disabling a down monitor closes its incident and hides secrets", async () => {
  const { createGrowthMonitorService } = await import("../../routes/growth/growth-monitor-service.js");
  const closed = [];
  const row = { id: "m1", companyId: "c1", propertyId: "p1", type: "api", name: "api", enabled: true, status: "down", config: { url: "https://a.example/", headers: [{ name: "Authorization", valueEnc: "ENC" }], tokenHash: "H" } };
  const prisma = {
    growthMonitor: { findFirst: async () => row, update: async ({ data }) => ({ ...row, ...data }) },
    growthIncident: { updateMany: async (args) => closed.push(args.where.monitorId) },
  };
  const service = createGrowthMonitorService({ prisma, worker: { probes: {} } });
  const disabled = await service.disableMonitor({ companyId: "c1", id: "m1" });
  assert.equal(JSON.stringify(disabled).includes("ENC"), false, "no encrypted header value in the response");
  assert.equal(JSON.stringify(disabled).includes("tokenHash"), false);
  await service.updateMonitor({ companyId: "c1", id: "m1", config: { url: "https://b.example/" } });
  assert.deepEqual(closed, ["m1", "m1"]);
});

test("domain without RDAP data uses the manual expiry date the owner typed", async () => {
  const { evaluateDomainCheck } = await import("../growth-monitor-probes.js");
  const now = new Date("2026-11-14T00:00:00Z");
  const noData = { domain: "tienda.mx", expiresAt: null, noData: true };
  assert.equal(evaluateDomainCheck(noData, {}, now).state, "unknown");
  const manual = evaluateDomainCheck(noData, { manualExpiry: "2027-06-01" }, now);
  assert.ok(manual.ok && manual.state === "up" && manual.detail.manual === true);
  assert.equal(evaluateDomainCheck(noData, { manualExpiry: "2026-11-20" }, now).state, "degraded");
  assert.equal(evaluateDomainCheck(noData, { manualExpiry: "2026-11-01" }, now).ok, false);
  const withData = evaluateDomainCheck({ domain: "a.com", expiresAt: "2028-01-01T00:00:00Z" }, { manualExpiry: "2026-11-20" }, now);
  assert.equal(withData.state, "up", "the registry date wins over the manual one");
});

test("error spike worker alerts once per route per cooldown and only for live sites", async () => {
  const { createGrowthErrorSpikeWorker } = await import("../growth-error-spike-worker.js");
  const claimed = new Map();
  const published = [];
  const events = [];
  const spike = { company_id: "c1", site_id: "p1", host: "api.tienda.mx", path: "/api/orders/:id", status: 503, kind: "http", reports: 9, visitors: 4 };
  const prisma = {
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      if (sql.includes("FROM growth_event")) return [spike, { ...spike, site_id: "p2" }];
      // claim: values = [companyId, siteId, routeKey, at, at, cutoff]
      const key = `${values[1]}|${values[2]}`;
      const last = claimed.get(key);
      if (last && last > values[5]) return [];
      claimed.set(key, values[3]);
      return [{ id: "a1" }];
    },
    $executeRaw: async () => 0,
    growthProperty: { findMany: async () => [{ id: "p1", name: "Mi tienda" }] },
    membership: { findMany: async () => [{ userId: "u1", role: { key: "runly.admin", enabled: true, permissions: [] } }] },
    domainEventOutbox: { create: async ({ data }) => events.push(data) },
  };
  let clock = new Date("2026-11-14T12:00:00Z");
  const worker = createGrowthErrorSpikeWorker({
    prisma, now: () => clock, cooldownMinutes: 60,
    notificationService: { publish: async (e) => published.push(e.input.eventType + ":" + e.input.body) },
  });
  const first = await worker.runOnce();
  assert.deepEqual(first, { spikes: 2, alerted: 1 }, "the disabled site p2 is ignored");
  assert.match(published[0], /growth.errors.spike:Mi tienda: 4 visitantes tuvieron error 503 en api.tienda.mx\/api\/orders\/:id/);
  assert.equal(events[0].event, "growth.errors.spike");
  assert.equal(events[0].payload.visitors, 4);
  clock = new Date("2026-11-14T12:20:00Z");
  assert.equal((await worker.runOnce()).alerted, 0, "inside the cooldown");
  clock = new Date("2026-11-14T13:30:00Z");
  assert.equal((await worker.runOnce()).alerted, 1, "after the cooldown it alerts again");
});

test("alerts also reach the property's extra users (still members) and external addresses by email", async () => {
  const prisma = fakePrisma({
    id: "m1", companyId: "c1", propertyId: "p1", name: "Tienda", type: "http",
    config: { url: "https://site.example/" }, status: "unknown", consecutiveFailures: 0,
  });
  prisma.growthProperty.findFirst = async () => ({ alertUserIds: ["u2", "u3"], alertEmails: ["dueno@example.mx"] });
  prisma.membership.findMany = async ({ where }) => (where.userId
    ? [{ userId: "u2" }] // u3 left the company
    : [{ userId: "u1", role: { key: "runly.admin", enabled: true, permissions: [] } }]);
  prisma.company = { findUnique: async () => ({ name: "Dimare", brandingConfig: { primaryColor: "#123456" } }) };
  const recipients = [], mails = [];
  const worker = createGrowthMonitorWorker({
    prisma,
    notificationService: { publish: async (event) => recipients.push(event.input.recipients.userIds) },
    sendMail: async (mail) => mails.push(mail),
    probes: { probeHttp: async () => ({ statusCode: 503, latencyMs: 10 }) },
    failureThreshold: 1,
  });
  await worker.checkMonitor(prisma.db.monitor);
  assert.deepEqual(recipients, [["u1", "u2"]])
  assert.equal(mails.length, 1)
  assert.equal(mails[0].to, "dueno@example.mx")
  assert.equal(mails[0].subject, "Caído: Tienda")
  assert.equal(mails[0].companyId, "c1")
  assert.doesNotMatch(mails[0].html, /Ver monitor/, "external recipients have no Runly account")
  assert.match(mails[0].html, /Dimare te agregó como contacto/)
});
