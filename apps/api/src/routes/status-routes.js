// Own status and Do Not Disturb, and the lookup of others' status in the active company.
// Spec docs/superpowers/specs/2026-10-26-status-and-dnd-design.md.
import { Hono } from "hono";
import { createStatusService } from "../services/status-service.js";

export function createStatusRouter({ prisma, requireActiveCompany }) {
  const app = new Hono();
  const service = createStatusService({ prisma });
  const profileOf = (c) => c.get("userContext")?.profile?.id ?? c.get("userId");
  const guard = (handler) => async (c) => {
    try {
      const profileId = profileOf(c);
      if (!profileId) return c.json({ error: "No autorizado." }, 401);
      return c.json({ data: await handler(c, profileId) });
    } catch (err) {
      console.error("[status]", err?.message ?? err);
      return c.json({ error: "No se pudo completar la acción." }, 500);
    }
  };

  app.get("/profile/status", requireActiveCompany, guard((c, id) => service.getStatus(id)));
  app.put("/profile/status", requireActiveCompany, guard(async (c, id) => service.setStatus(id, await c.req.json().catch(() => null))));
  app.get("/notifications/dnd", requireActiveCompany, guard((c, id) => service.getDnd(id)));
  app.put("/notifications/dnd", requireActiveCompany, guard(async (c, id) => service.setDnd(id, await c.req.json().catch(() => null))));
  app.get("/chat/status", requireActiveCompany, guard((c) => service.lookup(c.get("companyId"), String(c.req.query("userIds") ?? "").split(","))));

  return app;
}
