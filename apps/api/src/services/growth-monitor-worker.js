import dns from "node:dns";

import { resolveGrowthManagerUserIds } from "../lib/growth-managers.js";
import { publishDomainEvent } from "./domain-events/events.js";
import { decryptPassword } from "./smtp-service.js";
import {
  createGrowthMonitorProbes,
  evaluateApiCheck,
  evaluateDnsCheck,
  evaluateDomainCheck,
  evaluateHeartbeat,
  evaluateHttpCheck,
  evaluateKeywordCheck,
  evaluateSslCheck,
  evaluateTcpCheck,
  describeNetworkError,
} from "./growth-monitor-probes.js";

const CLAIM_LIMIT = 50;
const CONCURRENCY = 10;
const PROBE_DEADLINE_MS = 45_000;
const EXPIRY_THRESHOLDS = { ssl: [30, 14, 7, 3, 1], domain: [60, 30, 14, 7] };
const EXPIRY_EVENT = {
  ssl: ["growth.monitor.ssl_expiring", "Certificado SSL por vencer"],
  domain: ["growth.monitor.domain_expiring", "Dominio por vencer"],
};
const REMINDER_MS = 60 * 60 * 1000;

// Header values are stored encrypted; they are only decrypted to build the request.
function decryptHeaders(headers) {
  if (!Array.isArray(headers) || !headers.length) return undefined;
  return Object.fromEntries(headers.map((h) => [h.name, decryptPassword(h.valueEnc)]));
}

// While a maintenance window is open the monitor is not checked, recorded or alerted.
export const inMaintenance = (monitor, at = new Date()) =>
  Boolean(monitor.config?.maintenanceUntil) && new Date(monitor.config.maintenanceUntil) > at;

