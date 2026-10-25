// The documents engine every module calls to fill templates:
// generate({ kind, templateId?, data | sourceId, output }) picks the template
// (chosen, company default, kind built-in), applies the mapping, fills it by
// format (docx/xlsx/pptx/pdf), optionally converts to PDF, stores the result
// and records a GeneratedDocument. preview() does the same without storing.
import { renderDocx } from "../../services/document-templates/docx-template.js";
import { renderXlsx } from "../../services/document-templates/xlsx-template.js";
import { renderPptx } from "../../services/document-templates/pptx-template.js";
import { fillPdf } from "../../services/document-templates/pdf-template.js";
import { convertToPdf } from "../../services/document-templates/pdf-convert.js";
import { TemplateError, resolvePath, toText } from "../../services/document-templates/template-tags.js";
import { DocumentTemplateServiceError } from "./document-errors.js";
import { FORMAT_MIME, formatOfAsset, kindImageKeys } from "./document-template-files.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (message, status = 400, code = "document_engine_error") =>
  new DocumentTemplateServiceError(message, status, code);

// Example values built from the kind schema ("Probar con datos de ejemplo").
export function sampleDataFor(kind) {
  if (kind.sampleData) return structuredClone(kind.sampleData);
  const sample = {};
  for (const entry of kind.schema) {
    if (entry.type === "list") {
      sample[entry.tag] = [1, 2].map((n) =>
        Object.fromEntries((entry.fields ?? []).map((f) => [f.tag, `${f.label} ${n}`])));
    } else if (entry.type === "number") sample[entry.tag] = "123";
    else if (entry.type === "date") sample[entry.tag] = "01/01/2026";
    else if (entry.type !== "image") sample[entry.tag] = `${entry.label} de ejemplo`;
  }
  return sample;
}

// mapping: template tag -> path in the loaded data. `list.field` entries map a
// path relative to each element of that list.
export function applyMapping(data, mapping = {}) {
  const out = { ...data };
  for (const [tag, path] of Object.entries(mapping)) {
    const dot = tag.indexOf(".");
    if (dot === -1) {
      out[tag] = resolvePath(data, path);
      continue;
    }
    const list = tag.slice(0, dot);
    const field = tag.slice(dot + 1);
    const source = Array.isArray(out[list]) ? out[list] : resolvePath(data, list);
    if (Array.isArray(source)) out[list] = source.map((element) => ({ ...element, [field]: resolvePath(element, path) }));
  }
  return out;
}

