// apps/api/src/routes/chat/chat-media-routes.js
//
// GET /chat/media?type=media|documents|audio|links&cursor=&limit=&q= — the
// cross-chat "Multimedia" page. Split into a sibling file to keep index.js
// under the CLAUDE.md 1000-line limit.
import { Hono } from "hono";
import { ChatServiceError } from "./chat-service-error.js";
import { createChatMediaService } from "./chat-media-service.js";

export function createChatMediaRoutes({ prisma, requirePermission }) {
  const app = new Hono();
  const mediaService = createChatMediaService({ prisma });

  app.get("/media", requirePermission("chat.conversations.read"), async (c) => {
    try {
      const result = await mediaService.listMedia({
        authUserId: c.get("authUserId"),
        companyId: c.get("companyId") ?? null,
        type: c.req.query("type") ?? "media",
        cursor: c.req.query("cursor") ?? null,
        limit: c.req.query("limit"),
        q: c.req.query("q") ?? "",
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof ChatServiceError) return c.json({ error: err.message }, err.status);
      console.error("[runly.chat] media", err?.message ?? err);
      return c.json({ error: "Error obteniendo multimedia." }, 500);
    }
  });

  return app;
}
