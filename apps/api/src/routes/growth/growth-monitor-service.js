import { createHash, randomBytes } from "node:crypto";

import { encryptPassword } from "../../services/smtp-service.js";
import { createGrowthMonitorDiscovery } from "./growth-monitor-discovery.js";

const DAY_MS = 86_400_000;

export const hashPingToken = (token) => createHash("sha256").update(token).digest("hex");

// Secrets never leave the API: header values and the heartbeat token hash are stripped.
export function publicMonitor(monitor) {
  if (!monitor) return monitor;
  const { headers, tokenHash, ...config } = monitor.config ?? {};
  return {
    ...monitor,
    config: {
      ...config,
      ...(headers ? { headers: headers.map((h) => ({ name: h.name, set: true })) } : {}),
      ...(tokenHash ? { hasToken: true } : {}),
    },
  };
}

// Incoming headers are either a new { name, value } or { name, keep: true } to retain the stored secret.
function buildHeaders(incoming, current = []) {
  return incoming.map((h) => {
    if (h.keep) {
      const stored = current.find((c) => c.name === h.name);
      if (!stored) throw new GrowthMonitorServiceError(`Falta el valor del encabezado ${h.name}.`, 400, "header_missing");
      return stored;
    }
    return { name: h.name, valueEnc: encryptPassword(h.value) };
  });
}

function newPingToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPingToken(token) };
}

export class GrowthMonitorServiceError extends Error {
  constructor(message, status = 400, code = "growth_monitor_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function hostFromDomain(domain) {
  try {
    return new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).hostname;
  } catch {
    return null;
  }
}

