import assert from "node:assert/strict";
import test from "node:test";
import { uploadIdentityAvatar } from "../upload-identity-avatar.js";

function setup({ removeError = null } = {}) {
  const calls = { removed: [], deleted: [], where: null, profileUpdate: null };
  const prisma = {
    fileAsset: {
      create: async ({ data }) => ({ id: "new-asset", ...data }),
      findMany: async ({ where }) => {
        calls.where = where;
        return [
          { id: "old-1", bucket: "b", objectKey: "modules/atlas-identity/userprofile/p1/old-1.png" },
          { id: "old-2", bucket: "b", objectKey: "modules/atlas-identity/userprofile/p1/old-2.jpg" },
        ];
      },
      deleteMany: async ({ where }) => calls.deleted.push(...where.id.in),
    },
    userProfile: { update: async ({ data }) => (calls.profileUpdate = data) },
  };
  const supabaseAdmin = {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async (keys) => {
          calls.removed.push(...keys);
          return { error: removeError };
        },
      }),
    },
  };
  const file = { name: "me.png", type: "image/png", size: 3, arrayBuffer: async () => new ArrayBuffer(3) };
  return { calls, args: { profileId: "p1", file, prisma, supabaseAdmin, bucket: "b" } };
}

test("uploading an avatar purges the previous avatars from storage and file_asset", async () => {
  const { calls, args } = setup();
  const asset = await uploadIdentityAvatar(args);
  assert.equal(asset.id, "new-asset");
  assert.equal(calls.profileUpdate.avatarFileId, "new-asset");
  assert.deepEqual(calls.where.id, { not: "new-asset" });
  assert.equal(calls.where.objectKey.startsWith, "modules/atlas-identity/userprofile/p1/");
  assert.equal(calls.removed.length, 2);
  assert.deepEqual(calls.deleted, ["old-1", "old-2"]);
});

test("a failed storage purge keeps the rows (retried next upload) and does not fail the upload", async () => {
  const { calls, args } = setup({ removeError: { message: "boom" } });
  const asset = await uploadIdentityAvatar(args);
  assert.equal(asset.id, "new-asset");
  assert.deepEqual(calls.deleted, []);
});
