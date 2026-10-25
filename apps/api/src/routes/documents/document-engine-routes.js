// Routes of the documents engine: kinds, file templates (docx/xlsx/pptx/pdf)
// and generate/preview. Authorization: documents.templates.* OR, for a kind
// that declares `managePermissionKey`, that permission (so module screens
// embedding the template manager do not need Documents access). Generation is
// checked by the engine against the kind's own permission as the acting user.
import { Hono } from "hono";

import { DocumentProviderError } from "./document-provider-registry.js";
import { DocumentTemplateServiceError } from "./document-template-service.js";

const companyId = (c) => c.get("companyId") ?? null;
const profileId = (c) => c.get("userContext")?.profile?.id ?? c.get("userId") ?? null;

function access(c) {
  const context = c.get("userContext");
  const permissions =
    context?.permissionSet instanceof Set
      ? [...context.permissionSet]
      : Array.isArray(context?.permissions)
        ? context.permissions
        : [];
  return { permissions, isAdmin: Boolean(context?.isAdmin) };
}

function handleError(c, error) {
  if (error instanceof DocumentTemplateServiceError || error instanceof DocumentProviderError) {
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  console.error("[runly.documents.engine]", error);
  return c.json({ error: "Error interno de Documentos." }, 500);
}

const flag = (value) => value === true || value === "true" || value === "1";
const optionalText = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

// `guard` establishes the signed-in user and active company (index.js
// requireActiveCompany); the per-route permission rule runs after it.
export function createDocumentEngineRoutes({ hub, guard }) {
  const app = new Hono();
  const { kinds, fileTemplates, engine, files } = hub;

  function allowed(c, action, kindKey) {
    const { permissions, isAdmin } = access(c);
    if (isAdmin || permissions.includes(`documents.templates.${action}`)) return true;
    const kind = kinds.getKind(kindKey);
    return Boolean(kind?.managePermissionKey && permissions.includes(kind.managePermissionKey));
  }

  const deny = (c) => c.json({ error: "No tienes permiso para esta acción en Documentos.", code: "forbidden" }, 403);

  // Runs `fn` after checking the permission for the kind of template :id.
  function onTemplate(action, fn) {
    return async (c, next) => {
      try {
        const info = await fileTemplates.describe({ companyId: companyId(c), templateId: c.req.param("id") });
        if (!info) return c.json({ error: "Plantilla no encontrada.", code: "template_not_found" }, 404);
        if (info.format === "blocks") return next();
        if (!allowed(c, action, info.kind)) return deny(c);
        return c.json(await fn(c));
      } catch (error) {
        return handleError(c, error);
      }
    };
  }

  const ids = (c) => ({ companyId: companyId(c), templateId: c.req.param("id"), versionId: c.req.param("versionId") });

  app.get("/documents/kinds", guard, async (c) => {
    const { permissions, isAdmin } = access(c);
    const everything = isAdmin || permissions.includes("documents.templates.read");
    const visible = kinds.listKinds().filter(
      (kind) => everything || permissions.includes(kind.permissionKey) || permissions.includes(kind.managePermissionKey),
    );
    return c.json({
      items: visible.map((kind) => ({
        key: kind.key,
        label: kind.label ?? kind.key,
        formats: kind.formats ?? ["docx", "xlsx", "pptx", "pdf"],
        schema: kind.schema,
      })),
    });
  });

  // With ?kind= this is the file-template list; without it the legacy list answers.
  app.get("/documents/templates", guard, async (c, next) => {
    const kind = optionalText(c.req.query("kind"));
    if (!kind) return next();
    if (!allowed(c, "read", kind)) return deny(c);
    try {
      return c.json({ items: await fileTemplates.list({ companyId: companyId(c), kind, scopeKey: optionalText(c.req.query("scopeKey")) }) });
    } catch (error) {
      return handleError(c, error);
    }
  });

  app.post("/documents/templates/upload", guard, async (c) => {
    try {
      const form = await c.req.parseBody();
      const kind = optionalText(form.kind);
      if (!allowed(c, "create", kind)) return deny(c);
      return c.json(
        await fileTemplates.upload({
          companyId: companyId(c),
          profileId: profileId(c),
          kind,
          scopeKey: optionalText(form.scopeKey),
          file: form.file,
          name: form.name,
          isDefault: flag(form.isDefault),
          publish: flag(form.publish),
        }),
        201,
      );
    } catch (error) {
      return handleError(c, error);
    }
  });

  app.post("/documents/templates/blank", guard, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      if (!allowed(c, "create", body.kind)) return deny(c);
      return c.json(
        await fileTemplates.createBlank({
          companyId: companyId(c),
          profileId: profileId(c),
          kind: body.kind,
          scopeKey: optionalText(body.scopeKey),
          format: body.format,
          name: body.name,
          isDefault: flag(body.isDefault),
          publish: flag(body.publish),
        }),
        201,
      );
    } catch (error) {
      return handleError(c, error);
    }
  });

  app.post("/documents/templates/:id/versions/:versionId/suggest", guard, onTemplate("update", (c) => fileTemplates.suggest(ids(c))));

  app.put(
    "/documents/templates/:id/versions/:versionId/file",
    guard,
    onTemplate("update", async (c) => {
      const form = await c.req.parseBody().catch(() => ({}));
      return fileTemplates.replaceVersionFile({ ...ids(c), profileId: profileId(c), file: form.file ?? null });
    }),
  );

  app.patch(
    "/documents/templates/:id/versions/:versionId/mapping",
    guard,
    onTemplate("update", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      return fileTemplates.saveMapping({ ...ids(c), mapping: body.mapping, layout: body.layout });
    }),
  );

  // Block templates keep the legacy publish route (next()).
  app.post("/documents/templates/:id/versions/:versionId/publish", guard, onTemplate("publish", (c) => fileTemplates.publishVersion(ids(c))));

  app.patch("/documents/templates/:id/default", guard, onTemplate("update", (c) => fileTemplates.setDefault(ids(c))));

  app.get("/documents/templates/:id/file", guard, onTemplate("read", (c) => fileTemplates.fileUrl({ ...ids(c), versionId: c.req.query("versionId") })));

  app.delete("/documents/templates/:id", guard, onTemplate("delete", (c) => fileTemplates.remove(ids(c))));

  function generationInput(c, body) {
    const images = {};
    for (const [key, value] of Object.entries(body.images ?? {})) {
      if (typeof value === "string") images[key] = Buffer.from(value, "base64");
    }
    return {
      companyId: companyId(c),
      actorId: profileId(c),
      ...access(c),
      kind: body.kind,
      templateId: optionalText(body.templateId) ?? undefined,
      scopeKey: optionalText(body.scopeKey),
      data: body.data && typeof body.data === "object" ? body.data : undefined,
      sourceId: optionalText(body.sourceId) ?? undefined,
      images,
      output: body.output === "pdf" ? "pdf" : "native",
    };
  }

  app.post("/documents/generate", guard, async (c) => {
    try {
      const result = await engine.generate(generationInput(c, await c.req.json().catch(() => ({}))));
      const asset = await files.findAsset(companyId(c), result.fileAssetId);
      const { url, expiresIn } = await files.signedUrl(asset);
      return c.json({
        generated: result.generated,
        fileAssetId: result.fileAssetId,
        format: result.format,
        converted: result.converted,
        fileName: result.fileName,
        url,
        expiresIn,
      }, 201);
    } catch (error) {
      return handleError(c, error);
    }
  });

  app.post("/documents/preview", guard, async (c) => {
    try {
      const preview = await engine.preview(generationInput(c, await c.req.json().catch(() => ({}))));
      return c.body(preview.buffer, 200, {
        "Content-Type": preview.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(preview.fileName)}"`,
        "X-Document-Format": preview.format,
        "X-Document-Converted": String(preview.converted),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return handleError(c, error);
    }
  });

  return app;
}
