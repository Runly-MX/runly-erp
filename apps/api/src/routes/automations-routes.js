// Automations of the company that are not tied to a module (Runly Core >
// Automatizaciones). Runs, pending waits and their cancellation reuse
// /modules/system.automations/automation-runs|automation-jobs. Spec
// docs/superpowers/specs/2026-10-25-system-automations-design.md.
import { Hono } from "hono";
import { createSystemAutomationsService } from "../services/system-automations-service.js";

export function createAutomationsRouter({ prisma, requirePermission, moduleServices = null }) {
  const app = new Hono();
  const service = createSystemAutomationsService({ prisma, moduleServices });
  const guard = requirePermission("core.modules.manage");
  const actor = (c) => c.get("userContext")?.profile?.id ?? null;

  function fail(c, error) {
    if (error?.status) return c.json({ error: error.message, ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) }, error.status);
    console.error("[automations-routes]", error?.message);
    return c.json({ error: "No se pudo completar la operación." }, 500);
  }

  app.get("/automations", guard, async (c) => c.json({ data: await service.list(c.get("companyId")) }));
  app.get("/automations/catalog", guard, (c) => c.json({ data: service.catalog() }));

  // Origins (IPs / networks) allowed to send webhooks; empty = any with the secret URL.
  app.get("/automations/webhook-origins", guard, async (c) => c.json({ data: { origins: await service.webhooks.getOrigins() } }));
  app.put("/automations/webhook-origins", guard, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      return c.json({ data: { origins: await service.webhooks.setOrigins(body?.origins) } });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/automations", guard, async (c) => {
    try {
      const input = await c.req.json().catch(() => ({}));
      return c.json({ data: await service.create({ companyId: c.get("companyId"), actorId: actor(c), input }) }, 201);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.put("/automations/:key", guard, async (c) => {
    try {
      const input = await c.req.json().catch(() => ({}));
      return c.json({ data: await service.save({ companyId: c.get("companyId"), actorId: actor(c), key: c.req.param("key"), input }) });
    } catch (error) {
      return fail(c, error);
    }
  });

  // Webhook of an automation: recent messages (to pick the fields from a real one)
  // and a new secret URL.
  app.get("/automations/:key/webhook/events", guard, async (c) => {
    return c.json({ data: await service.webhookEvents({ companyId: c.get("companyId"), key: c.req.param("key") }) });
  });
  app.post("/automations/:key/webhook/regenerate", guard, async (c) => {
    try {
      return c.json({ data: await service.regenerateWebhookToken({ companyId: c.get("companyId"), key: c.req.param("key") }) });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.delete("/automations/:key", guard, async (c) => {
    try {
      return c.json({ data: await service.remove({ companyId: c.get("companyId"), actorId: actor(c), key: c.req.param("key") }) });
    } catch (error) {
      return fail(c, error);
    }
  });

  return app;
}
