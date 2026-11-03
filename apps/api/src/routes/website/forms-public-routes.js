import { createHash, randomBytes } from "node:crypto";

import { Hono } from "hono";

import {
  createTokenBucketLimiter,
  createTurnstileVerifier,
  readJsonBody,
} from "../storefront/storefront-capture-routes.js";
import {
  StorefrontCaptureError,
  createStorefrontCaptureService,
} from "../../services/storefront-capture-service.js";
import { createNotificationService } from "../../services/notification-service.js";

const LEGACY_SUNSET = "Wed, 30 Sep 2026 00:00:00 GMT";

function legacyIdempotencyKey(body) {
  return createHash("sha256")
    .update(JSON.stringify(body))
    .update(String(Date.now()))
    .update(randomBytes(16))
    .digest("hex");
}

function setDeprecationHeaders(c) {
  c.header("Deprecation", "true");
  c.header("Sunset", LEGACY_SUNSET);
  c.header(
    "Link",
    '</public/storefront/v1/forms/{formId}/submissions>; rel="successor-version"',
  );
}

export function createPublicFormsRouter({
  prisma,
  captureService = createStorefrontCaptureService({
    prisma,
    verifyTurnstile: createTurnstileVerifier(),
    notificationService: createNotificationService({ prisma }),
  }),
  limiter = createTokenBucketLimiter({
    capacity: 10,
    refillPerSecond: 0.2,
  }),
}) {
  const app = new Hono();

  app.post("/forms/:formId/submit", async (c) => {
    setDeprecationHeaders(c);
    const formId = c.req.param("formId");

    try {
      const form = await prisma.websiteForm.findFirst({
        where: { id: formId, enabled: true },
        select: { id: true, companyId: true, siteId: true },
      });
      if (!form) {
        throw new StorefrontCaptureError(
          "form_not_found",
          "Formulario no encontrado.",
          404,
        );
      }
      const company = await prisma.company.findUnique({
        where: { id: form.companyId },
        select: { slug: true },
      });
      if (!company) {
        throw new StorefrontCaptureError(
          "company_not_found",
          "Empresa no encontrada.",
          404,
        );
      }

      const address =
        c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
        c.req.header("X-Real-IP") ||
        "unknown";
      const rate = limiter.consume(
        `legacy:${form.companyId}:${form.siteId}:${address}`,
      );
      if (!rate.allowed) {
        c.header("Retry-After", String(rate.retryAfter));
        return c.json({ error: "Demasiadas solicitudes." }, 429);
      }

      const body = await readJsonBody(c);
      const idempotencyKey =
        c.req.header("Idempotency-Key") || legacyIdempotencyKey(body);
      const scope=await prisma.websiteFormScope.findFirst({where:{companyId:form.companyId,formId:form.id}});
      const result = await captureService.submitForm({
        companySlug: company.slug,
        siteId: form.siteId,
        ...(scope?.ownerKind==='website'?{websiteSiteId:scope.ownerWebsiteSiteId}:scope?.ownerKind==='growth_property'?{propertyId:scope.ownerPropertyId}:{}),
        formId: form.id,
        origin: c.req.header("Origin") || undefined,
        idempotencyKey,
        payload: {
          values: body,
          honeypot: "",
        },
      });

      return c.json({ data: result, ok: true }, result.replayed ? 200 : 201);
    } catch (error) {
      if (error instanceof StorefrontCaptureError) {
        return c.json(
          {
            error: error.message,
            code: error.code,
            ...(error.details ? { details: error.details } : {}),
          },
          error.status,
        );
      }
      console.error("[public/website/forms/submit]", error);
      return c.json({ error: "Error interno" }, 500);
    }
  });

  return app;
}
