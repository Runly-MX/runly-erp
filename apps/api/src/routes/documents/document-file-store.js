// Server-side file storage for the documents engine: template files and
// generated documents. Same layout as files-service uploads (private
// `runly-files` bucket, FileAsset.entityId = companyId, owning record id in
// metadata.sourceEntityId), usable without a user session.
import crypto from "node:crypto";

import { DocumentTemplateServiceError } from "./document-template-service.js";

const BUCKET = "runly-files";
const MODULE_KEY = "runly.documents";
const SIGNED_URL_SECONDS = 3600;
const LEGACY_TEMPLATE_ENTITIES = ["InvDocumentTemplate", "LmsCertificateTemplate"];

const segment = (value) =>
  String(value).toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";

export function createDocumentFileStore({ prisma, supabaseAdmin }) {
  function storage() {
    if (!supabaseAdmin?.storage) {
      throw new DocumentTemplateServiceError("El almacenamiento de archivos no está disponible.", 503, "storage_unavailable");
    }
    return supabaseAdmin.storage.from(BUCKET);
  }

  async function store({ companyId, uploadedById = null, buffer, fileName, mimeType, entityType, sourceEntityId = null, metadata = {} }) {
    const ext = String(fileName).split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const objectKey = `modules/${segment(MODULE_KEY)}/${segment(entityType)}/${segment(companyId)}/${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
    const { error } = await storage().upload(objectKey, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new DocumentTemplateServiceError("No se pudo guardar el archivo.", 500, "storage_upload_failed");
    return prisma.fileAsset.create({
      data: {
        bucket: BUCKET,
        objectKey,
        originalName: fileName,
        mimeType,
        sizeBytes: buffer.length,
        checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
        visibility: "PRIVATE",
        moduleKey: MODULE_KEY,
        entityType,
        entityId: companyId,
        accessScope: "COMPANY",
        uploadedById,
        metadata: { ...metadata, companyId, sourceEntityId: sourceEntityId ? String(sourceEntityId) : null },
      },
    });
  }

  async function findAsset(companyId, fileId) {
    if (!fileId) return null;
    // Template files uploaded before a module adopted the hub keep their owner module
    // (e.g. runly.inventory / InvDocumentTemplate); they are the same company-scoped files.
    return prisma.fileAsset.findFirst({
      where: {
        id: fileId, entityId: companyId, enabled: true,
        OR: [{ moduleKey: MODULE_KEY }, { entityType: { in: LEGACY_TEMPLATE_ENTITIES } }],
      },
    });
  }

  async function read(asset) {
    const { data, error } = await storage().download(asset.objectKey);
    if (error || !data) throw new DocumentTemplateServiceError("No se pudo leer el archivo.", 500, "storage_read_failed");
    return Buffer.from(await data.arrayBuffer());
  }

  async function signedUrl(asset, { download = true } = {}) {
    const { data, error } = await storage().createSignedUrl(asset.objectKey, SIGNED_URL_SECONDS, download ? { download: asset.originalName } : undefined);
    if (error || !data?.signedUrl) throw new DocumentTemplateServiceError("No se pudo generar el enlace de descarga.", 500, "storage_url_failed");
    return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS };
  }

  return { store, findAsset, read, signedUrl };
}
