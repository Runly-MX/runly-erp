// Per-company custom detail views (cards + field order) for blueprint-driven
// detail screens. Spec: docs/superpowers/specs/2026-11-05-custom-detail-views-design.md.
// Only the arrangement is stored; field metadata always comes from the base blueprint.
import { Hono } from "hono";
import { z } from "zod";

// viewKey -> who may read it and who may change it.
export const DETAIL_VIEWS = {
  "inventory.item.detail": { read: "inventory.item.read", write: "inventory.customfield.manage" },
};

const key = z.string().trim().min(1).max(120);
const section = z.object({
  id: key,
  block: z.boolean().optional(),
  label: z.string().trim().max(80).optional(),
  icon: z.string().trim().max(40).optional(),
  column: z.enum(["main", "aside"]),
  columns: z.number().int().min(1).max(3).optional(),
  fields: z.array(key).max(80).optional(),
}).strict();
export const detailViewSchema = z.object({
  version: z.literal(1),
  sections: z.array(section).max(40),
  hidden: z.array(key).max(200).default([]),
}).strict();

export function createDetailViewsRouter({ prisma, requireActiveCompany }) {
  const app = new Hono();

  function guard(c, mode) {
    const view = DETAIL_VIEWS[c.req.param("viewKey")];
    if (!view) return c.json({ error: "Vista no disponible." }, 404);
    const user = c.get("userContext");
    if (!(user?.isAdmin || user?.permissionSet?.has?.(view[mode]))) return c.json({ error: "No tienes permiso para esta vista." }, 403);
    return null;
  }

  app.get("/detail-views/:viewKey", requireActiveCompany, async (c) => {
    const denied = guard(c, "read");
    if (denied) return denied;
    const row = await prisma.companyDetailView.findUnique({
      where: { companyId_viewKey: { companyId: c.get("companyId"), viewKey: c.req.param("viewKey") } },
      select: { schema: true, updatedAt: true },
    });
    return c.json({ data: row?.schema ?? null, updatedAt: row?.updatedAt ?? null });
  });

  app.put("/detail-views/:viewKey", requireActiveCompany, async (c) => {
    const denied = guard(c, "write");
    if (denied) return denied;
    const parsed = detailViewSchema.safeParse((await c.req.json().catch(() => ({})))?.schema);
    if (!parsed.success) return c.json({ error: "La vista no es válida.", details: parsed.error.issues.slice(0, 5) }, 400);
    const companyId = c.get("companyId");
    const viewKey = c.req.param("viewKey");
    const updatedById = c.get("userId") ?? null;
    const row = await prisma.companyDetailView.upsert({
      where: { companyId_viewKey: { companyId, viewKey } },
      create: { companyId, viewKey, schema: parsed.data, updatedById },
      update: { schema: parsed.data, updatedById },
      select: { schema: true, updatedAt: true },
    });
    return c.json({ data: row.schema, updatedAt: row.updatedAt });
  });

  app.delete("/detail-views/:viewKey", requireActiveCompany, async (c) => {
    const denied = guard(c, "write");
    if (denied) return denied;
    await prisma.companyDetailView.deleteMany({ where: { companyId: c.get("companyId"), viewKey: c.req.param("viewKey") } });
    return c.json({ data: null });
  });

  return app;
}
