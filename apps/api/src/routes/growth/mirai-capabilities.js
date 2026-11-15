// apps/api/src/routes/growth/mirai-capabilities.js
//
// runly.growth capability shared by MirAI and the MCP server: read-only view of the
// site monitors (is anything down, expiring certificates/domains, recent incidents).
// Totals are computed here from the rows, never by the model.
const MAX_ROWS = 30;
const SEVERITY = { down: 0, degraded: 1, unknown: 2, up: 3, paused: 4 };

export function createGrowthMiraiCapabilities({ prisma }) {
  const tools = [
    {
      name: "growth_monitors_status",
      permission: "growth.access",
      definition: {
        description: "Estado de los monitores de sitios web de Growth (disponibilidad, SSL, dominio, API, procesos): cuantos estan en linea, caidos o con advertencia, y la lista de los que tienen problemas primero. Opcional: onlyProblems para ver solo los que fallan.",
        parameters: { type: "object", properties: { onlyProblems: { type: "boolean", description: "Solo monitores caidos o con advertencia." } } },
      },
      async run(args, actx) {
        const monitors = await prisma.growthMonitor.findMany({ where: { companyId: actx.companyId, enabled: true } });
        const properties = await prisma.growthProperty.findMany({
          where: { id: { in: [...new Set(monitors.map((m) => m.propertyId))] } },
          select: { id: true, name: true },
        });
        const siteName = new Map(properties.map((p) => [p.id, p.name]));
        const counts = { up: 0, down: 0, degraded: 0, unknown: 0 };
        for (const m of monitors) if (m.status in counts) counts[m.status] += 1;
        const rows = monitors
          .filter((m) => !args?.onlyProblems || ["down", "degraded"].includes(m.status))
          .sort((a, b) => (SEVERITY[a.status] ?? 5) - (SEVERITY[b.status] ?? 5))
          .slice(0, MAX_ROWS)
          .map((m) => ({
            monitorId: m.id, nombre: m.name, sitio: siteName.get(m.propertyId) ?? null, tipo: m.type, estado: m.status,
            detalle: m.lastError ?? null, ultimaRevision: m.lastCheckedAt?.toISOString() ?? null,
            enMantenimiento: Boolean(m.config?.maintenanceUntil && new Date(m.config.maintenanceUntil) > new Date()),
          }));
        return { total: monitors.length, ...counts, monitores: rows };
      },
    },
    {
      name: "growth_incidents_recent",
      permission: "growth.access",
      definition: {
        description: "Incidentes recientes de los monitores de Growth (caidas), abiertos primero, con inicio, fin y causa. Opcional: limit (maximo 30).",
        parameters: { type: "object", properties: { limit: { type: "number", description: "Cuantos devolver (1-30, por defecto 10)." } } },
      },
      async run(args, actx) {
        const limit = Math.min(Math.max(Number(args?.limit) || 10, 1), MAX_ROWS);
        const [openRows, total] = await Promise.all([
          prisma.growthIncident.findMany({ where: { companyId: actx.companyId }, orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { startedAt: "desc" }], take: limit }),
          prisma.growthIncident.count({ where: { companyId: actx.companyId, resolvedAt: null } }),
        ]);
        const monitors = await prisma.growthMonitor.findMany({
          where: { id: { in: [...new Set(openRows.map((i) => i.monitorId))] } },
          select: { id: true, name: true },
        });
        const name = new Map(monitors.map((m) => [m.id, m.name]));
        return {
          abiertos: total,
          incidentes: openRows.map((i) => ({
            incidentId: i.id, monitor: name.get(i.monitorId) ?? null, inicio: i.startedAt.toISOString(),
            fin: i.resolvedAt?.toISOString() ?? null, minutos: Math.round(((i.resolvedAt ?? new Date()) - i.startedAt) / 60000), causa: i.cause ?? null,
          })),
        };
      },
    },
  ];

  return {
    moduleKey: "runly.growth",
    label: "Growth",
    summary: "Estado de los monitores de sitios web: caidas, SSL y dominios por vencer, incidentes.",
    tools,
    actions: [],
    publicLookup: [],
    async describeContext() { return null; },
  };
}
