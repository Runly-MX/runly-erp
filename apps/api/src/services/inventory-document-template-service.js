// Company document templates for runly.inventory (custody / resguardo).
// Uploaded .docx/.xlsx are validated (compile + tag scan) and stored as
// private FileAssets; the detected tags are kept on the row so warnings can
// be shown without reopening the file.
import { InventoryServiceError } from './inventory-guards.js';
import { createCustodyFileStore } from './inventory-custody-files.js';
import { TemplateError } from './document-templates/template-tags.js';
import {
  CUSTODY_IMAGE_TAGS, CUSTODY_ITEM_TAGS, CUSTODY_SCALAR_TAGS, buildDefaultCustodyTemplate,
  inspectCustodyTemplate, templateFormatOf, unknownCustodyTags,
} from './document-templates/custody-template-data.js';

const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

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
    warnings: unknownCustodyTags(tags).map((tag) => `Etiqueta desconocida: {{${tag.replace(/^items\./, '')}}}`),
    isDefault: row.isDefault,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createInventoryDocumentTemplateService({ prisma, supabaseAdmin }) {
  const files = createCustodyFileStore({ prisma, supabaseAdmin });

  async function find(id, companyId) {
    const row = await prisma.invDocumentTemplate.findFirst({ where: { id, companyId, enabled: true } });
    if (!row) throw new InventoryServiceError('Plantilla no encontrada.', 404);
    return row;
  }

  async function list(companyId) {
    const rows = await prisma.invDocumentTemplate.findMany({
      where: { companyId, kind: 'custody', enabled: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(serializeTemplate);
  }

  async function upload({ companyId, profileId, file, name, isDefault = false }) {
    if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw new InventoryServiceError('Adjunta un archivo .docx o .xlsx.', 400);
    if (file.size > MAX_TEMPLATE_BYTES) throw new InventoryServiceError('La plantilla supera 10 MB.', 400);
    let format;
    let inspection;
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      format = templateFormatOf(file.name);
      inspection = await inspectCustodyTemplate(buffer, format);
    } catch (err) {
      if (err instanceof TemplateError) throw new InventoryServiceError(err.message, 400);
      throw err;
    }
    const cleanName = String(name ?? '').trim().slice(0, 200) || String(file.name).replace(/\.[^.]+$/, '').slice(0, 200) || 'Plantilla';
    const asset = await files.store({
      companyId, uploadedById: profileId, buffer, fileName: file.name, mimeType: MIME_TYPES[format], entityType: 'InvDocumentTemplate',
    });
    const row = await prisma.$transaction(async (tx) => {
      const makeDefault = isDefault === true || (await tx.invDocumentTemplate.count({ where: { companyId, kind: 'custody', enabled: true } })) === 0;
      if (makeDefault) await tx.invDocumentTemplate.updateMany({ where: { companyId, kind: 'custody' }, data: { isDefault: false } });
      const created = await tx.invDocumentTemplate.create({
        data: { companyId, kind: 'custody', format, name: cleanName, fileAssetId: asset.id, placeholders: inspection.tags, isDefault: makeDefault, createdById: profileId ?? null },
      });
      await tx.fileAsset.update({ where: { id: asset.id }, data: { metadata: { ...(asset.metadata ?? {}), sourceEntityId: created.id } } });
      return created;
    });
    return { template: serializeTemplate(row), warnings: inspection.warnings };
  }

  async function update(id, companyId, body = {}) {
    const row = await find(id, companyId);
    const data = {};
    if (body.name !== undefined) {
      const cleanName = String(body.name ?? '').trim().slice(0, 200);
      if (!cleanName) throw new InventoryServiceError('Escribe el nombre de la plantilla.', 400);
      data.name = cleanName;
    }
    if (body.isDefault !== undefined) data.isDefault = body.isDefault === true;
    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.invDocumentTemplate.updateMany({ where: { companyId, kind: row.kind, NOT: { id } }, data: { isDefault: false } });
      return tx.invDocumentTemplate.update({ where: { id }, data });
    });
    return serializeTemplate(updated);
  }

  async function remove(id, companyId) {
    await find(id, companyId);
    await prisma.invDocumentTemplate.update({ where: { id }, data: { enabled: false, isDefault: false } });
    return { ok: true };
  }

  async function fileUrl(id, companyId) {
    const row = await find(id, companyId);
    const asset = await files.findAsset(companyId, row.fileAssetId);
    if (!asset) throw new InventoryServiceError('El archivo de la plantilla ya no existe.', 404);
    const { url, expiresIn } = await files.signedUrl(asset);
    return { url, expiresIn, fileName: asset.originalName };
  }

  // Template to render a custody with: the chosen one, else the company
  // default, else the built-in template.
  async function resolveForCustody(companyId, templateId) {
    const where = { companyId, kind: 'custody', enabled: true };
    const row = (templateId && await prisma.invDocumentTemplate.findFirst({ where: { ...where, id: templateId } }))
      || await prisma.invDocumentTemplate.findFirst({ where: { ...where, isDefault: true } });
    if (row) {
      const asset = await files.findAsset(companyId, row.fileAssetId);
      if (asset) return { template: row, format: row.format, buffer: await files.read(asset) };
    }
    return { template: null, format: 'docx', buffer: buildDefaultCustodyTemplate() };
  }

  return { list, upload, update, remove, fileUrl, resolveForCustody };
}
