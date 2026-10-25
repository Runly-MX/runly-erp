import { Hono } from "hono";

import { createDocumentGenerationRoutes } from "./document-generation-routes.js";
import { createDocumentGenerationService } from "./document-generation-service.js";
import { createDocumentEngineRoutes } from "./document-engine-routes.js";
import { createDocumentTemplateRoutes } from "./document-template-routes.js";
import { createDocumentTemplateService } from "./document-template-service.js";
import { createDocumentsHub } from "./documents-hub.js";

export function createDocumentsRouter({
  prisma,
  supabaseAdmin,
  requirePermission,
  requireActiveCompany,
  hub = createDocumentsHub({ prisma, supabaseAdmin }),
}) {
  const app = new Hono();
  const providerRegistry = hub.kinds;
  const service = createDocumentTemplateService({
    prisma,
    providerRegistry,
  });
  const generationService = createDocumentGenerationService({
    prisma,
    supabaseAdmin,
    providerRegistry,
  });

  // File-template routes first: their fixed paths (/documents/kinds,
  // /documents/templates/upload, ...) must win over /documents/templates/:id.
  app.route("", createDocumentEngineRoutes({ hub, guard: requireActiveCompany }));
  app.route(
    "",
    createDocumentTemplateRoutes({
      service,
      providerRegistry,
      requirePermission,
    }),
  );
  app.route(
    "",
    createDocumentGenerationRoutes({
      service: generationService,
      requirePermission,
    }),
  );
  return app;
}
