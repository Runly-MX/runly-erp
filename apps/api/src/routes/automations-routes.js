// Automations of the company that are not tied to a module (the Automatizaciones
// module, runly.automations, independent of Core). Runs, pending waits and their cancellation reuse
// /modules/system.automations/automation-runs|automation-jobs. Spec
// docs/superpowers/specs/2026-10-25-system-automations-design.md.
import { createAutomationHttpService } from "../services/automation-http-service.js";
import { Hono } from "hono";
import { createSystemAutomationsService } from "../services/system-automations-service.js";

export function createAutomationsRouter({ prisma, requirePermission, moduleServices = null }) {
  const app = new Hono();
  const service = createSystemAutomationsService({ prisma, moduleServices });
  const httpService = createAutomationHttpService({ prisma });
  const read = requirePermission("automations.read");
  const guard = requirePermission("automations.manage");
  const actor = (c) => c.get("userContext")?.profile?.id ?? null;

  function fail(c, error) {
    if (error?.status) return c.json({ error: error.message, ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) }, error.status);
    console.error("[automations-routes]", error?.message);
    return c.json({ error: "No se pudo completar la operación." }, 500);
  }

  // The secret webhook URL is only shown to who can administer automations.
  app.get("/automations", read, async (c) => {
    const user = c.get("userContext");
    const canManage = Boolean(user?.isAdmin || user?.permissionSet?.has?.("automations.manage"));
    const rows = await service.list(c.get("companyId"));
    return c.json({ data: canManage ? rows : rows.map(({ webhookToken: _token, ...row }) => row) });
  });
  app.get("/automations/catalog", read, (c) => c.json({ data: service.catalog() }));

  // Destinations the "Llamar a una URL" block may call: managed by who administers automations.
  app.get("/automations/http-hosts", guard, async (c) => c.json({ data: { hosts: await httpService.getHosts(), canManage: true } }));
  app.put("/automations/http-hosts", guard, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      return c.json({ data: { hosts: await httpService.setHosts(body?.hosts) } });
    } catch (error) {
      return fail(c, error);
    }
  });

  // Key that signs what Runly sends (X-Runly-Signature), so the receiver can verify it. Administrators only.
  app.get("/automations/http-secret", guard, async (c) => c.json({ data: { secret: await httpService.getSecret() } }));
  app.post("/automations/http-secret/regenerate", guard, async (c) => c.json({ data: { secret: await httpService.regenerateSecret() } }));

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
