// File-based document templates (docx/xlsx/pptx/pdf) owned by the documents
// hub: upload, blank, replace, suggest tags/fields, mapping, default and
// publishing. Every template belongs to a registered kind (kind-registry).
import crypto from "node:crypto";

import { suggestDocxTagsWithLabels } from "../../services/document-templates/docx-autotag.js";
import { TemplateError } from "../../services/document-templates/template-tags.js";
import { DocumentTemplateServiceError } from "./document-template-service.js";
import {
  FORMAT_MIME,
  MAX_TEMPLATE_BYTES,
  buildBlankTemplate,
  formatOfFileName,
  kindLabels,
  scanTemplate,
} from "./document-template-files.js";

const fail = (message, status = 400, code = "document_template_error") =>
  new DocumentTemplateServiceError(message, status, code);

export function serializeFileTemplate(template, version) {
  const placeholders = Array.isArray(version?.placeholders) ? version.placeholders : [];
  return {
    id: template.id,
    kind: template.kind,
    format: template.format,
    scopeKey: template.scopeKey ?? null,
    name: template.name,
    isDefault: template.isDefault,
    enabled: template.enabled,
    publishedVersionId: template.publishedVersionId,
    version: version
      ? {
          id: version.id,
          versionNumber: version.versionNumber,
          status: version.status,
          fileAssetId: version.fileAssetId,
          placeholders,
          mapping: version.mapping ?? {},
          layout: version.layout ?? null,
        }
      : null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function createDocumentFileTemplateService({ prisma, files, kinds }) {
  function kindOf(key) {
    const kind = kinds.getKind(key);
    if (!kind) throw fail("Tipo de documento no encontrado.", 404, "kind_not_found");
    return kind;
  }

  async function findTemplate(companyId, id) {
    const template = await prisma.documentTemplate.findFirst({ where: { id, companyId, enabled: true } });
    if (!template || template.format === "blocks") throw fail("Plantilla no encontrada.", 404, "template_not_found");
    return template;
  }

  async function findVersion(templateId, versionId) {
    const version = await prisma.documentTemplateVersion.findFirst({ where: { id: versionId, templateId } });
    if (!version) throw fail("Versión no encontrada.", 404, "version_not_found");
    return version;
  }

  // The published version, else the newest one.
  async function currentVersion(template) {
    const versions = await prisma.documentTemplateVersion.findMany({
      where: { templateId: template.id },
      orderBy: { versionNumber: "desc" },
    });
    return versions.find((v) => v.id === template.publishedVersionId) ?? versions[0] ?? null;
  }

  function assertFormat(kind, format) {
    if (kind.formats && !kind.formats.includes(format)) {
      throw fail(`Este tipo de documento no admite archivos .${format}.`);
    }
  }

  async function scan(format, buffer, kind) {
    try {
      return await scanTemplate(format, buffer, kind);
    } catch (error) {
      if (error instanceof TemplateError) throw fail(error.message);
      throw error;
    }
  }

  async function readUpload(file, kind) {
    if (!file || typeof file.arrayBuffer !== "function" || !file.size) {
      throw fail("Adjunta un archivo .docx, .xlsx, .pptx o .pdf.");
    }
    if (file.size > MAX_TEMPLATE_BYTES) throw fail("La plantilla supera 10 MB.");
    const format = formatOfFileName(file.name);
    if (!format) throw fail("Formato no admitido; sube un archivo .docx, .xlsx, .pptx o .pdf.");
    assertFormat(kind, format);
    const buffer = Buffer.from(await file.arrayBuffer());
    return { buffer, format, scanned: await scan(format, buffer, kind) };
  }

  const storeFile = ({ companyId, profileId, buffer, fileName, format }) =>
    files.store({
      companyId, uploadedById: profileId, buffer, fileName, mimeType: FORMAT_MIME[format], entityType: "DocumentTemplate",
    });

  const cleanName = (name, fallback) => String(name ?? "").trim().slice(0, 200) || fallback;

  async function createTemplateRecord({ companyId, profileId, kind, scopeKey, format, name, asset, scanned, isDefault, publish }) {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.documentTemplate.count({ where: { companyId, kind: kind.key, scopeKey, enabled: true, format: { not: "blocks" } } });
      const makeDefault = isDefault === true || (publish && existing === 0);
      if (makeDefault) {
        await tx.documentTemplate.updateMany({ where: { companyId, kind: kind.key, scopeKey }, data: { isDefault: false } });
      }
      const template = await tx.documentTemplate.create({
        data: {
          companyId,
          key: `${kind.key}-${crypto.randomBytes(5).toString("hex")}`,
          name,
          sourceType: kind.key,
          kind: kind.key,
          format,
          scopeKey,
          isDefault: makeDefault,
        },
      });
      const version = await tx.documentTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          status: "draft",
          blocks: [],
          fileAssetId: asset.id,
          placeholders: scanned.tags,
          mapping: {},
          layout: scanned.layout,
          createdById: profileId ?? null,
        },
      });
      await tx.fileAsset.update({ where: { id: asset.id }, data: { metadata: { ...(asset.metadata ?? {}), sourceEntityId: template.id } } });
      return { template, version };
    });
    if (publish) {
      const published = await publishVersion({ companyId, templateId: created.template.id, versionId: created.version.id });
      return { ...published, warnings: scanned.warnings };
    }
    return { template: serializeFileTemplate(created.template, created.version), warnings: scanned.warnings };
  }

  async function upload({ companyId, profileId, kind: kindKey, scopeKey = null, file, name, isDefault = false, publish = false }) {
    const kind = kindOf(kindKey);
    const { buffer, format, scanned } = await readUpload(file, kind);
    const asset = await storeFile({ companyId, profileId, buffer, fileName: file.name, format });
    const fallback = String(file.name).replace(/\.[^.]+$/, "").slice(0, 200) || "Plantilla";
    return createTemplateRecord({
      companyId, profileId, kind, scopeKey, format, name: cleanName(name, fallback), asset, scanned, isDefault, publish,
    });
  }

  async function createBlank({ companyId, profileId, kind: kindKey, scopeKey = null, format = "docx", name, isDefault = false, publish = false }) {
    const kind = kindOf(kindKey);
    if (!["docx", "xlsx", "pptx"].includes(format)) throw fail("Solo se pueden crear documentos en blanco de Word, Excel o PowerPoint.");
    assertFormat(kind, format);
    const title = cleanName(name, kind.label ?? "Documento");
    const buffer = await buildBlankTemplate(format, kind, title);
    const scanned = await scan(format, buffer, kind);
    const asset = await storeFile({ companyId, profileId, buffer, fileName: `${title}.${format}`, format });
    return createTemplateRecord({ companyId, profileId, kind, scopeKey, format, name: title, asset, scanned, isDefault, publish });
  }

  // Replaces the file of a version (re-upload) or rescans the current one
  // (after an edit in the office editor). A published version is never
  // changed: the new file goes to a new draft that inherits mapping/layout.
  async function replaceVersionFile({ companyId, profileId, templateId, versionId, file = null }) {
    const template = await findTemplate(companyId, templateId);
    const kind = kindOf(template.kind);
    const version = await findVersion(templateId, versionId);
    let buffer;
    let asset = null;
    if (file) {
      const uploaded = await readUpload(file, kind);
      if (uploaded.format !== template.format) throw fail(`La plantilla es .${template.format}; sube un archivo .${template.format}.`);
      buffer = uploaded.buffer;
      asset = await storeFile({ companyId, profileId, buffer, fileName: file.name, format: template.format });
    } else {
      const current = await files.findAsset(companyId, version.fileAssetId);
      if (!current) throw fail("El archivo de la plantilla ya no existe.", 404, "file_not_found");
      buffer = await files.read(current);
    }
    const scanned = await scan(template.format, buffer, kind);
    const fileAssetId = asset?.id ?? version.fileAssetId;
    const layout = scanned.layout ?? version.layout ?? null;
    const saved = await prisma.$transaction(async (tx) => {
      let next;
      if (version.status === "published") {
        const top = await tx.documentTemplateVersion.findMany({ where: { templateId }, orderBy: { versionNumber: "desc" }, take: 1 });
        next = await tx.documentTemplateVersion.create({
          data: {
            templateId,
            versionNumber: (top[0]?.versionNumber ?? version.versionNumber) + 1,
            status: "draft",
            blocks: [],
            fileAssetId,
            placeholders: scanned.tags,
            mapping: version.mapping ?? {},
            layout,
            createdById: profileId ?? null,
          },
        });
      } else {
        next = await tx.documentTemplateVersion.update({ where: { id: version.id }, data: { fileAssetId, placeholders: scanned.tags, layout } });
      }
      if (asset) await tx.fileAsset.update({ where: { id: asset.id }, data: { metadata: { ...(asset.metadata ?? {}), sourceEntityId: templateId } } });
      return next;
    });
    return { template: serializeFileTemplate(template, saved), warnings: scanned.warnings };
  }

  // Suggestions for a version, nothing is saved: docx returns the file with
  // tags placed, pdf the detected field boxes; xlsx/pptx need manual {{tags}}.
  async function suggest({ companyId, templateId, versionId }) {
    const template = await findTemplate(companyId, templateId);
    const kind = kindOf(template.kind);
    const version = await findVersion(templateId, versionId);
    if (template.format === "xlsx" || template.format === "pptx") {
      return {
        supported: false,
        message: `Las etiquetas sugeridas aún no están disponibles para archivos .${template.format}; escribe las etiquetas {{campo}} directamente en el documento.`,
      };
    }
    const asset = await files.findAsset(companyId, version.fileAssetId);
    if (!asset) throw fail("El archivo de la plantilla ya no existe.", 404, "file_not_found");
    const buffer = await files.read(asset);
    if (template.format === "pdf") {
      const scanned = await scan("pdf", buffer, kind);
      return { supported: true, format: "pdf", layout: scanned.layout, warnings: scanned.warnings };
    }
    try {
      const result = suggestDocxTagsWithLabels(buffer, {
        labels: kindLabels(kind),
        itemColumns: kind.itemColumns ?? null,
        signatures: kind.signatures ?? [],
        important: kind.important ?? [],
      });
      const baseName = String(asset.originalName ?? template.name).replace(/\.docx$/i, "");
      return {
        supported: true,
        format: "docx",
        applied: result.applied,
        missing: result.missing,
        fileName: `${baseName} (con etiquetas).docx`,
        contentBase64: result.buffer.toString("base64"),
      };
    } catch (error) {
      if (error instanceof TemplateError) throw fail(error.message);
      throw error;
    }
  }

  // mapping: template tag -> data path. layout (pdf): adjusted field boxes.
  async function saveMapping({ companyId, templateId, versionId, mapping, layout }) {
    const template = await findTemplate(companyId, templateId);
    const version = await findVersion(templateId, versionId);
    if (version.status === "published") throw fail("La versión ya está publicada; crea una nueva para cambiar el mapeo.", 409, "version_published");
    const data = {};
    if (mapping !== undefined) {
      if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw fail("El mapeo debe ser un objeto etiqueta → campo.");
      const clean = {};
      for (const [tag, path] of Object.entries(mapping)) {
        if (typeof path !== "string") throw fail(`El campo asignado a «${tag}» no es válido.`);
        if (path.trim()) clean[tag] = path.trim();
      }
      data.mapping = clean;
    }
    if (layout !== undefined) {
      if (template.format !== "pdf") throw fail("Solo los PDF tienen posiciones de campos.");
      if (!layout || !Array.isArray(layout.fields)) throw fail("Envía la lista de campos del PDF.");
      data.layout = layout;
      data.placeholders = layout.fields.map((f) => f.key);
    }
    const updated = await prisma.documentTemplateVersion.update({ where: { id: version.id }, data });
    return serializeFileTemplate(template, updated);
  }

  async function publishVersion({ companyId, templateId, versionId }) {
    await findTemplate(companyId, templateId);
    const version = await findVersion(templateId, versionId);
    if (version.status === "published") throw fail("La versión ya está publicada.", 409, "version_published");
    const saved = await prisma.$transaction(async (tx) => {
      const published = await tx.documentTemplateVersion.update({ where: { id: versionId }, data: { status: "published", publishedAt: new Date() } });
      const updated = await tx.documentTemplate.update({ where: { id: templateId }, data: { publishedVersionId: versionId } });
      return { published, updated };
    });
    return { template: serializeFileTemplate(saved.updated, saved.published), warnings: [] };
  }

  // One default per (company, kind, scopeKey).
  async function setDefault({ companyId, templateId }) {
    const template = await findTemplate(companyId, templateId);
    if (!template.publishedVersionId) throw fail("Publica la plantilla antes de usarla como predeterminada.", 409, "template_not_published");
    const updated = await prisma.$transaction(async (tx) => {
      await tx.documentTemplate.updateMany({ where: { companyId, kind: template.kind, scopeKey: template.scopeKey, NOT: { id: templateId } }, data: { isDefault: false } });
      return tx.documentTemplate.update({ where: { id: templateId }, data: { isDefault: true } });
    });
    return serializeFileTemplate(updated, await currentVersion(updated));
  }

  async function list({ companyId, kind, scopeKey }) {
    const rows = await prisma.documentTemplate.findMany({
      where: { companyId, enabled: true, ...(kind ? { kind } : {}), ...(scopeKey ? { scopeKey } : {}) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    const out = [];
    for (const row of rows) out.push(serializeFileTemplate(row, row.format === "blocks" ? null : await currentVersion(row)));
    return out;
  }

  async function remove({ companyId, templateId }) {
    await findTemplate(companyId, templateId);
    await prisma.documentTemplate.update({ where: { id: templateId }, data: { enabled: false, isDefault: false } });
    return { ok: true };
  }

  async function fileUrl({ companyId, templateId, versionId }) {
    const template = await findTemplate(companyId, templateId);
    const version = versionId ? await findVersion(templateId, versionId) : await currentVersion(template);
    const asset = await files.findAsset(companyId, version?.fileAssetId);
    if (!asset) throw fail("El archivo de la plantilla ya no existe.", 404, "file_not_found");
    const { url, expiresIn } = await files.signedUrl(asset);
    return { url, expiresIn, fileName: asset.originalName };
  }

  return { upload, createBlank, replaceVersionFile, suggest, saveMapping, publishVersion, setDefault, list, remove, fileUrl };
}
