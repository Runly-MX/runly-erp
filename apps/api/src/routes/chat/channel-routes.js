// apps/api/src/routes/chat/channel-routes.js
//
// Channels & roles (Phase A foundation): channel creation/directory, linked
// channels, joining, and per-channel role management. Extracted from
// index.js on 2026-09-24 to keep that file under the CLAUDE.md 1000-line
// limit, following the moderation-routes.js / template-routes.js pattern.
import { Hono } from "hono";
import {
  chatCreateChannelSchema,
  chatCreateChannelRoleSchema,
  chatUpdateChannelRoleSchema,
  chatAssignMemberRoleSchema,
} from "@runly/validators";
import { ChatServiceError } from "./chat-service-error.js";
import { resolveUserProfileId } from "./chat-service.js";
import { GuestChatServiceError } from "./guest-service.js";
import { ChatPermissionsError } from "./chat-permissions-service.js";
import { ChatReactionsError } from "./chat-reactions-service.js";
import { ChatModerationServiceError } from "./chat-moderation-service.js";

function handleError(c, err, fallback) {
  if (
    err instanceof ChatServiceError ||
    err instanceof GuestChatServiceError ||
    err instanceof ChatPermissionsError ||
    err instanceof ChatReactionsError ||
    err instanceof ChatModerationServiceError
  ) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("[runly.chat]", err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  return c.json({ error: fallback }, 500);
}

export function createChannelRoutes({ prisma, requirePermission, chatService, channelDirectoryService, channelLinksService, permissionsService }) {
  const app = new Hono();

  // POST /chat/channels
  app.post("/channels", requirePermission("chat.conversations.create"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const body = await c.req.json();
      const data = chatCreateChannelSchema.parse(body);
      const result = await chatService.createConversation({ authUserId, type: "channel", ...data, companyId: c.get("companyId") });
      return c.json({ data: result }, 201);
    } catch (err) {
      if (err?.name === "ZodError") return c.json({ error: (err.errors ?? err.issues)?.[0]?.message ?? "Datos invalidos." }, 422);
      return handleError(c, err, "Error creando canal.");
    }
  });

  // GET /chat/channels/directory
  app.get("/channels/directory", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const { cursor, limit } = c.req.query();
      const result = await channelDirectoryService.listChannelDirectory({
        authUserId,
        cursor: cursor || null,
        limit: limit ? Math.min(parseInt(limit, 10), 100) : 30,
        activeCompanyId: c.get("companyId"),
      });
      return c.json(result);
    } catch (err) {
      return handleError(c, err, "Error listando canales.");
    }
  });

  // GET /chat/channels/linked?module=runly.projects&entityId=<uuid>
  // Used by the source module's UI (e.g. a project's detail screen) to list
  // the record's channels the caller can see (public or member-of, active
  // company only). `data` is the primary channel (or null) for callers that
  // only need "Ir al canal"; `channels` is the full visible list.
  app.get("/channels/linked", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const { module: linkedModule, entityId } = c.req.query();
      if (!linkedModule || !entityId) {
        return c.json({ error: "module y entityId son requeridos." }, 422);
      }
      const companyId = c.get("companyId");
      if (!companyId) return c.json({ data: null, channels: [], primaryId: null });
      const profileId = await resolveUserProfileId(prisma, c.get("authUserId"));
      const { channels, primaryId } = await channelLinksService.listByLink({
        linkedModule, linkedEntityId: entityId, companyId, profileId,
      });
      const primary = channels.find((ch) => ch.id === primaryId) ?? null;
      return c.json({ data: primary, channels, primaryId });
    } catch (err) {
      return handleError(c, err, "Error buscando el canal vinculado.");
    }
  });

  // POST /chat/conversations/:id/join
  app.post("/conversations/:id/join", requirePermission("chat.conversations.create"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const conversationId = c.req.param("id");
      const result = await channelDirectoryService.joinChannel({ conversationId, authUserId, activeCompanyId: c.get("companyId") });
      return c.json({ data: result }, 201);
    } catch (err) {
      return handleError(c, err, "Error uniendote al canal.");
    }
  });

  // GET /chat/conversations/:id/roles
  app.get("/conversations/:id/roles", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const conversationId = c.req.param("id");
      const result = await permissionsService.listRoles({ conversationId, authUserId });
      return c.json({ data: result });
    } catch (err) {
      return handleError(c, err, "Error listando roles.");
    }
  });

  // POST /chat/conversations/:id/roles
  app.post("/conversations/:id/roles", requirePermission("chat.conversations.create"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const conversationId = c.req.param("id");
      const body = await c.req.json();
      const data = chatCreateChannelRoleSchema.parse(body);
      const result = await permissionsService.createRole({ conversationId, authUserId, ...data });
      return c.json({ data: result }, 201);
    } catch (err) {
      if (err?.name === "ZodError") return c.json({ error: (err.errors ?? err.issues)?.[0]?.message ?? "Datos invalidos." }, 422);
      return handleError(c, err, "Error creando rol.");
    }
  });

  // PATCH /chat/conversations/:id/roles/:roleId
  app.patch("/conversations/:id/roles/:roleId", requirePermission("chat.conversations.create"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const conversationId = c.req.param("id");
      const roleId = c.req.param("roleId");
      const body = await c.req.json();
      const updates = chatUpdateChannelRoleSchema.parse(body);
      const result = await permissionsService.updateRole({ conversationId, roleId, authUserId, updates });
      return c.json({ data: result });
    } catch (err) {
      if (err?.name === "ZodError") return c.json({ error: (err.errors ?? err.issues)?.[0]?.message ?? "Datos invalidos." }, 422);
      return handleError(c, err, "Error actualizando rol.");
    }
  });

  // DELETE /chat/conversations/:id/roles/:roleId
  app.delete("/conversations/:id/roles/:roleId", requirePermission("chat.conversations.create"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const conversationId = c.req.param("id");
      const roleId = c.req.param("roleId");
      const result = await permissionsService.deleteRole({ conversationId, roleId, authUserId });
      return c.json({ data: result });
    } catch (err) {
      return handleError(c, err, "Error eliminando rol.");
    }
  });

  // PATCH /chat/conversations/:id/members/:memberId/role
  app.patch("/conversations/:id/members/:memberId/role", requirePermission("chat.conversations.create"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const conversationId = c.req.param("id");
      const memberUserId = c.req.param("memberId");
      const body = await c.req.json();
      const { roleId } = chatAssignMemberRoleSchema.parse(body);
      const result = await permissionsService.assignMemberRole({ conversationId, memberUserId, roleId, authUserId });
      return c.json({ data: result });
    } catch (err) {
      if (err?.name === "ZodError") return c.json({ error: (err.errors ?? err.issues)?.[0]?.message ?? "Datos invalidos." }, 422);
      return handleError(c, err, "Error asignando rol.");
    }
  });

  return app;
}
