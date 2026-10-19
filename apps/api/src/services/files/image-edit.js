import { createHash, randomBytes } from "node:crypto";
import { createOfficeAccess } from "../office/access.js";
import { OfficeError } from "../office/errors.js";
import { FileAccessError } from "./access.js";

const IMAGE_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Server side of the image editor ("Reemplazar original" / "Guardar copia") for
// any FileAsset image. Authorization is delegated to the Office access rules in
// image mode, so each owning module (inventory, HR, contacts, tasks, files...)
// keeps deciding who may edit its files.
export function createImageEdit({ prisma, supabaseAdmin, access = createOfficeAccess({ prisma }) }) {
  async function authorize(authUserId, fileId, db = prisma) {
    try {
      return await access.authorize({ authUserId, fileId, mode: "edit", imageEdit: true }, db);
    } catch (error) {
      if (!(error instanceof OfficeError)) throw error;
      const message =
        error.code === "unsupported_scope" ? "Esta imagen no se puede editar desde aquí." : error.message;
      throw new FileAccessError(message, error.status);
    }
  }

  function readUpload(file) {
    const ext = IMAGE_EXTENSIONS[file?.type];
    if (!ext) throw new FileAccessError("Solo se permiten imágenes JPG, PNG o WebP.", 400);
    if (!file.size || file.size > MAX_IMAGE_BYTES) throw new FileAccessError("La imagen no puede superar 10 MB.", 413);
    return ext;
  }

  async function uploadCandidate({ bucket, companyId, fileId, file, ext }) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const objectKey = `images/${companyId}/${fileId}/${randomBytes(24).toString("hex")}.${ext}`;
    const { error } = await supabaseAdmin.storage.from(bucket).upload(objectKey, bytes, { contentType: file.type, upsert: false });
    if (error) throw new FileAccessError("No se pudo guardar en almacenamiento.", 503);
    return { bytes, objectKey, checksum: createHash("sha256").update(bytes).digest("hex") };
  }

  // A definite rejection cannot have committed the candidate; an ambiguous
  // error might have, so only clean up after our own FileAccessError.
  async function cleanupOnRejection(err, bucket, objectKey) {
    if (err instanceof FileAccessError) await supabaseAdmin.storage.from(bucket).remove([objectKey]).catch(() => {});
  }

  const audit = (db, profileId, fileId, action, metadata) =>
    db.auditLog.create({
      data: { actorId: profileId, moduleKey: "runly.files", entityType: "FileAsset", entityId: fileId, action, metadata },
    });

  const renamed = (name, ext, suffix = "") => `${String(name).replace(/\.[^./\\]+$/, "")}${suffix}.${ext}`;

  // Moves the live pointer to the edited image; the previous content stays
  // reachable as a FileAssetVersion.
  async function replace({ authUserId, fileId, file }) {
    const ext = readUpload(file);
    const context = await authorize(authUserId, fileId);
    const current = context.file;
    const candidate = await uploadCandidate({ bucket: current.bucket, companyId: context.companyId, fileId, file, ext });
    try {
      return await prisma.$transaction(async (db) => {
        await db.$queryRaw`SELECT id FROM file_asset WHERE id = ${fileId}::uuid FOR UPDATE`;
        const live = (await authorize(authUserId, fileId, db)).file;
        if (live.contentRevision !== current.contentRevision)
          throw new FileAccessError("La imagen cambió mientras la editabas. Ábrela de nuevo.", 409);
        await db.fileAssetVersion.create({
          data: {
            fileId,
            revision: live.contentRevision,
            bucket: live.bucket,
            objectKey: live.objectKey,
            originalName: live.originalName,
            mimeType: live.mimeType,
            sizeBytes: live.sizeBytes,
            checksum: live.checksum,
          },
        });
        const updated = await db.fileAsset.update({
          where: { id: fileId },
          data: {
            objectKey: candidate.objectKey,
            checksum: candidate.checksum,
            sizeBytes: candidate.bytes.length,
            mimeType: file.type,
            originalName: renamed(live.originalName, ext),
            contentRevision: { increment: 1 },
          },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, contentRevision: true },
        });
        await audit(db, context.profile.id, fileId, "files.image.replaced", { revision: updated.contentRevision, sizeBytes: candidate.bytes.length });
        return updated;
      });
    } catch (err) {
      await cleanupOnRejection(err, current.bucket, candidate.objectKey);
      throw err;
    }
  }

  // Creates a new file next to the original: same owner entity, folder, scope
  // and (for inventory) the same item. Other relation kinds are not copied.
  async function copy({ authUserId, fileId, file }) {
    const ext = readUpload(file);
    const context = await authorize(authUserId, fileId);
    const source = context.file;
    const candidate = await uploadCandidate({ bucket: source.bucket, companyId: context.companyId, fileId, file, ext });
    try {
      return await prisma.$transaction(async (db) => {
        const created = await db.fileAsset.create({
          data: {
            bucket: source.bucket,
            objectKey: candidate.objectKey,
            originalName: renamed(source.originalName, ext, "-editada"),
            mimeType: file.type,
            sizeBytes: candidate.bytes.length,
            checksum: candidate.checksum,
            moduleKey: source.moduleKey,
            entityType: source.entityType,
            entityId: source.entityId,
            uploadedById: context.profile.id,
            metadata: source.metadata ?? undefined,
            visibility: source.visibility,
            accessScope: source.accessScope,
            folderId: source.folderId,
          },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
        });
        for (const link of source.invItemFiles ?? []) {
          await db.invItemFile.create({
            data: { itemId: link.itemId, fileAssetId: created.id, label: link.label, sortOrder: link.sortOrder + 1, isCover: false },
          });
        }
        await audit(db, context.profile.id, created.id, "files.image.copied", { sourceFileId: fileId });
        return created;
      });
    } catch (err) {
      await cleanupOnRejection(err, source.bucket, candidate.objectKey);
      throw err;
    }
  }

  return { replace, copy };
}
