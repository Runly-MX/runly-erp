// Shared helpers for the legacy import toolkit: errors, date coercion, audit
// entries and server-side file storage with checksum. Internal only: called by
// migration scripts running with the API env, never exposed over HTTP.
import crypto from 'node:crypto';

export const STORAGE_BUCKET = 'runly-files';
export const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;

export class LegacyImportError extends Error {
  constructor(message, code = 'VALIDATION', extra = undefined) {
    super(message);
    this.name = 'LegacyImportError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

export function assertRequired(value, message) {
  if (value === undefined || value === null || value === '') throw new LegacyImportError(message);
  return value;
}

// YYYY-MM-DD, ISO string or Date -> UTC-midnight Date (Postgres DATE columns).
export function toDateOnly(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new LegacyImportError('La fecha no es válida.');
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new LegacyImportError(`La fecha no es válida: ${String(value).slice(0, 40)}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) throw new LegacyImportError(`La fecha no es válida: ${String(value).slice(0, 40)}`);
  return date;
}

// Full timestamp (keeps the time when the source has it).
export function toTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new LegacyImportError(`La fecha no es válida: ${String(value).slice(0, 40)}`);
  return date;
}

export const clip = (value, max) => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text ? text.slice(0, max) : null;
};

export const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// Audit entry for an imported row; metadata always carries source + legacy id.
export function writeImportAudit(db, { companyId, actorId, moduleKey, entityType, entityId, action, after, source, legacyId, extra }) {
  return db.auditLog.create({
    data: {
      companyId, actorId: actorId ?? null, moduleKey, entityType, entityId, action,
      ...(after ? { after } : {}),
      metadata: { source, legacyId: legacyId == null ? null : String(legacyId), imported: true, ...(extra ?? {}) },
    },
  });
}

const segment = (value) => String(value).toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';

function extensionOf(fileName, mimeType) {
  const ext = String(fileName ?? '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext && ext !== String(fileName ?? '').toLowerCase()) return ext;
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (/xml/.test(mimeType ?? '')) return 'xml';
  return 'bin';
}

// Uploads buffers to the private files bucket with the files-service layout
// (FileAsset.entityId = companyId, owning record id in metadata.sourceEntityId).
// `upload` returns the FileAsset create data so the caller can insert the row
// inside its own transaction; `remove` undoes an upload whose row failed.
export function createLegacyFileStore({ supabaseAdmin, maxBytes = DEFAULT_MAX_FILE_BYTES }) {
  function bucket() {
    if (!supabaseAdmin?.storage) throw new LegacyImportError('El almacenamiento de archivos no está disponible.', 'STORAGE');
    return supabaseAdmin.storage.from(STORAGE_BUCKET);
  }

  function checkBuffer(buffer, limit = maxBytes) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new LegacyImportError('El archivo está vacío.');
    if (buffer.length > limit) {
      throw new LegacyImportError(`El archivo supera el límite de migración (${Math.round(limit / 1048576)} MB).`, 'TOO_LARGE');
    }
  }

  async function upload({ companyId, uploadedById = null, buffer, fileName, mimeType, moduleKey, entityType, sourceEntityId, metadata = {}, limit }) {
    checkBuffer(buffer, limit ?? maxBytes);
    const type = mimeType || 'application/octet-stream';
    const objectKey = `modules/${segment(moduleKey)}/${segment(entityType)}/${segment(companyId)}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extensionOf(fileName, type)}`;
    const { error } = await bucket().upload(objectKey, buffer, { contentType: type, upsert: false });
    if (error) throw new LegacyImportError('No se pudo guardar el archivo.', 'STORAGE');
    return {
      bucket: STORAGE_BUCKET,
      objectKey,
      originalName: String(fileName || `archivo.${extensionOf(fileName, type)}`).slice(0, 255),
      mimeType: type,
      sizeBytes: buffer.length,
      checksum: sha256(buffer),
      visibility: 'PRIVATE',
      moduleKey,
      entityType,
      entityId: companyId,
      accessScope: 'COMPANY',
      uploadedById,
      metadata: { ...metadata, companyId, sourceEntityId: sourceEntityId ? String(sourceEntityId) : null },
    };
  }

  async function remove(objectKey) {
    try { await bucket().remove([objectKey]); } catch { /* best effort */ }
  }

  return { upload, remove, checkBuffer };
}

// Uploads, then runs `write(tx, assetData)` in a transaction; removes the
// stored object when the transaction fails so nothing is left orphaned.
export async function uploadThenWrite(prisma, fileStore, uploadInput, write, { timeout = 60_000 } = {}) {
  const assetData = await fileStore.upload(uploadInput);
  try {
    return await prisma.$transaction((tx) => write(tx, assetData), { timeout, maxWait: 10_000 });
  } catch (err) {
    await fileStore.remove(assetData.objectKey);
    throw err;
  }
}
