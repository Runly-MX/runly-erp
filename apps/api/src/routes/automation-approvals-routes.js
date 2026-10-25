// Approvals requested by Builder automations (stage C, C3): the signed-in user
// lists what is waiting for them and decides. Mounted via mountWithAuth();
// access is by being one of the chosen approvers, so no module permission.
import { Hono } from "hono";
import { createAutomationApprovalsService } from "../services/automation-approvals-service.js";

export function createAutomationApprovalsRouter({ prisma }) {
  const app = new Hono();
  const approvals = createAutomationApprovalsService({ prisma });

  const who = (c) => ({ companyId: c.get("companyId"), profileId: c.get("userContext")?.profile?.id ?? null });

  app.get("/automation-approvals/mine", async (c) => {
    const { companyId, profileId } = who(c);
    if (!companyId || !profileId) return c.json({ data: [] });
    return c.json({ data: await approvals.listMine({ companyId, profileId }) });
  });

  app.post("/automation-approvals/:id/decide", async (c) => {
    const { companyId, profileId } = who(c);
    if (!companyId || !profileId) return c.json({ error: "Selecciona una empresa activa." }, 400);
    const body = await c.req.json().catch(() => ({}));
    try {
      return c.json({ data: await approvals.decide({ companyId, profileId, id: c.req.param("id"), decision: body?.decision, comment: body?.comment }) });
    } catch (err) {
      if (err?.status) return c.json({ error: err.message }, err.status);
      throw err;
    }
  });

  return app;
}
