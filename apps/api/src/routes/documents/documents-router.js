import { Hono } from "hono";

import { createKindRegistry } from "./kinds/kind-registry.js";
import { createDocumentGenerationRoutes } from "./document-generation-routes.js";
import { createDocumentGenerationService } from "./document-generation-service.js";
import { createDocumentTemplateRoutes } from "./document-template-routes.js";
import { createDocumentTemplateService } from "./document-template-service.js";
import { createGrowthLeadDocumentProvider } from "./providers/growth-lead-provider.js";

export function createDocumentsRouter({
  prisma,
  supabaseAdmin,
  requirePermission,
}) {
  const app = new Hono();
  const providerRegistry = createKindRegistry();
  providerRegistry.register(createGrowthLeadDocumentProvider({ prisma }));
  const service = createDocumentTemplateService({
    prisma,
    providerRegistry,
  });
  const generationService = createDocumentGenerationService({
    prisma,
    supabaseAdmin,
    providerRegistry,
  });

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
