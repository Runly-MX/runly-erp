const DAY_MS = 86_400_000;

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
    const monitors = await prisma.growthMonitor.findMany({
      where: { companyId, ...(propertyId ? { propertyId } : {}) },
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
      ...m,
      uptime24h: pct(day.get(m.id)),
      uptime30d: pct(month.get(m.id)),
      latestLatencyMs: latest[index]?.latencyMs ?? null,
      sslDaysLeft: m.type === "ssl" ? latest[index]?.detail?.daysLeft ?? null : null,
    }));
  }

  async function createMonitor({ companyId, ...input }) {
    const property = await prisma.growthProperty.findFirst({ where: { id: input.propertyId, companyId, enabled: true } });
    if (!property) throw new GrowthMonitorServiceError("Sitio no encontrado.", 404, "property_not_found");
    return prisma.growthMonitor.create({ data: { companyId, ...input } });
  }

  async function updateMonitor({ companyId, id, ...patch }) {
    const current = await requireMonitor(companyId, id);
    const data = { ...patch };
    if (patch.config) data.config = { ...current.config, ...patch.config };
    // Re-enabling or editing resets the state so the next check starts clean.
    if (patch.config || patch.enabled === true) Object.assign(data, { status: "unknown", consecutiveFailures: 0, lastCheckedAt: null });
    return prisma.growthMonitor.update({ where: { id }, data });
  }

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
    const monitorIds = propertyId
      ? (await prisma.growthMonitor.findMany({ where: { companyId, propertyId }, select: { id: true } })).map((m) => m.id)
      : null;
    return prisma.growthIncident.findMany({
      where: { companyId, ...(monitorIds ? { monitorId: { in: monitorIds } } : {}) },
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 200),
    });
  }

  return { listMonitors, createMonitor, updateMonitor, disableMonitor, checkNow, listChecks, listIncidents };
}
