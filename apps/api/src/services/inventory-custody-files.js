// Server-side file storage for custody records: signature PNGs, generated
// documents and uploaded templates. Same layout as files-service uploads
// (private `runly-files` bucket, FileAsset.entityId = companyId, owning record
// id in metadata.sourceEntityId), but usable without a user session (public
// signing link, document generation).
import crypto from 'node:crypto';
import { InventoryServiceError } from './inventory-guards.js';

const BUCKET = 'runly-files';
const MODULE_KEY = 'runly.inventory';
const SIGNED_URL_SECONDS = 3600;

const segment = (value) => String(value).toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';

export function createCustodyFileStore({ prisma, supabaseAdmin }) {
  function storage() {
    if (!supabaseAdmin?.storage) throw new InventoryServiceError('El almacenamiento de archivos no está disponible.', 503);
    return supabaseAdmin.storage.from(BUCKET);
  }

  async function store({ companyId, uploadedById = null, buffer, fileName, mimeType, entityType, sourceEntityId = null, metadata = {} }) {
    const ext = String(fileName).split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const objectKey = `modules/${segment(MODULE_KEY)}/${segment(entityType)}/${segment(companyId)}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    const { error } = await storage().upload(objectKey, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new InventoryServiceError('No se pudo guardar el archivo.', 500);
    return prisma.fileAsset.create({
      data: {
        bucket: BUCKET,
        objectKey,
        originalName: fileName,
        mimeType,
        sizeBytes: buffer.length,
        visibility: 'PRIVATE',
        moduleKey: MODULE_KEY,
        entityType,
        entityId: companyId,
        accessScope: 'COMPANY',
        uploadedById,
        metadata: { ...metadata, companyId, sourceEntityId: sourceEntityId ? String(sourceEntityId) : null },
      },
    });
  }

  async function findAsset(companyId, fileId) {
    if (!fileId) return null;
    return prisma.fileAsset.findFirst({ where: { id: fileId, entityId: companyId, moduleKey: MODULE_KEY, enabled: true } });
  }

  async function read(asset) {
    const { data, error } = await storage().download(asset.objectKey);
    if (error || !data) throw new InventoryServiceError('No se pudo leer el archivo.', 500);
    return Buffer.from(await data.arrayBuffer());
  }

  async function signedUrl(asset, { download = true } = {}) {
    const { data, error } = await storage().createSignedUrl(asset.objectKey, SIGNED_URL_SECONDS, download ? { download: asset.originalName } : undefined);
    if (error || !data?.signedUrl) throw new InventoryServiceError('No se pudo generar el enlace de descarga.', 500);
    return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS };
  }

  return { store, findAsset, read, signedUrl };
}
