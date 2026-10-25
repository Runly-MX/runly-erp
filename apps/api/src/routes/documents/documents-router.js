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
  const activeModules = hub.activeModules;

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
