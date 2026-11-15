import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { GrowthMonitorServiceError } from "./growth-monitor-service.js";

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), "La URL debe empezar con http:// o https://");

const configSchema = z.object({
  url: httpUrl.optional(),
  host: z.string().trim().min(1).max(253).optional(),
  method: z.enum(["GET", "HEAD"]).optional(),
  expectedMin: z.number().int().min(100).max(599).optional(),
  expectedMax: z.number().int().min(100).max(599).optional(),
  maxLatencyMs: z.number().int().min(100).max(60000).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
  warnDays: z.number().int().min(1).max(90).optional(),
  mustContain: z.string().trim().min(1).max(500).optional(),
  mustNotContain: z.string().trim().min(1).max(500).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  headers: z
    .array(
      z.object({
        name: z.string().trim().regex(/^[A-Za-z0-9-]{1,64}$/, "Nombre de encabezado invalido."),
        value: z.string().max(2000).optional(),
        keep: z.boolean().optional(),
      }).refine((h) => h.keep || h.value, { message: "Falta el valor del encabezado." }),
    )
    .max(5)
    .optional(),
  assert: z.object({ path: z.string().trim().min(1).max(200), equals: z.unknown().optional() }).optional(),
  graceSeconds: z.number().int().min(0).max(86400).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  recordType: z.enum(["A", "AAAA", "CNAME", "MX", "TXT"]).optional(),
  expected: z.string().trim().min(1).max(500).optional(),
  manualExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.").optional(),
});

// On update, null clears an optional field (see service).
const clearable = (schema) => schema.nullable().optional();
const updateConfigSchema = configSchema.extend({
  assert: clearable(configSchema.shape.assert.unwrap()),
  mustContain: clearable(configSchema.shape.mustContain.unwrap()),
  mustNotContain: clearable(configSchema.shape.mustNotContain.unwrap()),
  expected: clearable(configSchema.shape.expected.unwrap()),
  manualExpiry: clearable(configSchema.shape.manualExpiry.unwrap()),
});

const intervalSeconds = z.number().int().min(60).max(86400);

export const growthMonitorCreateSchema = z
  .object({
    propertyId: z.string().uuid(),
    type: z.enum(["http", "ssl", "keyword", "api", "heartbeat", "domain", "tcp", "dns"]),
    name: z.string().trim().min(1).max(200),
    config: configSchema,
    intervalSeconds: intervalSeconds.optional(),
  })
  .refine(
    (v) => {
      if (["ssl", "domain", "dns"].includes(v.type)) return Boolean(v.config.host);
      if (v.type === "tcp") return Boolean(v.config.host && v.config.port);
      if (v.type === "heartbeat") return true;
      if (v.type === "keyword") return Boolean(v.config.url) && Boolean(v.config.mustContain || v.config.mustNotContain);
      return Boolean(v.config.url);
    },
    { message: "Faltan datos del monitor: URL, host o texto a buscar segun el tipo.", path: ["config"] },
  );

const discoverSchema = z.object({ url: z.string().trim().min(3).max(2000) });

export const growthMonitorUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    config: updateConfigSchema.optional(),
    intervalSeconds: intervalSeconds.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Sin cambios." });

