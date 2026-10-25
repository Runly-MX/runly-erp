// DEPRECATED proxy: custody document templates now live in the documents hub
// (kind inventory.custody). This keeps the old /inventory/document-templates
// contract (list/upload/replace/suggest/update/delete/file) answering from
// hub.fileTemplates for one release; new code uses /documents/templates.
import { InventoryServiceError } from './inventory-guards.js';
import {
  CUSTODY_IMAGE_TAGS, CUSTODY_ITEM_TAGS, CUSTODY_SCALAR_TAGS,
  NO_TAGS_WARNING, unknownCustodyTags,
} from './document-templates/custody-template-data.js';

const KIND = 'inventory.custody';

// Placeholder reference shown next to the template list.
export const CUSTODY_PLACEHOLDERS = {
  scalars: CUSTODY_SCALAR_TAGS,
  loops: { items: CUSTODY_ITEM_TAGS },
  images: CUSTODY_IMAGE_TAGS,
};

export function serializeTemplate(row) {
  const tags = Array.isArray(row.placeholders) ? row.placeholders : [];
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    name: row.name,
    fileAssetId: row.fileAssetId,
    placeholders: tags,
    tagCount: tags.length,
    warnings: [
      ...unknownCustodyTags(tags).map((tag) => `Etiqueta desconocida: {{${tag.replace(/^items\./, '')}}}`),
      ...(tags.length ? [] : [NO_TAGS_WARNING]),
    ],
    isDefault: row.isDefault,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Old row shape from a hub template ({ template, version } serialized by the hub).
export function fromHubTemplate(template) {
  const version = template.version ?? null;
  return serializeTemplate({
    id: template.id,
    kind: 'custody',
    format: template.format,
    name: template.name,
    fileAssetId: version?.fileAssetId ?? null,
    placeholders: version?.placeholders ?? [],
    isDefault: template.isDefault,
    enabled: template.enabled,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });
}

export function createInventoryDocumentTemplateService({ prisma, hub }) {
  const { fileTemplates } = hub;

  // Hub errors carry a status; the inventory routes only render InventoryServiceError.
  async function wrap(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err?.name === 'DocumentTemplateServiceError' || err?.name === 'DocumentProviderError') throw new InventoryServiceError(err.message, err.status ?? 400);
      throw err;
    }
  }

  async function find(id, companyId) {
    const row = await prisma.documentTemplate.findFirst({ where: { id, companyId, kind: KIND, enabled: true, format: { not: 'blocks' } } });
    if (!row) throw new InventoryServiceError('Plantilla no encontrada.', 404);
    return row;
  }

  const list = (companyId, viewerId = null) => wrap(async () => (await fileTemplates.list({ companyId, kind: KIND, viewerId })).map(fromHubTemplate));

  async function currentVersionId(row) {
    if (row.publishedVersionId) return row.publishedVersionId;
    const top = await prisma.documentTemplateVersion.findMany({ where: { templateId: row.id }, orderBy: { versionNumber: 'desc' }, take: 1 });
    return top[0]?.id ?? null;
  }

  const upload = ({ companyId, profileId, file, name, isDefault = false }) => wrap(async () => {
    const result = await fileTemplates.upload({ companyId, profileId, kind: KIND, file, name, isDefault, publish: true });
    return { template: fromHubTemplate(result.template), warnings: result.warnings };
  });

  // Replaces the file of a template (edited offline and re-uploaded): the new
  // version is published right away so every custody using it picks it up.
  const replaceFile = ({ id, companyId, profileId, file }) => wrap(async () => {
    const row = await find(id, companyId);
    const versionId = await currentVersionId(row);
    let result = await fileTemplates.replaceVersionFile({ companyId, profileId, templateId: id, versionId, file });
    if (result.template.version?.status !== 'published') {
      result = { ...(await fileTemplates.publishVersion({ companyId, templateId: id, versionId: result.template.version.id })), warnings: result.warnings };
    }
    return { template: fromHubTemplate(result.template), warnings: result.warnings };
  });

  // Same file with suggested tags placed (not saved); Word forms only.
  const suggestTags = (id, companyId) => wrap(async () => {
    const row = await find(id, companyId);
    if (row.format !== 'docx') throw new InventoryServiceError('Por ahora las etiquetas sugeridas funcionan con plantillas de Word (.docx).', 400);
    const result = await fileTemplates.suggest({ companyId, templateId: id, versionId: await currentVersionId(row) });
    return { applied: result.applied, missing: result.missing, fileName: result.fileName, contentBase64: result.contentBase64 };
  });

  const update = (id, companyId, body = {}) => wrap(async () => {
    const row = await find(id, companyId);
    if (body.name !== undefined) {
      const cleanName = String(body.name ?? '').trim().slice(0, 200);
      if (!cleanName) throw new InventoryServiceError('Escribe el nombre de la plantilla.', 400);
      await prisma.documentTemplate.update({ where: { id }, data: { name: cleanName } });
    }
    if (body.isDefault === true) await fileTemplates.setDefault({ companyId, templateId: id });
    else if (body.isDefault === false && row.isDefault) await prisma.documentTemplate.update({ where: { id }, data: { isDefault: false } });
    const [updated] = (await fileTemplates.list({ companyId, kind: KIND })).filter((t) => t.id === id);
    return fromHubTemplate(updated);
  });

  const remove = (id, companyId) => wrap(async () => {
    await find(id, companyId);
    return fileTemplates.remove({ companyId, templateId: id });
  });

  const fileUrl = (id, companyId) => wrap(async () => {
    await find(id, companyId);
    return fileTemplates.fileUrl({ companyId, templateId: id });
  });

  return { list, upload, replaceFile, suggestTags, update, remove, fileUrl };
}
