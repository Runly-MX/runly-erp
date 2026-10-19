import assert from "node:assert/strict";
import test from "node:test";
import { createImageEdit } from "../files/image-edit.js";
import { OfficeError } from "../office/errors.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const FILE_ID = "22222222-2222-4222-8222-222222222222";

function setup({ liveRevision = 1, authError = null, invLinks = [] } = {}) {
  const calls = { uploaded: [], removed: [], versions: [], updates: [], creates: [], links: [], audits: [], authModes: [] };
  const fileRow = (revision) => ({
    id: FILE_ID,
    bucket: "runly-files",
    objectKey: "old/key.jpg",
    originalName: "foto.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 10,
    checksum: "abc",
    contentRevision: revision,
    moduleKey: "runly.inventory",
    entityType: "InvItem",
    entityId: COMPANY,
    metadata: null,
    visibility: "PRIVATE",
    accessScope: "COMPANY",
    folderId: null,
    invItemFiles: invLinks,
  });
  let authorizations = 0;
  const access = {
    authorize: async (args) => {
      calls.authModes.push(args.imageEdit === true && args.mode === "edit");
      if (authError) throw authError;
      const revision = authorizations++ === 0 ? 1 : liveRevision;
      return { file: fileRow(revision), profile: { id: "p1" }, companyId: COMPANY };
    },
  };
  const prisma = {
    fileAsset: {
      update: async ({ data }) => (calls.updates.push(data), { id: FILE_ID, originalName: data.originalName, mimeType: data.mimeType, sizeBytes: data.sizeBytes, contentRevision: 2 }),
      create: async ({ data }) => (calls.creates.push(data), { id: "copy-1", originalName: data.originalName, mimeType: data.mimeType, sizeBytes: data.sizeBytes }),
    },
    fileAssetVersion: { create: async ({ data }) => calls.versions.push(data) },
    invItemFile: { create: async ({ data }) => calls.links.push(data) },
    auditLog: { create: async ({ data }) => calls.audits.push(data.action) },
    $queryRaw: async () => [],
    $transaction: async (fn) => fn(prisma),
  };
  const supabaseAdmin = {
    storage: {
      from: () => ({
        upload: async (key) => (calls.uploaded.push(key), { error: null }),
        remove: async (keys) => (calls.removed.push(...keys), { error: null }),
      }),
    },
  };
  const svc = createImageEdit({ prisma, supabaseAdmin, access });
  const file = (type = "image/png", size = 4) => ({ type, size, arrayBuffer: async () => new ArrayBuffer(size) });
  return { svc, calls, file };
}

test("replace keeps the previous object as a version and moves the pointer", async () => {
  const { svc, calls, file } = setup();
  const updated = await svc.replace({ authUserId: "u", fileId: FILE_ID, file: file("image/png") });
  assert.match(calls.uploaded[0], new RegExp(`^images/${COMPANY}/${FILE_ID}/[0-9a-f]+\\.png$`));
  assert.equal(calls.versions[0].objectKey, "old/key.jpg");
  assert.equal(calls.updates[0].originalName, "foto.png");
  assert.equal(updated.contentRevision, 2);
  assert.deepEqual(calls.audits, ["files.image.replaced"]);
  assert.ok(calls.authModes.every(Boolean), "authorizes in edit + image mode");
});

test("replace rejects a stale revision and removes the uploaded candidate", async () => {
  const { svc, calls, file } = setup({ liveRevision: 5 });
  await assert.rejects(svc.replace({ authUserId: "u", fileId: FILE_ID, file: file() }), (e) => e.status === 409);
  assert.equal(calls.removed.length, 1);
  assert.equal(calls.versions.length, 0);
});

test("copy clones the row beside the original and re-links inventory items", async () => {
  const { svc, calls, file } = setup({ invLinks: [{ itemId: "item-1", label: "frente", sortOrder: 2 }] });
  const created = await svc.copy({ authUserId: "u", fileId: FILE_ID, file: file("image/webp") });
  assert.equal(created.id, "copy-1");
  assert.equal(calls.creates[0].originalName, "foto-editada.webp");
  assert.equal(calls.creates[0].entityType, "InvItem");
  assert.equal(calls.creates[0].uploadedById, "p1");
  assert.deepEqual(calls.links, [{ itemId: "item-1", fileAssetId: "copy-1", label: "frente", sortOrder: 3, isCover: false }]);
  assert.deepEqual(calls.audits, ["files.image.copied"]);
});

test("access errors keep their status and scope errors get a plain message", async () => {
  const denied = setup({ authError: new OfficeError("No tienes permiso.", 403, "forbidden") });
  await assert.rejects(denied.svc.replace({ authUserId: "u", fileId: FILE_ID, file: denied.file() }), (e) => e.status === 403 && e.message === "No tienes permiso.");
  const scope = setup({ authError: new OfficeError("Este origen aún no admite edición Office.", 403, "unsupported_scope") });
  await assert.rejects(scope.svc.copy({ authUserId: "u", fileId: FILE_ID, file: scope.file() }), (e) => /no se puede editar/.test(e.message));
  assert.equal(scope.calls.uploaded.length, 0);
});

test("non-image uploads are rejected before any access check or upload", async () => {
  const { svc, calls, file } = setup();
  await assert.rejects(svc.replace({ authUserId: "u", fileId: FILE_ID, file: file("application/pdf") }), (e) => e.status === 400);
  assert.equal(calls.authModes.length, 0);
  assert.equal(calls.uploaded.length, 0);
});