const maintenanceSchema = z.object({ minutes: z.number().int().min(1).max(1440).nullable() });
const listQuerySchema = z.object({ propertyId: z.string().uuid().optional() });
const realErrorsQuerySchema = z.object({ propertyId: z.string().uuid().optional(), hours: z.coerce.number().int().min(1).max(168).optional() });
const checksQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function handleError(c, error) {
  if (error instanceof GrowthMonitorServiceError) {
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  console.error("[runly.growth.monitors]", error);
  return c.json({ error: "Error interno de monitores Growth." }, 500);
}

// Per-company cap on "check now" so the instance cannot be used as a request cannon.
function createCheckNowLimiter({ max = 10, windowMs = 60_000, now = Date.now } = {}) {
  const hits = new Map();
  return (companyId) => {
    // Keys can be attacker-chosen (ping tokens): drop stale entries so the map cannot grow without bound.
    if (hits.size > 5000) for (const [key, times] of hits) if (now() - times[times.length - 1] >= windowMs) hits.delete(key);
    const recent = (hits.get(companyId) ?? []).filter((t) => now() - t < windowMs);
    if (recent.length >= max) return false;
    hits.set(companyId, [...recent, now()]);
    return true;
  };
}

export function createGrowthMonitorRoutes({ service, requirePermission }) {
  const app = new Hono();
  const allowCheckNow = createCheckNowLimiter();
  const companyId = (c) => c.get("companyId") ?? null;
  const allowDiscover = createCheckNowLimiter({ max: 6 });
  const run = (handler) => async (c) => {
    try {
      return await handler(c);
    } catch (error) {
      return handleError(c, error);
    }
  };

  app.get("/growth/monitors", requirePermission("growth.access"), zValidator("query", listQuerySchema), run(async (c) =>
    c.json({ data: await service.listMonitors({ companyId: companyId(c), ...c.req.valid("query") }) })));

  app.post("/growth/monitors", requirePermission("growth.properties.manage"), zValidator("json", growthMonitorCreateSchema), run(async (c) =>
    c.json({ data: await service.createMonitor({ companyId: companyId(c), ...c.req.valid("json") }) }, 201)));

  app.patch("/growth/monitors/:id", requirePermission("growth.properties.manage"), zValidator("json", growthMonitorUpdateSchema), run(async (c) =>
    c.json({ data: await service.updateMonitor({ companyId: companyId(c), id: c.req.param("id"), ...c.req.valid("json") }) })));

  app.delete("/growth/monitors/:id", requirePermission("growth.properties.manage"), run(async (c) =>
    c.json({ data: await service.disableMonitor({ companyId: companyId(c), id: c.req.param("id") }) })));

  app.post("/growth/monitors/:id/check", requirePermission("growth.properties.manage"), run(async (c) => {
    if (!allowCheckNow(companyId(c))) {
      return c.json({ error: "Demasiadas pruebas seguidas. Intenta en un minuto.", code: "rate_limited" }, 429);
    }
    return c.json({ data: await service.checkNow({ companyId: companyId(c), id: c.req.param("id") }) });
  }));

  app.post("/growth/monitors/discover", requirePermission("growth.properties.manage"), zValidator("json", discoverSchema), run(async (c) => {
    if (!allowDiscover(companyId(c))) {
      return c.json({ error: "Demasiadas detecciones seguidas. Intenta en un minuto.", code: "rate_limited" }, 429);
    }
    return c.json({ data: await service.discoverSite(c.req.valid("json")) });
  }));

  app.post("/growth/monitors/:id/maintenance", requirePermission("growth.properties.manage"), zValidator("json", maintenanceSchema), run(async (c) =>
    c.json({ data: await service.setMaintenance({ companyId: companyId(c), id: c.req.param("id"), ...c.req.valid("json") }) })));

  app.post("/growth/monitors/:id/token", requirePermission("growth.properties.manage"), run(async (c) =>
    c.json({ data: await service.regeneratePingToken({ companyId: companyId(c), id: c.req.param("id") }) })));

  app.get("/growth/monitors/:id/checks", requirePermission("growth.access"), zValidator("query", checksQuerySchema), run(async (c) =>
    c.json({ data: await service.listChecks({ companyId: companyId(c), id: c.req.param("id"), ...c.req.valid("query") }) })));

  app.get("/growth/real-errors", requirePermission("growth.access"), zValidator("query", realErrorsQuerySchema), run(async (c) =>
    c.json({ data: await service.realErrors({ companyId: companyId(c), ...c.req.valid("query") }) })));

  app.get("/growth/incidents", requirePermission("growth.access"), zValidator("query", listQuerySchema), run(async (c) =>
    c.json({ data: await service.listIncidents({ companyId: companyId(c), ...c.req.valid("query") }) })));

  return app;
}

// Public, unauthenticated heartbeat endpoint: the token is the credential. Unknown and
// known tokens answer identically so tokens cannot be enumerated.
export function createGrowthMonitorPingRoutes({ service }) {
  const app = new Hono();
  const allowPing = createCheckNowLimiter({ max: 60 });
  const allowAnyPing = createCheckNowLimiter({ max: 1200 });
  const ping = async (c) => {
    const token = c.req.param("token");
    // Global cap first: random tokens would otherwise bypass the per-token limit.
    if (token.length > 100 || !allowAnyPing("all") || !allowPing(token)) return c.json({ ok: true });
    try {
      await service.recordPing(token);
    } catch (error) {
      console.error("[runly.growth.monitors.ping]", error?.message ?? error);
    }
    return c.json({ ok: true });
  };
  app.get("/public/monitor/ping/:token", ping);
  app.post("/public/monitor/ping/:token", ping);
  return app;
}
