// Automations of the company that are not tied to a module (the Automatizaciones
// module, runly.automations, independent of Core). Runs, pending waits and their cancellation reuse
// /modules/system.automations/automation-runs|automation-jobs. Spec
// docs/superpowers/specs/2026-10-25-system-automations-design.md.
import { createAutomationHttpService } from "../services/automation-http-service.js";
import { Hono } from "hono";
import { createSystemAutomationsService } from "../services/system-automations-service.js";
import { createAutomationImportService } from "../services/marketplace/automation-import-service.js";
import { MarketplaceImportError } from "../services/marketplace/marketplace-import-gate.js";

export function createAutomationsRouter({ prisma, requirePermission, moduleServices = null, marketplace = null }) {
  const app = new Hono();
  const service = createSystemAutomationsService({ prisma, moduleServices });
  const httpService = createAutomationHttpService({ prisma });
  const read = requirePermission("automations.read");
  const guard = requirePermission("automations.manage");
  const actor = (c) => c.get("userContext")?.profile?.id ?? null;
  const imports = marketplace ? createAutomationImportService({ prisma, gate: marketplace, http: httpService }) : null;

  function fail(c, error) {
    if (error instanceof MarketplaceImportError) return c.json({ error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) }, error.status);
    if (error?.name === "ZodError") return c.json({ error: "La solicitud no es válida.", code: "INVALID_REQUEST" }, 400);
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

  // Marketplace (E3a): inspect -> prepare -> consent + confirm -> paused automation. The file is
  // downloaded and verified on this server from the signed resource feed; nothing runs.
  const marketplaceRoute = (handler) => async (c) => {
    try {
      if (!imports) throw new MarketplaceImportError("RESOURCE_FEED_NOT_CONFIGURED", "El catálogo de recursos no está disponible.", 503);
      c.header("Cache-Control", "private, no-store");
      const [data, status] = await handler(c, { companyId: c.get("companyId"), actorId: actor(c) });
      return c.json({ data }, status ?? 200);
    } catch (error) {
      return fail(c, error);
    }
  };
  const body = (c) => c.req.json().catch(() => ({}));
  app.get("/automations/marketplace/resources", guard, marketplaceRoute(async (c) => [await marketplace.list("automation", { query: c.req.query("q") ?? "", acknowledgeStale: c.req.query("acknowledgeStale") === "true" })]));
  app.post("/automations/marketplace/inspect", guard, marketplaceRoute(async (c, who) => [await imports.inspect({ ...who, ref: await body(c) })]));
  app.post("/automations/marketplace/imports", guard, marketplaceRoute(async (c, who) => [await imports.prepare({ ...who, ref: await body(c) }), 201]));
  app.get("/automations/marketplace/imports/:id", guard, marketplaceRoute(async (c, who) => [await imports.status({ ...who, id: c.req.param("id") })]));
  app.post("/automations/marketplace/imports/:id/confirm", guard, marketplaceRoute(async (c, who) => [await imports.confirm({ ...who, id: c.req.param("id"), input: await body(c) }), 201]));
  app.delete("/automations/marketplace/imports/:id", guard, marketplaceRoute(async (c, who) => [await imports.cancel({ ...who, id: c.req.param("id") })]));

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

  // Resumes a failed run from the block that failed (its parked continuation).
  app.post("/automations/:key/runs/:runId/retry", guard, async (c) => {
    try {
      return c.json({ data: await service.retryRun({ companyId: c.get("companyId"), key: c.req.param("key"), runId: c.req.param("runId") }) });
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
