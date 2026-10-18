// GET /platform/owner, POST /platform/owner/transfer.
// Spec: docs/superpowers/specs/2026-10-18-platform-owner-design.md §6
import { Hono } from "hono";
import { z } from "zod";
import { getPlatformOwner, transferPlatformOwner } from "../lib/platform-owner.js";

const transferSchema = z.object({ profileId: z.string().uuid() });

export function createPlatformOwnerRouter({ prisma, requirePermission, cacheDelByPrefix = () => {} }) {
  const app = new Hono();

  app.get("/platform/owner", requirePermission("profile.self.read"), async (c) => {
    try {
      const data = await getPlatformOwner(prisma, { actorProfileId: c.get("userId") });
      return c.json({ data });
    } catch (err) {
      console.error("[GET /platform/owner]", err?.message);
      return c.json({ error: "No se pudo cargar el propietario de la plataforma." }, 500);
    }
  });

  app.post("/platform/owner/transfer", requirePermission("profile.self.read"), async (c) => {
    try {
      const parsed = transferSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) return c.json({ error: "Selecciona un usuario válido." }, 400);
      const result = await transferPlatformOwner(prisma, {
        actorProfileId: c.get("userId"),
        targetProfileId: parsed.data.profileId,
        companyId: c.get("companyId") ?? null,
      });
      if (!result.ok) return c.json({ error: result.error }, result.status);
      cacheDelByPrefix("user_ctx:");
      return c.json({ data: { owner: result.owner } });
    } catch (err) {
      console.error("[POST /platform/owner/transfer]", err?.message);
      return c.json({ error: "No se pudo transferir la propiedad de la plataforma." }, 500);
    }
  });

  return app;
}
