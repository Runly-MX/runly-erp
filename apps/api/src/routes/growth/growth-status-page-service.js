import { randomBytes } from "node:crypto";

import { GrowthMonitorServiceError } from "./growth-monitor-service.js";

const DAY_MS = 86_400_000;
const STATUS_RANK = { operational: 0, maintenance: 1, degraded: 2, outage: 3 };

const newSlug = () => randomBytes(9).toString("base64url");

const KIND_LABEL = {
  http: "Sitio web",
  keyword: "Sitio web",
  ssl: "Certificado de seguridad",
  api: "Servicio",
  heartbeat: "Proceso interno",
  domain: "Dominio",
  tcp: "Servicio",
  dns: "DNS",
};

function publicStatus(monitor, at) {
  if (monitor.config?.maintenanceUntil && new Date(monitor.config.maintenanceUntil) > at) return "maintenance";
  if (monitor.status === "down") return "outage";
  if (monitor.status === "degraded") return "degraded";
  return monitor.status === "up" ? "operational" : "unknown";
}

// Only what a visitor needs: no URLs, hosts, tokens or raw error text ever leave here.
export function createGrowthStatusPageService({ prisma, now = () => new Date() }) {
  async function requireProperty(companyId, propertyId) {
    const property = await prisma.growthProperty.findFirst({ where: { id: propertyId, companyId, enabled: true }, select: { id: true, name: true } });
    if (!property) throw new GrowthMonitorServiceError("Sitio no encontrado.", 404, "property_not_found");
    return property;
  }

  async function list({ companyId }) {
    return prisma.growthStatusPage.findMany({ where: { companyId } });
  }

  async function upsert({ companyId, propertyId, enabled, title }) {
    const property = await requireProperty(companyId, propertyId);
    const existing = await prisma.growthStatusPage.findUnique({ where: { propertyId } });
    if (existing && existing.companyId !== companyId) throw new GrowthMonitorServiceError("Sitio no encontrado.", 404, "property_not_found");
    const data = { ...(enabled !== undefined ? { enabled } : {}), ...(title ? { title } : {}) };
    return existing
      ? prisma.growthStatusPage.update({ where: { propertyId }, data })
      : prisma.growthStatusPage.create({ data: { companyId, propertyId, slug: newSlug(), title: title ?? property.name, enabled: enabled ?? false } });
  }

  async function regenerateSlug({ companyId, propertyId }) {
    await requireProperty(companyId, propertyId);
    const existing = await prisma.growthStatusPage.findFirst({ where: { propertyId, companyId } });
    if (!existing) throw new GrowthMonitorServiceError("Primero activa la pagina de estado.", 400, "no_status_page");
    return prisma.growthStatusPage.update({ where: { propertyId }, data: { slug: newSlug() } });
  }

  async function getPublic(slug) {
    const page = await prisma.growthStatusPage.findFirst({ where: { slug, enabled: true } });
    if (!page) return null;
    const at = now();
    const monitors = await prisma.growthMonitor.findMany({
      where: { propertyId: page.propertyId, companyId: page.companyId, enabled: true },
      orderBy: { createdAt: "asc" },
    });
    const since = new Date(at.getTime() - 30 * DAY_MS);
    const checks = monitors.length
      ? await prisma.growthMonitorCheck.groupBy({ by: ["monitorId", "ok"], where: { monitorId: { in: monitors.map((m) => m.id) }, checkedAt: { gte: since } }, _count: { _all: true } })
      : [];
    const totals = new Map();
    for (const row of checks) {
      const entry = totals.get(row.monitorId) ?? { ok: 0, total: 0 };
      entry.total += row._count._all;
      if (row.ok) entry.ok += row._count._all;
      totals.set(row.monitorId, entry);
    }
    const rows = monitors.map((m) => {
      const t = totals.get(m.id);
      return { id: m.id, name: m.name, kind: KIND_LABEL[m.type] ?? "Servicio", status: publicStatus(m, at), uptime30d: t?.total ? Math.round((t.ok / t.total) * 10000) / 100 : null };
    });
    const incidents = monitors.length
      ? await prisma.growthIncident.findMany({ where: { monitorId: { in: monitors.map((m) => m.id) }, startedAt: { gte: since } }, orderBy: { startedAt: "desc" }, take: 10 })
      : [];
    const names = new Map(monitors.map((m) => [m.id, m.name]));
    // A monitor in maintenance does not taint the page; it only wins when nothing else is known.
    const known = rows.filter((r) => r.status !== "unknown");
    const live = known.filter((r) => r.status !== "maintenance");
    const overall = live.length
      ? live.reduce((worst, r) => (STATUS_RANK[r.status] > STATUS_RANK[worst] ? r.status : worst), "operational")
      : known.length ? "maintenance" : "unknown";
    return {
      title: page.title,
      overall,
      updatedAt: at.toISOString(),
      monitors: rows.map(({ id, ...rest }) => rest),
      incidents: incidents.map((i) => ({
        monitorName: names.get(i.monitorId) ?? "Servicio",
        startedAt: i.startedAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
        minutes: Math.round(((i.resolvedAt ?? at) - i.startedAt) / 60000),
      })),
    };
  }

  return { list, upsert, regenerateSlug, getPublic };
}
