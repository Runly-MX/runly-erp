import { Hono } from "hono";

import { createDocumentGenerationRoutes } from "./document-generation-routes.js";
import { createDocumentGenerationService } from "./document-generation-service.js";
import { createDocumentEngineRoutes } from "./document-engine-routes.js";
import { createDocumentsHub } from "./documents-hub.js";

export function createDocumentsRouter({
  prisma,
  supabaseAdmin,
  requirePermission,
  requireActiveCompany,
  hub = createDocumentsHub({ prisma, supabaseAdmin }),
}) {
  const app = new Hono();
  // Modules installed on the instance, enabled and not switched off for the company.
  async function activeModules(companyId, moduleKeys) {
    const rows = await prisma.runlyModule.findMany({
      where: { key: { in: moduleKeys }, status: "INSTALLED", enabled: true },
      select: { id: true, key: true, name: true },
    });
    const off = rows.length
      ? await prisma.companyModule.findMany({ where: { companyId, moduleId: { in: rows.map((r) => r.id) }, enabled: false }, select: { moduleId: true } })
      : [];
    const disabled = new Set(off.map((r) => r.moduleId));
    return new Map(rows.filter((r) => !disabled.has(r.id)).map((r) => [r.key, r.name]));
  }

  const generationService = createDocumentGenerationService({ prisma, supabaseAdmin });

  // Engine routes (kinds, file templates, generate/preview) and the history of
  // generated documents.
  app.route("", createDocumentEngineRoutes({ hub, guard: requireActiveCompany, activeModules }));
  app.route(
    "",
    createDocumentGenerationRoutes({
      service: generationService,
      requirePermission,
    }),
  );
  return app;
}
