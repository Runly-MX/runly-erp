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
});

const intervalSeconds = z.number().int().min(60).max(3600);

export const growthMonitorCreateSchema = z
  .object({
    propertyId: z.string().uuid(),
    type: z.enum(["http", "ssl"]),
    name: z.string().trim().min(1).max(200),
    config: configSchema,
    intervalSeconds: intervalSeconds.optional(),
  })
  .refine((v) => (v.type === "http" ? Boolean(v.config.url) : Boolean(v.config.host)), {
    message: "Falta la URL (http) o el host (ssl).",
    path: ["config"],
  });

export const growthMonitorUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    config: configSchema.optional(),
    intervalSeconds: intervalSeconds.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Sin cambios." });

const listQuerySchema = z.object({ propertyId: z.string().uuid().optional() });
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

  app.get("/growth/monitors/:id/checks", requirePermission("growth.access"), zValidator("query", checksQuerySchema), run(async (c) =>
    c.json({ data: await service.listChecks({ companyId: companyId(c), id: c.req.param("id"), ...c.req.valid("query") }) })));

  app.get("/growth/incidents", requirePermission("growth.access"), zValidator("query", listQuerySchema), run(async (c) =>
    c.json({ data: await service.listIncidents({ companyId: companyId(c), ...c.req.valid("query") }) })));

  return app;
}
