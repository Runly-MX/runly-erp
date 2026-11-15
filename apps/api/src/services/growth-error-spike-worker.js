import { resolveGrowthManagerUserIds } from "../lib/growth-managers.js";
import { publishDomainEvent } from "./domain-events/events.js";

const env = (name, fallback) => Number(process.env[name] ?? fallback);

// Alerts when real visitors hit the same failing route over and over: at least
// `minReports` reports from `minVisitors` different visitors inside `windowMinutes`.
// The SDK already collapses repeats per page per minute, so reports ~ page-minutes.
// One alert per site+route per cooldown, claimed atomically so two workers never both send it.
export function createGrowthErrorSpikeWorker({
  prisma,
  notificationService = null,
  now = () => new Date(),
  windowMinutes = env("RUNLY_GROWTH_ERROR_SPIKE_WINDOW_MINUTES", 10),
  minReports = env("RUNLY_GROWTH_ERROR_SPIKE_MIN_REPORTS", 5),
  minVisitors = env("RUNLY_GROWTH_ERROR_SPIKE_MIN_VISITORS", 3),
  cooldownMinutes = env("RUNLY_GROWTH_ERROR_SPIKE_COOLDOWN_MINUTES", 60),
}) {
  async function claim(row, at) {
    const routeKey = `${row.host ?? ""}|${row.path ?? ""}|${row.status ?? row.kind ?? ""}`.slice(0, 300);
    const cutoff = new Date(at.getTime() - cooldownMinutes * 60_000);
    const claimed = await prisma.$queryRaw`
      INSERT INTO growth_error_alert (company_id, property_id, route_key, last_notified_at)
      VALUES (${row.company_id}::uuid, ${row.site_id}::uuid, ${routeKey}, ${at})
      ON CONFLICT (property_id, route_key) DO UPDATE SET last_notified_at = ${at}
        WHERE growth_error_alert.last_notified_at < ${cutoff}
      RETURNING id`;
    return claimed.length > 0;
  }

  async function runOnce() {
    const at = now();
    const since = new Date(at.getTime() - windowMinutes * 60_000);
    const rows = await prisma.$queryRaw`
      SELECT company_id, site_id, properties->>'host' AS host, properties->>'apiPath' AS path,
             CASE WHEN properties->>'status' ~ '^[0-9]{1,3}$' THEN (properties->>'status')::int END AS status,
             properties->>'kind' AS kind, count(*)::int AS reports, count(DISTINCT session_id)::int AS visitors
      FROM growth_event
      WHERE event_name = 'client_error' AND server_received_at >= ${since}
      GROUP BY 1, 2, 3, 4, 5, 6
      HAVING count(*) >= ${minReports} AND count(DISTINCT session_id) >= ${minVisitors}
      ORDER BY reports DESC
      LIMIT 100`;
    await prisma.$executeRaw`DELETE FROM growth_error_alert WHERE last_notified_at < ${new Date(at.getTime() - 7 * 86_400_000)}`;
    if (!rows.length) return { spikes: 0, alerted: 0 };

    const properties = await prisma.growthProperty.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.site_id))] }, enabled: true },
      select: { id: true, name: true },
    });
    const siteName = new Map(properties.map((p) => [p.id, p.name]));
    let alerted = 0;
    for (const row of rows) {
      if (!siteName.has(row.site_id)) continue;
      if (!(await claim(row, at))) continue;
      alerted += 1;
      const what = row.status ? `error ${row.status}` : "sin conexion con el servidor";
      const route = `${row.host ?? ""}${row.path ?? ""}`;
      try {
        if (notificationService?.publish) {
          const userIds = await resolveGrowthManagerUserIds(prisma, row.company_id);
          if (userIds.length) {
            await notificationService.publish({
              companyId: row.company_id,
              actorId: null,
              input: {
                eventType: "growth.errors.spike",
                title: "Tus visitantes estan viendo errores",
                body: `${siteName.get(row.site_id)}: ${row.visitors} visitantes tuvieron ${what} en ${route} (${row.reports} reportes en ${windowMinutes} min).`,
                link: "/app/m/runly.growth/monitors",
                recipients: { userIds },
                channels: ["in_app", "email"],
                priority: "high",
                sourceType: "GrowthProperty",
                sourceId: row.site_id,
                metadata: { propertyId: row.site_id, host: row.host, path: row.path, status: row.status },
              },
            });
          }
        }
      } catch (error) {
        console.error("[growth.errors.spike]", error?.message ?? error);
      }
      await publishDomainEvent(prisma, {
        companyId: row.company_id,
        event: "growth.errors.spike",
        payload: {
          id: row.site_id, siteName: siteName.get(row.site_id), host: row.host ?? "", path: row.path ?? "",
          status: row.status ?? null, reports: row.reports, visitors: row.visitors, windowMinutes,
        },
      });
    }
    return { spikes: rows.length, alerted };
  }

  return { runOnce };
}
