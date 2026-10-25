// Public entry for incoming webhooks of company automations (no login: the secret
// token in the URL and the origin allow-list are the protection). Mounted before
// any mountWithAuth(). Spec
// docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md.
import { Hono } from "hono";
import { createAutomationWebhooksService, WebhookError, MAX_BODY_BYTES } from "../services/automation-webhooks-service.js";
import { parseTrustedProxies, resolveClientIp } from "../mcp/client-ip.js";

export function createAutomationWebhookPublicRouter({ prisma, env = process.env }) {
  const app = new Hono();
  const service = createAutomationWebhooksService({ prisma });
  const trusted = parseTrustedProxies(env.RUNLY_TRUSTED_PROXIES || env.RUNLY_MCP_TRUSTED_PROXIES);

  app.get("/:token", (c) => c.json({ error: "Envía el mensaje con POST y un cuerpo JSON." }, 405));

  app.post("/:token", async (c) => {
    try {
      const declared = Number(c.req.header("content-length") ?? 0);
      if (declared > MAX_BODY_BYTES) throw new WebhookError("El mensaje supera 64 KB.", 413);
      const ip = resolveClientIp(c.env?.incoming?.socket?.remoteAddress, c.req.header("x-forwarded-for"), trusted);
      const result = await service.ingest({ token: c.req.param("token"), bodyText: await c.req.text(), contentType: c.req.header("content-type") ?? "", ip });
      return c.json({ ok: true, ...result }, 202);
    } catch (error) {
      if (error instanceof WebhookError) return c.json({ error: error.message }, error.status);
      console.error("[automation-webhook]", error?.message);
      return c.json({ error: "No se pudo recibir el mensaje." }, 500);
    }
  });

  return app;
}