export function createGrowthMonitorWorker({
  prisma,
  notificationService = null,
  probes = createGrowthMonitorProbes(),
  now = () => new Date(),
  failureThreshold = Number(process.env.RUNLY_GROWTH_MONITOR_FAILURE_THRESHOLD ?? 2),
  probeDeadlineMs = PROBE_DEADLINE_MS,
  retentionDays = Number(process.env.RUNLY_GROWTH_MONITOR_RETENTION_DAYS ?? 30),
  controlHost = "cloudflare.com",
  resolveHost = dns.promises.lookup,
}) {
  let lastPruneDay = null;

  async function runProbe(monitor) {
    const config = monitor.config ?? {};
    if (monitor.type === "ssl") {
      const raw = await probes.probeSsl({ host: config.host, port: config.port ?? 443 });
      return { raw, ...evaluateSslCheck(raw, config, now()) };
    }
    if (monitor.type === "tcp") {
      const raw = await probes.probeTcp({ host: config.host, port: config.port });
      return { raw, ...evaluateTcpCheck(raw) };
    }
    if (monitor.type === "dns") {
      const raw = await probes.probeDns({ host: config.host, recordType: config.recordType ?? "A" });
      return { raw, ...evaluateDnsCheck(raw, config) };
    }
    if (monitor.type === "domain") {
      const raw = await probes.probeDomain({ host: config.host });
      return { raw, ...evaluateDomainCheck(raw, config, now()) };
    }
    if (monitor.type === "heartbeat") return { raw: null, ...evaluateHeartbeat(monitor, now()) };
    const evaluate = { keyword: evaluateKeywordCheck, api: evaluateApiCheck }[monitor.type] ?? evaluateHttpCheck;
    const probeArgs = {
      url: config.url,
      method: config.method ?? "GET",
      timeoutMs: config.timeoutMs,
      body: config.body,
      headers: decryptHeaders(config.headers),
      readBody: monitor.type === "keyword" || monitor.type === "api",
    };
    let raw = await probes.probeHttp(probeArgs);
    let evaluated = evaluate(raw, config);
    if (!evaluated.ok) {
      // One immediate retry filters transient blips before counting a failure.
      raw = await probes.probeHttp(probeArgs);
      evaluated = evaluate(raw, config);
    }
    return { raw, ...evaluated };
  }

  async function notify(monitor, eventType, title, body, priority = "high") {
    if (!notificationService?.publish) return;
    try {
      const userIds = await resolveGrowthManagerUserIds(prisma, monitor.companyId);
      if (!userIds.length) return;
      await notificationService.publish({
        companyId: monitor.companyId,
        actorId: null,
        input: {
          eventType,
          title,
          body,
          link: "/app/m/runly.growth/monitors",
          recipients: { userIds },
          channels: ["in_app", "email"],
          priority,
          sourceType: "GrowthMonitor",
          sourceId: monitor.id,
          metadata: { monitorId: monitor.id, propertyId: monitor.propertyId },
        },
      });
    } catch (error) {
      console.error(`[${eventType}]`, error?.message ?? error);
    }
  }

  // Same moments as the notifications, for Automation Studio. Best effort, never blocks a check.
  async function emit(monitor, event, { error = null, daysLeft = null } = {}) {
    try {
      const property = await prisma.growthProperty.findUnique({ where: { id: monitor.propertyId }, select: { name: true } });
      await publishDomainEvent(prisma, {
        companyId: monitor.companyId,
        event,
        payload: { id: monitor.id, monitorName: monitor.name, siteName: property?.name ?? "", monitorType: monitor.type, error: error ?? "", daysLeft },
      });
    } catch (error_) {
      console.error(`[${event}]`, error_?.message ?? error_);
    }
  }

  async function openIncident(monitorId) {
    return prisma.growthIncident.findFirst({ where: { monitorId, resolvedAt: null } });
  }

  async function applyResult(monitor, result) {
    const at = now();
    const previousStatus = monitor.status;
    await prisma.growthMonitorCheck.create({
      data: {
        companyId: monitor.companyId,
        monitorId: monitor.id,
        checkedAt: at,
        ok: result.ok,
        statusCode: result.raw?.statusCode ?? null,
        latencyMs: result.raw?.latencyMs ?? null,
        error: result.error,
        detail: result.detail,
      },
    });

    if (!result.ok) {
      const failures = (monitor.consecutiveFailures ?? 0) + 1;
      const goesDown = failures >= failureThreshold && previousStatus !== "down";
      await prisma.growthMonitor.update({
        where: { id: monitor.id },
        data: {
          consecutiveFailures: failures,
          lastError: result.error,
          ...(goesDown ? { status: "down", lastChangeAt: at } : {}),
        },
      });
      if (goesDown) {
        await prisma.growthIncident.create({
          data: { companyId: monitor.companyId, monitorId: monitor.id, startedAt: at, cause: result.error, lastNotifiedAt: at },
        });
        await notify(monitor, "growth.monitor.down", "Sitio caido", `${monitor.name}: ${result.error}`);
        await emit(monitor, "growth.monitor.down", { error: result.error });
      } else if (previousStatus === "down") {
        const incident = await openIncident(monitor.id);
        if (incident && (!incident.lastNotifiedAt || at - incident.lastNotifiedAt >= REMINDER_MS)) {
          await prisma.growthIncident.update({ where: { id: incident.id }, data: { lastNotifiedAt: at } });
          await notify(monitor, "growth.monitor.down", "Sitio sigue caido", `${monitor.name}: ${result.error}`);
        }
      }
      return;
    }

    await prisma.growthMonitor.update({
      where: { id: monitor.id },
      data: {
        consecutiveFailures: 0,
        lastError: result.error,
        status: result.state,
        ...(previousStatus !== result.state ? { lastChangeAt: at } : {}),
      },
    });
    if (previousStatus === "down") {
      const incident = await openIncident(monitor.id);
      if (incident) await prisma.growthIncident.update({ where: { id: incident.id }, data: { resolvedAt: at } });
      await notify(monitor, "growth.monitor.recovered", "Sitio recuperado", `${monitor.name} vuelve a responder.`, "medium");
      await emit(monitor, "growth.monitor.recovered");
    }
    if (EXPIRY_THRESHOLDS[monitor.type] && result.detail?.daysLeft != null) {
      // The row just written is the newest, so skip it to read the previous one.
      const previous = await prisma.growthMonitorCheck.findFirst({
        where: { monitorId: monitor.id, ok: true },
        orderBy: { checkedAt: "desc" },
        skip: 1,
        select: { detail: true },
      });
      const prevDays = previous?.detail?.daysLeft ?? Infinity;
      const crossed = EXPIRY_THRESHOLDS[monitor.type].find((t) => prevDays > t && result.detail.daysLeft <= t);
      if (crossed) {
        const [eventType, title] = EXPIRY_EVENT[monitor.type];
        await notify(monitor, eventType, title, `${monitor.name}: vence en ${result.detail.daysLeft} dias.`);
        await emit(monitor, "growth.monitor.expiring", { error: result.error, daysLeft: result.detail.daysLeft });
      }
    }
  }

  // A probe that never settles must not freeze the tick for every company: cap it.
  async function runProbeBounded(monitor) {
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ raw: null, ok: false, state: "down", error: "Tiempo de espera agotado.", detail: null }), probeDeadlineMs);
    });
    try {
      return await Promise.race([runProbe(monitor), timeout]);
    } catch (error) {
      return { raw: null, ok: false, state: "down", error: describeNetworkError(error), detail: null };
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkMonitor(monitor) {
    const result = await runProbeBounded(monitor);
    await applyResult(monitor, result);
    return result;
  }

  async function claimDue() {
    const at = now();
    const rows = await prisma.$queryRaw`
      UPDATE growth_monitor SET last_checked_at = ${at}
      WHERE id IN (
        SELECT id FROM growth_monitor
        WHERE enabled = true
          AND (last_checked_at IS NULL OR last_checked_at + interval_seconds * interval '1 second' <= ${at})
        ORDER BY last_checked_at ASC NULLS FIRST
        LIMIT ${CLAIM_LIMIT}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (!rows.length) return [];
    const monitors = await prisma.growthMonitor.findMany({ where: { id: { in: rows.map((row) => row.id) } } });
    const properties = await prisma.growthProperty.findMany({
      where: { id: { in: [...new Set(monitors.map((m) => m.propertyId))] }, enabled: true },
      select: { id: true },
    });
    const live = new Set(properties.map((p) => p.id));
    return monitors.filter((m) => live.has(m.propertyId));
  }

  async function prune() {
    const day = Math.floor(now().getTime() / 86_400_000);
    if (lastPruneDay === day) return 0;
    lastPruneDay = day;
    const cutoff = new Date(now().getTime() - retentionDays * 86_400_000);
    const { count } = await prisma.growthMonitorCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } });
    return count;
  }

  async function runOnce() {
    const monitors = (await claimDue()).filter((m) => !inMaintenance(m, now()));
    const results = [];
    for (let i = 0; i < monitors.length; i += CONCURRENCY) {
      const chunk = monitors.slice(i, i + CONCURRENCY);
      results.push(...(await Promise.all(chunk.map(async (monitor) => ({ monitor, result: await runProbeBounded(monitor) })))));
    }
    // If everything failed and a control lookup also fails, this instance lost
    // connectivity: record nothing instead of alerting about every site.
    if (results.length >= 2 && results.every((entry) => !entry.result.ok)) {
      try {
        await resolveHost(controlHost);
      } catch {
        return { checked: 0, suppressed: results.length, pruned: 0 };
      }
    }
    for (const { monitor, result } of results) {
      try {
        await applyResult(monitor, result);
      } catch (error) {
        console.error("[growth.monitor.apply]", error?.message ?? error);
      }
    }
    const pruned = await prune();
    return { checked: results.length, suppressed: 0, pruned };
  }

  return { runOnce, checkMonitor, probes };
}
