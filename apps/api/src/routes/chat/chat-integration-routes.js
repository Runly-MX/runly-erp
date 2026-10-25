// apps/api/src/routes/chat/chat-integration-routes.js
//
// Channel integrations: management for channel admins (/chat/channels/:id/integrations)
// and the public incoming webhook (/public/chat-hooks/:token, no login: the secret
// token in the URL is the credential). Spec
// docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 1.
import { Hono } from "hono";
import { ChatServiceError } from "./chat-service-error.js";
import { ChatPermissionsError, CHAT_PERMISSIONS } from "./chat-permissions-service.js";
import { resolveUserProfileId } from "./chat-service.js";
import { MAX_BODY_BYTES } from "./chat-integrations-service.js";

function handleError(c, err, fallback) {
  if (err instanceof ChatServiceError || err instanceof ChatPermissionsError) return c.json({ error: err.message }, err.status);
  console.error("[runly.chat] integraciones:", err?.message ?? err);
  return c.json({ error: fallback }, 500);
}

export function createChatIntegrationRoutes({ prisma, requirePermission, permissionsService, integrationsService }) {
  const app = new Hono();

  // Channel admins only (the same role rule as channel settings), inside the active company.
  async function guard(c) {
    const conversationId = c.req.param("id");
    const [channel] = await prisma.$queryRaw`
      SELECT id FROM chat_conversations WHERE id = ${conversationId}::uuid AND company_id = ${c.get("companyId")}::uuid AND type = 'channel' AND deleted_at IS NULL
    `;
    if (!channel) throw new ChatServiceError("Canal no encontrado.", 404);
    const profileId = await resolveUserProfileId(prisma, c.get("authUserId"));
    await permissionsService.assertChannelPermission(conversationId, profileId, CHAT_PERMISSIONS.CHANNEL_MANAGE);
    return { conversationId, profileId, companyId: c.get("companyId") };
  }

  app.get("/channels/:id/integrations", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const { conversationId } = await guard(c);
      return c.json({ data: await integrationsService.list(conversationId) });
    } catch (err) { return handleError(c, err, "Error al listar las integraciones."); }
  });

  app.post("/channels/:id/integrations", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const { conversationId, profileId, companyId } = await guard(c);
      const body = await c.req.json();
      return c.json({ data: await integrationsService.create({ companyId, conversationId, actorId: profileId, name: body.name, icon: body.icon }) }, 201);
    } catch (err) { return handleError(c, err, "Error al crear la integración."); }
  });

  app.patch("/channels/:id/integrations/:iid", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const { conversationId } = await guard(c);
      const body = await c.req.json();
      return c.json({ data: await integrationsService.update({ conversationId, integrationId: c.req.param("iid"), name: body.name, icon: body.icon, enabled: body.enabled, callbackUrl: body.callbackUrl }) });
    } catch (err) { return handleError(c, err, "Error al guardar la integración."); }
  });

  app.post("/channels/:id/integrations/:iid/rotate", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const { conversationId } = await guard(c);
      return c.json({ data: await integrationsService.rotate({ conversationId, integrationId: c.req.param("iid") }) });
    } catch (err) { return handleError(c, err, "Error al regenerar la dirección."); }
  });

  app.delete("/channels/:id/integrations/:iid", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const { conversationId } = await guard(c);
      return c.json({ data: await integrationsService.remove({ conversationId, integrationId: c.req.param("iid") }) });
    } catch (err) { return handleError(c, err, "Error al eliminar la integración."); }
  });

  return app;
}

export function createChatHookPublicRouter({ integrationsService }) {
  const app = new Hono();
  app.get("/:token", (c) => c.json({ error: "Envía el mensaje con POST y un cuerpo JSON." }, 405));
  app.post("/:token", async (c) => {
    try {
      if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) throw new ChatServiceError("El mensaje supera 32 KB.", 413);
      const raw = await c.req.text();
      if (raw.length > MAX_BODY_BYTES) throw new ChatServiceError("El mensaje supera 32 KB.", 413);
      let input;
      try { input = JSON.parse(raw); } catch { throw new ChatServiceError("El cuerpo debe ser JSON.", 400); }
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new ChatServiceError("El cuerpo debe ser un objeto JSON.", 400);
      const posted = await integrationsService.postFromToken(c.req.param("token"), input);
      return c.json({ ok: true, id: posted.id }, 201);
    } catch (err) {
      if (err instanceof ChatServiceError) return c.json({ error: err.message }, err.status);
      console.error("[runly.chat] webhook:", err?.message ?? err);
      return c.json({ error: "No se pudo publicar el mensaje." }, 500);
    }
  });
  return app;
}