export function createDocumentEngine({ prisma, files, kinds, convert = convertToPdf, now = () => new Date() }) {
  function kindOf(key) {
    const kind = kinds.getKind(key);
    if (!kind) throw fail("Tipo de documento no encontrado.", 404, "kind_not_found");
    return kind;
  }

  // Generation only uses published versions; a preview may also use the given draft.
  async function loadVersion(template, versionId, allowDraft = false) {
    const id = versionId ?? template.publishedVersionId;
    if (!id) throw fail("La plantilla no tiene una versión publicada.", 409, "template_not_published");
    const version = await prisma.documentTemplateVersion.findFirst({ where: { id, templateId: template.id } });
    if (!version || (!allowDraft && version.status !== "published")) throw fail("La plantilla no tiene una versión publicada.", 409, "template_not_published");
    return version;
  }

  // Chosen template, else the company default (scope, then no scope), else
  // the kind's built-in one ({ format, buffer } from kind.defaultTemplate()).
  async function resolveTemplate({ companyId, kind, templateId, scopeKey, versionId, allowDraft, actorId, trusted }) {
    const base = { companyId, kind: kind.key, enabled: true };
    // Defaults and fallbacks are always company templates; a chosen template may
    // also be the actor's own personal one (trusted module calls keep their stored choice).
    const shared = { ...base, visibility: "company" };
    let template = null;
    if (templateId) {
      template = await prisma.documentTemplate.findFirst({ where: { ...base, id: templateId } });
      const usable = template && (trusted || (template.visibility ?? "company") === "company" || (actorId && template.ownerUserId === actorId));
      if (!usable) throw fail("Plantilla no encontrada.", 404, "template_not_found");
    } else {
      if (scopeKey) template = await prisma.documentTemplate.findFirst({ where: { ...shared, scopeKey, isDefault: true } });
      template ??= await prisma.documentTemplate.findFirst({ where: { ...shared, scopeKey: null, isDefault: true } });
    }
    if (template) {
      const version = await loadVersion(template, allowDraft ? versionId : undefined, allowDraft);
      const asset = await files.findAsset(companyId, version.fileAssetId);
      if (!asset) throw fail("El archivo de la plantilla ya no existe.", 404, "file_not_found");
      return { template, version, format: formatOfAsset(asset, template.format), buffer: await files.read(asset), mapping: version.mapping ?? {}, layout: version.layout };
    }
    const builtIn = typeof kind.defaultTemplate === "function" ? await kind.defaultTemplate() : null;
    if (!builtIn) throw fail("No hay una plantilla para este documento; sube una en Documentos.", 404, "no_template");
    return { template: null, version: null, format: builtIn.format, buffer: builtIn.buffer, mapping: {}, layout: null };
  }

  async function fill({ format, buffer, data, images, layout, kind, title }) {
    const imageKeys = kindImageKeys(kind);
    const filled = { ...data };
    // Image tags carry their key; the renderers look the picture up by it.
    for (const key of Object.keys(images)) filled[key] = key;
    try {
      // Optional per-format image sizing from the kind (e.g. QR, signature and logo boxes).
      const imageSize = kind.imageSize?.[format]?.(images);
      if (format === "docx") return await renderDocx(buffer, filled, { images, imageSize });
      if (format === "xlsx") return await renderXlsx(buffer, filled, { images });
      if (format === "pptx") return renderPptx(buffer, filled, { images, imageSize });
      const text = Object.fromEntries(Object.entries(filled).map(([key, value]) => [key, Array.isArray(value) ? "" : toText(value)]));
      for (const field of layout?.fields ?? []) if (images[field.key]) imageKeys.add(field.key);
      return await fillPdf({ buffer, layout, data: text, images, imageKeys, title, issuedAt: now() });
    } catch (error) {
      if (error instanceof TemplateError) throw fail(error.message);
      throw error;
    }
  }

  async function render({ companyId, actorId, permissions, isAdmin, trusted, title: titleOverride, kind: kindKey, templateId, versionId, allowDraft = false, scopeKey = null, data, sourceId, images = {}, output = "native", sample = false }) {
    const kind = kindOf(kindKey);
    if (!trusted) kinds.assertPermission(kind, { permissionKeys: permissions, isAdmin });
    let values = data;
    if (!values && sample) values = sampleDataFor(kind);
    if (!values) {
      if (!sourceId) throw fail("Indica el registro (sourceId) o los datos para generar el documento.");
      values = await kind.load({ companyId, sourceId, actorId });
    }
    const source = await resolveTemplate({ companyId, kind, templateId, scopeKey, versionId, allowDraft, actorId, trusted });
    const title = titleOverride || source.template?.name || kind.label || kind.key;
    const mapped = applyMapping(values, source.mapping);
    let buffer = await fill({ format: source.format, buffer: source.buffer, data: mapped, images, layout: source.layout, kind, title });
    let format = source.format;
    let converted = false;
    if (output === "pdf" && format !== "pdf") {
      const pdf = await convert(buffer, `${title}.${format}`);
      if (pdf) {
        buffer = pdf;
        format = "pdf";
        converted = true;
      }
    }
    return { buffer, format, converted, title, template: source.template, version: source.version, mimeType: FORMAT_MIME[format] };
  }

  const fileNameOf = (title, format) =>
    `${String(title).trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "documento"}.${format}`;

  // Fills a template and returns the file without storing anything.
  async function preview(input) {
    const result = await render({ ...input, allowDraft: true, sample: input.data === undefined && !input.sourceId });
    return { buffer: result.buffer, format: result.format, converted: result.converted, mimeType: result.mimeType, fileName: fileNameOf(result.title, result.format) };
  }

  // Fills a template, stores the file and records a GeneratedDocument.
  async function generate(input) {
    const { companyId, actorId, kind: kindKey, sourceId } = input;
    const result = await render(input);
    const fileName = fileNameOf(result.title, result.format);
    const asset = await files.store({
      companyId, uploadedById: actorId ?? null, buffer: result.buffer, fileName, mimeType: result.mimeType, entityType: "GeneratedDocument",
      sourceEntityId: sourceId && UUID.test(sourceId) ? sourceId : null,
    });
    const generated = await prisma.generatedDocument.create({
      data: {
        companyId,
        templateId: result.template?.id ?? null,
        versionId: result.version?.id ?? null,
        sourceType: kindKey,
        sourceId: sourceId && UUID.test(sourceId) ? sourceId : null,
        kind: kindKey,
        outputFormat: result.format,
        fileAssetId: asset.id,
        status: "ready",
        generatedById: actorId ?? null,
        generatedAt: now(),
        metadata: { templateName: result.title, builtIn: !result.template, converted: result.converted },
      },
    });
    return { generated, fileAssetId: asset.id, format: result.format, converted: result.converted, fileName, buffer: result.buffer };
  }

  return { generate, preview, sampleDataFor };
}
