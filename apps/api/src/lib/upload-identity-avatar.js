// apps/api/src/lib/upload-identity-avatar.js
//
// Shared by the self-service profile avatar upload (PUT /profile/me/avatar,
// still inline in index.js) and the admin-triggered user avatar upload
// (identity-routes.js). Extracted from index.js on 2026-09-25 so
// identity-routes.js doesn't need to import from index.js.

const avatarKeyPrefix = (profileId) => `modules/atlas-identity/userprofile/${profileId}/`;

// Removes every earlier avatar of this profile (the one being replaced plus any
// orphan left by uploads made before replacements were purged): storage object
// first, then its FileAsset row. Best effort — a failed purge must never fail
// the upload that already succeeded; leftovers are retried on the next upload.
async function purgeReplacedAvatars({ profileId, keepAssetId, prisma, supabaseAdmin, bucket }) {
  try {
    const stale = await prisma.fileAsset.findMany({
      where: {
        moduleKey: "runly.identity",
        entityType: "UserProfile",
        entityId: profileId,
        objectKey: { startsWith: avatarKeyPrefix(profileId) },
        id: { not: keepAssetId },
      },
      select: { id: true, bucket: true, objectKey: true },
    });
    if (stale.length === 0) return;
    const keys = stale.filter((a) => a.bucket === bucket).map((a) => a.objectKey);
    if (keys.length > 0) {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(keys);
      if (error) return;
    }
    await prisma.fileAsset.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
  } catch {
    // Intentionally silent: no object keys or URLs in logs.
  }
}

export async function uploadIdentityAvatar({ profileId, file, prisma, supabaseAdmin, bucket }) {
  const ext = file.name.split(".").pop() || "png";
  const objectKey = `${avatarKeyPrefix(profileId)}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(objectKey, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) {
    throw new Error("UPLOAD_FAILED");
  }

  const asset = await prisma.fileAsset.create({
    data: {
      bucket,
      objectKey,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      moduleKey: "runly.identity",
      entityType: "UserProfile",
      entityId: profileId,
    },
  });

  await prisma.userProfile.update({
    where: { id: profileId },
    data: { avatarFileId: asset.id },
  });

  await purgeReplacedAvatars({ profileId, keepAssetId: asset.id, prisma, supabaseAdmin, bucket });

  return asset;
}