export function createGrowthMonitorService({ prisma, worker, now = () => new Date() }) {
  async function requireMonitor(companyId, id) {
    const monitor = await prisma.growthMonitor.findFirst({ where: { id, companyId } });
    if (!monitor) throw new GrowthMonitorServiceError("Monitor no encontrado.", 404, "not_found");
    return monitor;
  }

  // Idempotent: properties with a domain and no monitors get an http + ssl pair.
  async function ensureDefaultMonitors(companyId) {
    const properties = await prisma.growthProperty.findMany({
      where: { companyId, enabled: true, domain: { not: null } },
      select: { id: true, name: true, domain: true },
    });
    if (!properties.length) return;
    const existing = await prisma.growthMonitor.findMany({
      where: { companyId, propertyId: { in: properties.map((p) => p.id) } },
      select: { propertyId: true },
    });
    const covered = new Set(existing.map((m) => m.propertyId));
    for (const property of properties) {
      const host = hostFromDomain(property.domain);
      if (covered.has(property.id) || !host) continue;
      await prisma.growthMonitor.createMany({
        data: [
          { companyId, propertyId: property.id, type: "http", name: `${property.name} - disponibilidad`, config: { url: `https://${host}/`, method: "GET" } },
          { companyId, propertyId: property.id, type: "ssl", name: `${property.name} - certificado SSL`, config: { host, port: 443, warnDays: 14 } },
        ],
      });
    }
  }

  async function uptimeByMonitor(companyId, since) {
    const rows = await prisma.growthMonitorCheck.groupBy({
      by: ["monitorId", "ok"],
      where: { companyId, checkedAt: { gte: since } },
      _count: { _all: true },
    });
    const totals = new Map();
    for (const row of rows) {
      const entry = totals.get(row.monitorId) ?? { ok: 0, total: 0 };
      entry.total += row._count._all;
      if (row.ok) entry.ok += row._count._all;
      totals.set(row.monitorId, entry);
    }
    return totals;
  }

  async function listMonitors({ companyId, propertyId = null }) {
    await ensureDefaultMonitors(companyId);
    // Monitors of disabled sites stay stored but are not listed.
    const live = await prisma.growthProperty.findMany({ where: { companyId, enabled: true }, select: { id: true } });
    const monitors = await prisma.growthMonitor.findMany({
      where: { companyId, propertyId: propertyId ? { equals: propertyId, in: live.map((p) => p.id) } : { in: live.map((p) => p.id) } },
      orderBy: [{ propertyId: "asc" }, { createdAt: "asc" }],
    });
    const at = now();
    const [day, month] = await Promise.all([
      uptimeByMonitor(companyId, new Date(at.getTime() - DAY_MS)),
      uptimeByMonitor(companyId, new Date(at.getTime() - 30 * DAY_MS)),
    ]);
    const pct = (entry) => (entry?.total ? Math.round((entry.ok / entry.total) * 10000) / 100 : null);
    const latest = await Promise.all(
      monitors.map((m) =>
        prisma.growthMonitorCheck.findFirst({
          where: { monitorId: m.id },
          orderBy: { checkedAt: "desc" },
          select: { latencyMs: true, statusCode: true, detail: true },
        }),
      ),
    );
    return monitors.map((m, index) => ({
      ...publicMonitor(m),
      uptime24h: pct(day.get(m.id)),
      uptime30d: pct(month.get(m.id)),
      latestLatencyMs: latest[index]?.latencyMs ?? null,
      sslDaysLeft: m.type === "ssl" || m.type === "domain" ? latest[index]?.detail?.daysLeft ?? null : null,
    }));
  }

  async function createMonitor({ companyId, ...input }) {
    const property = await prisma.growthProperty.findFirst({ where: { id: input.propertyId, companyId, enabled: true } });
    if (!property) throw new GrowthMonitorServiceError("Sitio no encontrado.", 404, "property_not_found");
    const config = { ...input.config };
    if (config.headers) config.headers = buildHeaders(config.headers);
    let pingToken = null;
    if (input.type === "heartbeat") {
      const generated = newPingToken();
      pingToken = generated.token;
      config.tokenHash = generated.tokenHash;
    }
    const monitor = await prisma.growthMonitor.create({ data: { companyId, ...input, config } });
    // The ping token is only ever returned here and on regeneration.
    return { ...publicMonitor(monitor), ...(pingToken ? { pingToken } : {}) };
  }

  async function updateMonitor({ companyId, id, ...patch }) {
    const current = await requireMonitor(companyId, id);
    const data = { ...patch };
    if (patch.config) {
      const config = { ...current.config, ...patch.config };
      for (const key of Object.keys(config)) if (config[key] === null) delete config[key];
      if (patch.config.headers) config.headers = buildHeaders(patch.config.headers, current.config?.headers);
      data.config = config;
    }
    // Re-enabling or editing resets the state so the next check starts clean.
    if (patch.config || patch.enabled === true) Object.assign(data, { status: "unknown", consecutiveFailures: 0, lastCheckedAt: null });
    return publicMonitor(await prisma.growthMonitor.update({ where: { id }, data }));
  }

  // Maintenance only edits config; it must not reset the monitor state or open incident.
  async function setMaintenance({ companyId, id, minutes }) {
    const current = await requireMonitor(companyId, id);
    const config = { ...current.config };
    if (minutes) config.maintenanceUntil = new Date(now().getTime() + minutes * 60_000).toISOString();
    else delete config.maintenanceUntil;
    return publicMonitor(await prisma.growthMonitor.update({ where: { id }, data: { config } }));
  }

  async function regeneratePingToken({ companyId, id }) {
    const current = await requireMonitor(companyId, id);
    if (current.type !== "heartbeat") throw new GrowthMonitorServiceError("Solo los monitores de senal tienen token.", 400, "not_heartbeat");
    const { token, tokenHash } = newPingToken();
    const monitor = await prisma.growthMonitor.update({ where: { id }, data: { config: { ...current.config, tokenHash } } });
    return { ...publicMonitor(monitor), pingToken: token };
  }

  // Public ping: matches the hash only and touches nothing else. A down monitor is
  // re-queued so recovery is detected on the next tick, not after a full interval.
  async function recordPing(token) {
    const monitor = await prisma.growthMonitor.findFirst({
      where: { type: "heartbeat", enabled: true, config: { path: ["tokenHash"], equals: hashPingToken(token) } },
      select: { id: true, status: true },
    });
    if (!monitor) return false;
    await prisma.growthMonitor.update({
      where: { id: monitor.id },
      data: { lastPingAt: now(), ...(monitor.status === "down" ? { lastCheckedAt: null } : {}) },
    });
    return true;
  }

  const discovery = createGrowthMonitorDiscovery({ probes: worker.probes });
  const discoverSite = ({ url }) => discovery.discover(url);

  async function disableMonitor({ companyId, id }) {
    await requireMonitor(companyId, id);
    return prisma.growthMonitor.update({ where: { id }, data: { enabled: false, status: "paused" } });
  }

  async function checkNow({ companyId, id }) {
    const monitor = await requireMonitor(companyId, id);
    const result = await worker.checkMonitor(monitor);
    return { ok: result.ok, state: result.state, error: result.error, statusCode: result.raw?.statusCode ?? null, latencyMs: result.raw?.latencyMs ?? null, detail: result.detail };
  }

  async function listChecks({ companyId, id, from, to, limit = 200 }) {
    await requireMonitor(companyId, id);
    return prisma.growthMonitorCheck.findMany({
      where: { monitorId: id, companyId, checkedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
      orderBy: { checkedAt: "desc" },
      take: Math.min(limit, 500),
    });
  }

  async function listIncidents({ companyId, propertyId = null, limit = 50 }) {
    // Same visibility rule as the monitor list: incidents of disabled sites are not shown.
    const live = await prisma.growthProperty.findMany({ where: { companyId, enabled: true, ...(propertyId ? { id: propertyId } : {}) }, select: { id: true } });
    const monitorIds = (await prisma.growthMonitor.findMany({ where: { companyId, propertyId: { in: live.map((p) => p.id) } }, select: { id: true } })).map((m) => m.id);
    return prisma.growthIncident.findMany({
      where: { companyId, monitorId: { in: monitorIds } },
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 200),
    });
  }

  // Errors reported by the embeddable SDK from real visitors (event "client_error"), grouped.
  async function realErrors({ companyId, propertyId = null, hours = 24 }) {
    const live = await prisma.growthProperty.findMany({ where: { companyId, enabled: true, ...(propertyId ? { id: propertyId } : {}) }, select: { id: true, name: true } });
    if (!live.length) return [];
    const since = new Date(now().getTime() - hours * 3_600_000);
    const rows = await prisma.$queryRaw`
      SELECT site_id, properties->>'host' AS host, properties->>'apiPath' AS path,
             NULLIF(properties->>'status', '')::int AS status, properties->>'kind' AS kind,
             count(*)::int AS total, count(DISTINCT session_id)::int AS sessions, max(server_received_at) AS last_seen
      FROM growth_event
      WHERE company_id = ${companyId}::uuid AND site_id = ANY(${live.map((p) => p.id)}::uuid[])
        AND event_name = 'client_error' AND server_received_at >= ${since}
      GROUP BY site_id, 2, 3, 4, 5
      ORDER BY total DESC
      LIMIT 30`;
    const names = new Map(live.map((p) => [p.id, p.name]));
    return rows.map((r) => ({ siteName: names.get(r.site_id) ?? null, host: r.host, path: r.path, status: r.status, kind: r.kind, total: r.total, sessions: r.sessions, lastSeen: r.last_seen }));
  }

  return { realErrors, listMonitors, createMonitor, updateMonitor, disableMonitor, setMaintenance, regeneratePingToken, recordPing, discoverSite, checkNow, listChecks, listIncidents };
}
