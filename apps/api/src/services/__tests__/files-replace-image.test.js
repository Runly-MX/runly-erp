import assert from "node:assert/strict";
import test from "node:test";
import { createFilesWorkspace } from "../files/workspace.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const FILE_ID = "22222222-2222-4222-8222-222222222222";

function setup({ liveRevision = 1, mimeType = "image/jpeg" } = {}) {
  const calls = { uploaded: [], removed: [], versions: [], updates: [], audits: [] };
  const row = (revision) => ({
    id: FILE_ID,
    entityId: COMPANY,
    entityType: "AtlasFile",
    moduleKey: "runly.files",
    bucket: "runly-files",
    visibility: "PRIVATE",
    objectKey: "old/key.jpg",
    originalName: "foto.jpg",
    mimeType,
    sizeBytes: 10,
    checksum: "abc",
    contentRevision: revision,
    uploadedById: "p1",
    invItemFiles: [],
    calendarFiles: [],
    hrProfileEmployees: [],
    generatedDocuments: [],
  });
  let reads = 0;
  const prisma = {
    fileAsset: {
      findFirst: async () => row(reads++ === 0 ? 1 : liveRevision),
      update: async ({ data }) => {
        calls.updates.push(data);
        return { id: FILE_ID, originalName: data.originalName, mimeType: data.mimeType, sizeBytes: data.sizeBytes, contentRevision: 2 };
      },
    },
    fileAssetVersion: { create: async ({ data }) => calls.versions.push(data) },
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
  const filesService = {
    getUserCompanyContext: async () => ({ admin: true, permissions: new Set(), companyId: COMPANY, profileId: "p1" }),
  };
  const w = createFilesWorkspace({ prisma, supabaseAdmin, filesService });
  const file = (type = "image/png", size = 4) => ({ type, size, arrayBuffer: async () => new ArrayBuffer(size) });
  return { w, calls, file };
}

test("replaceImage keeps the previous object as a version and moves the pointer", async () => {
  const { w, calls, file } = setup();
  const updated = await w.replaceImage({ authUserId: "u", activeContext: null, fileId: FILE_ID, file: file("image/png") });
  assert.equal(calls.uploaded.length, 1);
  assert.match(calls.uploaded[0], new RegExp(`^images/${COMPANY}/${FILE_ID}/[0-9a-f]+\\.png$`));
  assert.equal(calls.versions[0].objectKey, "old/key.jpg");
  assert.equal(calls.versions[0].revision, 1);
  assert.equal(calls.updates[0].originalName, "foto.png");
  assert.equal(updated.contentRevision, 2);
  assert.deepEqual(calls.audits, ["files.image.replaced"]);
});

test("replaceImage rejects a stale revision and cleans up the uploaded candidate", async () => {
  const { w, calls, file } = setup({ liveRevision: 5 });
  await assert.rejects(w.replaceImage({ authUserId: "u", activeContext: null, fileId: FILE_ID, file: file() }), (e) => e.status === 409);
  assert.equal(calls.removed.length, 1);
  assert.equal(calls.versions.length, 0);
});

test("replaceImage rejects non-image uploads and non-image targets", async () => {
  const bad = setup();
  await assert.rejects(bad.w.replaceImage({ authUserId: "u", activeContext: null, fileId: FILE_ID, file: bad.file("application/pdf") }), (e) => e.status === 400);
  const doc = setup({ mimeType: "application/pdf" });
  await assert.rejects(doc.w.replaceImage({ authUserId: "u", activeContext: null, fileId: FILE_ID, file: doc.file() }), (e) => e.status === 415);
  assert.equal(doc.calls.uploaded.length, 0);
});
