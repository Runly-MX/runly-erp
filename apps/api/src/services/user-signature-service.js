// Saved handwritten signature of a user, reusable across modules (custody
// records first). Spec: docs/superpowers/specs/2026-10-13-inventory-custody-design.md §9.6
//
// The PNG is a private FileAsset owned by the user (entityType
// `UserSignature`, entityId = the user's profile; files/visibility.js rule
// `owner`): only its uploader reads it, and it never shows in company file
// listings (those filter entityId = companyId). Modules that apply it copy the bytes into their own
// file, so replacing or deleting the saved signature never breaks a record.
import crypto from 'node:crypto';
import { SignaturePngError, decodePngSignature } from '../lib/signature-png.js';

const BUCKET = 'runly-files';
const MODULE_KEY = 'runly.identity';
const ENTITY_TYPE = 'UserSignature';
const SIGNED_URL_SECONDS = 3600;

export class UserSignatureError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserSignatureError';
    this.status = status;
  }
}

export function decodeUserSignaturePng(input) {
  try {
    return decodePngSignature(input);
  } catch (err) {
    if (err instanceof SignaturePngError) throw new UserSignatureError(err.message, 400);
    throw err;
  }
}

export function createUserSignatureService({ prisma, supabaseAdmin }) {
  function storage() {
    if (!supabaseAdmin?.storage) throw new UserSignatureError('El almacenamiento de archivos no está disponible.', 503);
    return supabaseAdmin.storage.from(BUCKET);
  }

  const findRow = (profileId) => prisma.userSignature.findUnique({ where: { userProfileId: profileId } });
  const findAsset = (fileAssetId) => prisma.fileAsset.findFirst({
    where: { id: fileAssetId, moduleKey: MODULE_KEY, entityType: ENTITY_TYPE, enabled: true },
  });
  const retireAsset = (fileAssetId) => prisma.fileAsset.update({ where: { id: fileAssetId }, data: { enabled: false } }).catch(() => null);

  async function serialize(row) {
    if (!row) return { signature: null };
    const asset = await findAsset(row.fileAssetId);
    let url = null;
    if (asset) {
      const { data } = await storage().createSignedUrl(asset.objectKey, SIGNED_URL_SECONDS).catch(() => ({ data: null }));
      url = data?.signedUrl ?? null;
    }
    return { signature: { url, allowDelegation: row.allowDelegation, updatedAt: row.updatedAt } };
  }

  async function get(profileId) {
    return serialize(await findRow(profileId));
  }

  // PUT: replaces the saved signature. allowDelegation keeps its current
  // value when omitted (false for a first signature).
  async function put(profileId, { pngBase64, allowDelegation } = {}) {
    const buffer = decodeUserSignaturePng(pngBase64);
    const objectKey = `modules/runly-identity/usersignature/${profileId}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.png`;
    const { error } = await storage().upload(objectKey, buffer, { contentType: 'image/png', upsert: false });
    if (error) throw new UserSignatureError('No se pudo guardar la firma.', 500);
    const asset = await prisma.fileAsset.create({
      data: {
        bucket: BUCKET, objectKey, originalName: 'firma.png', mimeType: 'image/png', sizeBytes: buffer.length,
        visibility: 'PRIVATE', moduleKey: MODULE_KEY, entityType: ENTITY_TYPE,
        entityId: profileId, uploadedById: profileId, metadata: { sourceEntityId: profileId },
      },
    });
    const previous = await findRow(profileId);
    const delegation = typeof allowDelegation === 'boolean' ? { allowDelegation } : {};
    const row = await prisma.userSignature.upsert({
      where: { userProfileId: profileId },
      create: { userProfileId: profileId, fileAssetId: asset.id, ...delegation },
      update: { fileAssetId: asset.id, ...delegation },
    });
    if (previous && previous.fileAssetId !== asset.id) await retireAsset(previous.fileAssetId);
    return serialize(row);
  }

  async function patch(profileId, { allowDelegation } = {}) {
    if (typeof allowDelegation !== 'boolean') throw new UserSignatureError('Indica si permites usar tu firma (allowDelegation).', 400);
    if (!(await findRow(profileId))) throw new UserSignatureError('No tienes una firma guardada.', 404);
    return serialize(await prisma.userSignature.update({ where: { userProfileId: profileId }, data: { allowDelegation } }));
  }

  async function remove(profileId) {
    const row = await findRow(profileId);
    if (!row) return { ok: true };
    await prisma.userSignature.delete({ where: { userProfileId: profileId } });
    await retireAsset(row.fileAssetId);
    return { ok: true };
  }

  // For modules applying the signature: { buffer, allowDelegation } or null.
  async function readSaved(profileId) {
    const row = await findRow(profileId);
    if (!row) return null;
    const asset = await findAsset(row.fileAssetId);
    if (!asset) return null;
    const { data, error } = await storage().download(asset.objectKey);
    if (error || !data) throw new UserSignatureError('No se pudo leer la firma guardada.', 500);
    return { buffer: Buffer.from(await data.arrayBuffer()), allowDelegation: row.allowDelegation };
  }

  return { get, put, patch, remove, readSaved };
}
