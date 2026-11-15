import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { GrowthMonitorServiceError } from "./growth-monitor-service.js";

const upsertSchema = z.object({ enabled: z.boolean().optional(), title: z.string().trim().min(1).max(120).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Sin cambios." });
const propertyParam = z.object({ propertyId: z.string().uuid() });

function handleError(c, error) {
  if (error instanceof GrowthMonitorServiceError) return c.json({ error: error.message, code: error.code }, error.status);
  console.error("[runly.growth.status-page]", error);
  return c.json({ error: "Error interno de la pagina de estado." }, 500);
}

export function createGrowthStatusPageRoutes({ service, requirePermission }) {
  const app = new Hono();
  const companyId = (c) => c.get("companyId") ?? null;
  const run = (handler) => async (c) => { try { return await handler(c); } catch (error) { return handleError(c, error); } };

  app.get("/growth/status-pages", requirePermission("growth.access"), run(async (c) =>
    c.json({ data: await service.list({ companyId: companyId(c) }) })));

  app.put("/growth/status-pages/:propertyId", requirePermission("growth.properties.manage"), zValidator("param", propertyParam), zValidator("json", upsertSchema), run(async (c) =>
    c.json({ data: await service.upsert({ companyId: companyId(c), ...c.req.valid("param"), ...c.req.valid("json") }) })));

  app.post("/growth/status-pages/:propertyId/slug", requirePermission("growth.properties.manage"), zValidator("param", propertyParam), run(async (c) =>
    c.json({ data: await service.regenerateSlug({ companyId: companyId(c), ...c.req.valid("param") }) })));

  return app;
}

// Unauthenticated: the unguessable slug is the credential. Unknown, disabled and
// malformed slugs answer the same 404 so pages cannot be enumerated.
export function createGrowthStatusPagePublicRoutes({ service, max = 120, windowMs = 60_000 }) {
  const app = new Hono();
  const hits = new Map();
  const allowed = (key) => {
    const at = Date.now();
    if (hits.size > 5000) for (const [k, times] of hits) if (at - times[times.length - 1] >= windowMs) hits.delete(k);
    const recent = (hits.get(key) ?? []).filter((t) => at - t < windowMs);
    if (recent.length >= max) return false;
    hits.set(key, [...recent, at]);
    return true;
  };
  app.get("/public/status/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (slug.length > 40 || !allowed(slug)) return c.json({ error: "No disponible." }, 404);
    try {
      const data = await service.getPublic(slug);
      if (!data) return c.json({ error: "No disponible." }, 404);
      c.header("Cache-Control", "public, max-age=30");
      return c.json({ data });
    } catch (error) {
      console.error("[runly.growth.status-page.public]", error?.message ?? error);
      return c.json({ error: "No disponible." }, 404);
    }
  });
  return app;
}
