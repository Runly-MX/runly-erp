import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { createRunlyClient } from "../index.js";

function makeFetch() {
  return mock.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({ url }),
    text: async () => "",
    blob: async () => new Blob([url], { type: "application/pdf" }),
  }));
}

test("documents domain sends template, version, preview, and generation requests", async () => {
  const fetchMock = makeFetch();
  globalThis.fetch = fetchMock;
  const client = createRunlyClient({ baseUrl: "http://api" });
  const token = "tok";

  await client.documents.listTemplates(token, { sourceType: "growth.lead" });
  await client.documents.createTemplate({ key: "lead", name: "Lead" }, token);
  await client.documents.getTemplate("tpl/1", token);
  await client.documents.updateTemplate("tpl/1", { name: "Nuevo" }, token);
  await client.documents.setTemplateEnabled(
    "tpl/1",
    {
      enabled: false,
      updatedAt: "2026-06-14T12:00:00.000Z",
    },
    token,
  );
  await client.documents.listVersions("tpl/1", token);
  await client.documents.createVersion("tpl/1", { blocks: [] }, token);
  await client.documents.updateVersion(
    "tpl/1",
    "ver/1",
    { blocks: [] },
    token,
  );
  await client.documents.publishVersion(
    "tpl/1",
    "ver/1",
    { updatedAt: "2026-06-14T12:00:00.000Z" },
    token,
  );
  await client.documents.getProviderSchema("growth.lead", token);
  const preview = await client.documents.preview(
    "tpl/1",
    { sourceId: "source-1" },
    token,
  );
  await client.documents.generate(
    "tpl/1",
    { sourceId: "source-1" },
    token,
  );
  await client.documents.listGenerated(token, { sourceId: "source-1" });
  await client.documents.getGenerated("gen/1", token);
  await client.documents.getGeneratedDownload("gen/1", token);
  await client.documents.setGeneratedEnabled("gen/1", false, token);

  assert.ok(preview instanceof Blob);
  const calls = fetchMock.mock.calls.map((call) => call.arguments);
  assert.equal(
    calls[0][0],
    "http://api/documents/templates?sourceType=growth.lead",
  );
  assert.equal(calls[1][1].method, "POST");
  assert.equal(calls[2][0], "http://api/documents/templates/tpl%2F1");
  assert.equal(calls[3][1].method, "PATCH");
  assert.equal(
    calls[4][0],
    "http://api/documents/templates/tpl%2F1/enabled",
  );
  assert.deepEqual(JSON.parse(calls[4][1].body), {
    enabled: false,
    updatedAt: "2026-06-14T12:00:00.000Z",
  });
  assert.equal(
    calls[5][0],
    "http://api/documents/templates/tpl%2F1/versions",
  );
  assert.equal(calls[6][1].method, "POST");
  assert.equal(
    calls[7][0],
    "http://api/documents/templates/tpl%2F1/versions/ver%2F1",
  );
  assert.equal(calls[7][1].method, "PATCH");
  assert.equal(
    calls[8][0],
    "http://api/documents/templates/tpl%2F1/versions/ver%2F1/publish",
  );
  assert.equal(
    calls[9][0],
    "http://api/documents/providers/growth.lead/schema",
  );
  assert.equal(
    calls[10][0],
    "http://api/documents/templates/tpl%2F1/preview",
  );
  assert.equal(calls[10][1].method, "POST");
  assert.equal(
    calls[11][0],
    "http://api/documents/templates/tpl%2F1/generate",
  );
  assert.equal(
    calls[12][0],
    "http://api/documents/generated?sourceId=source-1",
  );
  assert.equal(calls[13][0], "http://api/documents/generated/gen%2F1");
  assert.equal(
    calls[14][0],
    "http://api/documents/generated/gen%2F1/download",
  );
  assert.equal(
    calls[15][0],
    "http://api/documents/generated/gen%2F1/enabled",
  );
  for (const [, options] of calls) {
    assert.equal(options.headers.Authorization, "Bearer tok");
  }

  fetchMock.mock.restore();
});

test("documents domain sends template engine requests", async () => {
  const fetchMock = makeFetch();
  globalThis.fetch = fetchMock;
  const client = createRunlyClient({ baseUrl: "http://api" });
  const token = "tok";
  const file = new Blob(["x"]);

  await client.documents.listKinds(token);
  await client.documents.listFileTemplates(token, { kind: "inventory.custody", scopeKey: "c/1" });
  await client.documents.uploadTemplate({ kind: "inventory.custody", file, publish: true, name: undefined }, token);
  await client.documents.createBlankTemplate({ kind: "k", format: "docx" }, token);
  await client.documents.suggestTemplate("tpl/1", "ver/1", token);
  await client.documents.replaceTemplateFile("tpl/1", "ver/1", file, token);
  await client.documents.saveTemplateMapping("tpl/1", "ver/1", { mapping: { a: "b" } }, token);
  await client.documents.publishFileTemplate("tpl/1", "ver/1", token);
  await client.documents.setTemplateDefault("tpl/1", token);
  await client.documents.getTemplateFile("tpl/1", token, { versionId: "ver/1" });
  await client.documents.deleteTemplate("tpl/1", token);
  await client.documents.generateDocument({ kind: "k", sourceId: "s" }, token);
  const preview = await client.documents.previewDocument({ kind: "k" }, token);

  assert.ok(preview instanceof Blob);
  const calls = fetchMock.mock.calls.map((call) => call.arguments);
  const base = "http://api/documents/templates/tpl%2F1";
  assert.deepEqual(
    calls.map((c) => [c[1]?.method ?? "GET", c[0]]),
    [
      ["GET", "http://api/documents/kinds"],
      ["GET", "http://api/documents/templates?kind=inventory.custody&scopeKey=c%2F1"],
      ["POST", "http://api/documents/templates/upload"],
      ["POST", "http://api/documents/templates/blank"],
      ["POST", `${base}/versions/ver%2F1/suggest`],
      ["PUT", `${base}/versions/ver%2F1/file`],
      ["PATCH", `${base}/versions/ver%2F1/mapping`],
      ["POST", `${base}/versions/ver%2F1/publish`],
      ["PATCH", `${base}/default`],
      ["GET", `${base}/file?versionId=ver%2F1`],
      ["DELETE", base],
      ["POST", "http://api/documents/generate"],
      ["POST", "http://api/documents/preview"],
    ],
  );
  const form = calls[2][1].body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("kind"), "inventory.custody");
  assert.equal(form.get("publish"), "true");
  assert.equal(form.has("name"), false);
  assert.deepEqual(JSON.parse(calls[6][1].body), { mapping: { a: "b" } });
});
