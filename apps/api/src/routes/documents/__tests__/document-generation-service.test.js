import assert from "node:assert/strict";
import { test } from "node:test";

import { createDocumentGenerationService } from "../document-generation-service.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const ID = "55555555-5555-7555-8555-555555555555";

function harness(row) {
  const prisma = {
    generatedDocument: {
      count: async () => (row ? 1 : 0),
      findMany: async () => (row ? [row] : []),
      findFirst: async () => row,
    },
  };
  const supabaseAdmin = { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/f" }, error: null }) }) } };
  return createDocumentGenerationService({ prisma, supabaseAdmin });
}

test("lists generated documents with pagination defaults", async () => {
  const service = harness({ id: ID, companyId: COMPANY, enabled: true, status: "ready" });
  const result = await service.listGenerated({ companyId: COMPANY });
  assert.equal(result.total, 1);
  assert.equal(result.page, 1);
});

test("download needs a ready file and answers a signed url", async () => {
  const ready = harness({ id: ID, enabled: true, status: "ready", fileAsset: { bucket: "b", objectKey: "k" } });
  assert.equal((await ready.getGeneratedDownload({ companyId: COMPANY, id: ID })).url, "https://example.test/f");
  const missing = harness({ id: ID, enabled: true, status: "pending", fileAsset: null });
  await assert.rejects(missing.getGeneratedDownload({ companyId: COMPANY, id: ID }), (err) => err.status === 409);
  await assert.rejects(harness(null).getGenerated({ companyId: COMPANY, id: ID }), (err) => err.status === 404);
});
