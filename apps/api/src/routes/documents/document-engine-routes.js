// Routes of the documents engine: kinds, file templates (docx/xlsx/pptx/pdf)
// and generate/preview. Authorization: documents.templates.* OR, for a kind
// that declares `managePermissionKey`, that permission (so module screens
// embedding the template manager do not need Documents access). Generation is
// checked by the engine against the kind's own permission as the acting user.
import { Hono } from "hono";

import { DocumentProviderError } from "./document-errors.js";
import { DocumentTemplateServiceError } from "./document-errors.js";

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
// `activeModules(companyId, moduleKeys)` resolves to a Map(moduleKey -> name) of the
// modules installed and enabled for the company; without it every kind is listed.
export function createDocumentEngineRoutes({ hub, guard, activeModules = null }) {
  const app = new Hono();
  const { kinds, fileTemplates, engine, files } = hub;

  function allowed(c, action, kindKey) {
    const { permissions, isAdmin } = access(c);
    if (isAdmin || permissions.includes(`documents.templates.${action}`)) return true;
    const kind = kinds.getKind(kindKey);
    if (action === "read" && kind?.permissionKey && permissions.includes(kind.permissionKey)) return true;
    return Boolean(kind?.managePermissionKey && permissions.includes(kind.managePermissionKey));
  }

  const deny = (c) => c.json({ error: "No tienes permiso para esta acción en Documentos.", code: "forbidden" }, 403);

  // Runs `fn` after checking the permission for the kind of template :id.
  // Personal templates are visible only to their owner; the owner or a user
  // with the manage permission may change them.
  function onTemplate(action, fn) {
    return async (c, next) => {
      try {
        const info = await fileTemplates.describe({ companyId: companyId(c), templateId: c.req.param("id") });
        if (!info) return c.json({ error: "Plantilla no encontrada.", code: "template_not_found" }, 404);
        const owner = Boolean(profileId(c) && info.ownerUserId === profileId(c));
        if (action === "read") {
          if (info.visibility === "personal" && !owner) return c.json({ error: "Plantilla no encontrada.", code: "template_not_found" }, 404);
          if (!allowed(c, action, info.kind) && !owner) return deny(c);
        } else if (!owner && !allowed(c, action, info.kind)) {
          return deny(c);
        }
        return c.json(await fn(c));
      } catch (error) {
        return handleError(c, error);
      }
    };
  }

  const ids = (c) => ({ companyId: companyId(c), templateId: c.req.param("id"), versionId: c.req.param("versionId"), viewerId: profileId(c) });
  const visibilityOf = (value) => (value === "company" ? "company" : "personal");

  // Kinds of modules that are installed and enabled for the company and for
  // which the user has the kind's permission, plus the always-available ones
  // (general.manual).
  app.get("/documents/kinds", guard, async (c) => {
    const { permissions, isAdmin } = access(c);
    const permitted = kinds.listKinds().filter(
      (kind) => isAdmin || permissions.includes(kind.permissionKey) || permissions.includes(kind.managePermissionKey),
    );
    const moduleKeys = [...new Set(permitted.map((kind) => kind.moduleKey).filter(Boolean))];
    let modules = null;
    try {
      modules = activeModules && moduleKeys.length ? await activeModules(companyId(c), moduleKeys) : null;
    } catch (error) {
      return handleError(c, error);
    }
    const visible = permitted.filter((kind) => kind.alwaysVisible || !kind.moduleKey || !activeModules || modules?.has(kind.moduleKey));
    return c.json({
      items: visible.map((kind) => ({
        key: kind.key,
        label: kind.label ?? kind.key,
        moduleKey: kind.moduleKey ?? null,
        moduleName: (kind.moduleKey && modules?.get(kind.moduleKey)) || null,
        formats: kind.formats ?? ["docx", "xlsx", "pptx", "pdf"],
        schema: kind.schema,
        freeTags: Boolean(kind.freeTags),
      })),
    });
  });

  // Templates of a kind (kind permission applies) or, without ?kind=, every template of the company.
  app.get("/documents/templates", guard, async (c) => {
    const kind = optionalText(c.req.query("kind"));
    if (!allowed(c, "read", kind)) return deny(c);
    try {
      return c.json({ items: await fileTemplates.list({ companyId: companyId(c), kind, scopeKey: optionalText(c.req.query("scopeKey")), viewerId: profileId(c) }) });
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
          visibility: visibilityOf(form.visibility),
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
          visibility: visibilityOf(body.visibility),
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

  app.post("/documents/templates/:id/versions/:versionId/publish", guard, onTemplate("publish", (c) => fileTemplates.publishVersion(ids(c))));

  app.patch("/documents/templates/:id/visibility", guard, onTemplate("update", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return fileTemplates.setVisibility({ ...ids(c), visibility: body.visibility });
  }));

  app.patch("/documents/templates/:id/default", guard, onTemplate("update", (c) => fileTemplates.setDefault(ids(c))));

  app.get("/documents/templates/:id/file", guard, onTemplate("read", (c) => fileTemplates.fileUrl({ ...ids(c), versionId: c.req.query("versionId") })));

  app.delete("/documents/templates/:id", guard, onTemplate("delete", (c) => fileTemplates.remove(ids(c))));

  // versionId (a draft to try out) is honoured by previews only.
  function generationInput(c, body, forPreview = false) {
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
      versionId: forPreview ? optionalText(body.versionId) ?? undefined : undefined,
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
      const preview = await engine.preview(generationInput(c, await c.req.json().catch(() => ({})), true));
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
