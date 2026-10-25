import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { DocumentProviderError } from "./document-errors.js";
import {
  DocumentGenerationServiceError,
} from "./document-generation-service.js";
import {
  documentGeneratedEnabledSchema,
  documentGeneratedQuerySchema,
} from "./document-validators.js";

function companyId(c) {
  return c.get("companyId") ?? null;
}

function actorId(c) {
  return c.get("userContext")?.profile?.id ?? c.get("userId") ?? null;
}

function handleError(c, error) {
  if (
    error instanceof DocumentGenerationServiceError ||
    error instanceof DocumentProviderError
  ) {
    return c.json(
      { error: error.message, code: error.code },
      error.status,
    );
  }
  console.error("[runly.documents.generation]", error);
  return c.json({ error: "Error interno al generar el documento." }, 500);
}

export function createDocumentGenerationRoutes({ service, requirePermission }) {
  const app = new Hono();

  app.get(
    "/documents/generated",
    requirePermission("documents.generated.read"),
    zValidator("query", documentGeneratedQuerySchema),
    async (c) => {
      try {
        return c.json(
          await service.listGenerated({
            companyId: companyId(c),
            query: c.req.valid("query"),
          }),
        );
      } catch (error) {
        return handleError(c, error);
      }
    },
  );

  app.get(
    "/documents/generated/:id",
    requirePermission("documents.generated.read"),
    async (c) => {
      try {
        return c.json(
          await service.getGenerated({
            companyId: companyId(c),
            id: c.req.param("id"),
          }),
        );
      } catch (error) {
        return handleError(c, error);
      }
    },
  );

  app.get(
    "/documents/generated/:id/download",
    requirePermission("documents.generated.read"),
    async (c) => {
      try {
        return c.json(
          await service.getGeneratedDownload({
            companyId: companyId(c),
            id: c.req.param("id"),
          }),
        );
      } catch (error) {
        return handleError(c, error);
      }
    },
  );

  app.patch(
    "/documents/generated/:id/enabled",
    requirePermission("documents.generated.delete"),
    zValidator("json", documentGeneratedEnabledSchema),
    async (c) => {
      try {
        return c.json(
          await service.setGeneratedEnabled({
            companyId: companyId(c),
            id: c.req.param("id"),
            actorId: actorId(c),
            input: c.req.valid("json"),
          }),
        );
      } catch (error) {
        return handleError(c, error);
      }
    },
  );

  return app;
}
