import assert from "node:assert/strict";
import { test } from "node:test";

import { Hono } from "hono";
import PizZip from "pizzip";

import { buildMinimalDocx, paragraph } from "../../../services/document-templates/minimal-docx.js";
import { createDocumentEngine } from "../document-engine.js";
import { createDocumentEngineRoutes } from "../document-engine-routes.js";
import { createDocumentFileTemplateService } from "../document-file-template-service.js";
import { createKindRegistry } from "../kinds/kind-registry.js";
import { createFakeFiles, createFakePrisma } from "./fake-documents-db.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const SOURCE = "22222222-2222-7222-8222-222222222222";

function setup() {
  const prisma = createFakePrisma();
  const files = createFakeFiles(prisma);
  const kinds = createKindRegistry();
  kinds.register({
    key: "test.record",
    label: "Registro",
    permissionKey: "test.records.read",
    managePermissionKey: "test.records.manage",
    schema: [{ tag: "name", label: "Nombre", type: "text" }],
    load: async () => ({ name: "Ana" }),
  });
  kinds.register({ key: "other.record", permissionKey: "other.read", schema: [], load: async () => ({}) });
  const hub = {
    kinds,
    files,
    fileTemplates: createDocumentFileTemplateService({ prisma, files, kinds }),
    engine: createDocumentEngine({ prisma, files, kinds }),
  };
  // Test guard: permissions come from the x-permissions header.
  const guard = async (c, next) => {
    const permissions = new Set((c.req.header("x-permissions") ?? "").split(",").filter(Boolean));
    c.set("companyId", COMPANY);
    c.set("userContext", { profile: { id: c.req.header("x-user") ?? "44444444-4444-7444-8444-444444444444" }, permissionSet: permissions, isAdmin: false });
    await next();
  };
  const app = new Hono();
  app.route("", createDocumentEngineRoutes({ hub, guard }));
  return { app, prisma, files };
}

const as = (permissions, extra = {}) => ({ "x-permissions": permissions, ...extra });

function uploadBody(kind = "test.record", extra = {}) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("publish", "true");
  form.set("visibility", "company");
  form.set("file", new File([buildMinimalDocx(paragraph("Hola {{name}}"))], "plantilla.docx"));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

test("kinds are listed by permission; the kind manage permission opens template management", async () => {
  const { app } = setup();
  const some = await (await app.request("/documents/kinds", { headers: as("test.records.manage") })).json();
  assert.deepEqual(some.items.map((k) => k.key), ["test.record"]);
  const all = await (await app.request("/documents/kinds", { headers: as("documents.templates.read") })).json();
  assert.equal(all.items.length, 2);

  const denied = await app.request("/documents/templates/upload", { method: "POST", headers: as("test.records.read"), body: uploadBody() });
  assert.equal(denied.status, 403);
  const wrongKind = await app.request("/documents/templates/upload", { method: "POST", headers: as("test.records.manage"), body: uploadBody("other.record") });
  assert.equal(wrongKind.status, 403);
  const ok = await app.request("/documents/templates/upload", { method: "POST", headers: as("test.records.manage"), body: uploadBody() });
  assert.equal(ok.status, 201);
});

test("lists by kind, sets default, maps, soft-deletes and lists every template without a kind", async () => {
  const { app } = setup();
  const headers = as("documents.templates.read,documents.templates.create,documents.templates.update,documents.templates.publish,documents.templates.delete");
  const created = await (await app.request("/documents/templates/upload", { method: "POST", headers, body: uploadBody() })).json();
  const id = created.template.id;
  const versionId = created.template.version.id;

  const listed = await (await app.request("/documents/templates?kind=test.record", { headers })).json();
  assert.deepEqual(listed.items.map((t) => t.id), [id]);
  assert.deepEqual((await (await app.request("/documents/templates", { headers })).json()).items.map((t) => t.id), [id]);

  const second = await (await app.request("/documents/templates/blank", {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ kind: "test.record", format: "xlsx", publish: true, visibility: "company" }),
  })).json();
  const makeDefault = await app.request(`/documents/templates/${second.template.id}/default`, { method: "PATCH", headers });
  assert.equal((await makeDefault.json()).isDefault, true);

  const mapped = await app.request(`/documents/templates/${id}/versions/${versionId}/mapping`, {
    method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ mapping: { name: "x" } }),
  });
  assert.equal(mapped.status, 409); // published versions are frozen

  const publishAgain = await app.request(`/documents/templates/${id}/versions/${versionId}/publish`, { method: "POST", headers });
  assert.equal(publishAgain.status, 409); // already published

  assert.equal((await app.request(`/documents/templates/${id}`, { method: "DELETE", headers })).status, 200);
  const after = await (await app.request("/documents/templates?kind=test.record", { headers })).json();
  assert.equal(after.items.length, 1);
  assert.equal((await app.request("/documents/templates/nope", { method: "DELETE", headers })).status, 404);
});

test("generate stores the document and returns a link; preview returns the file; the kind permission is enforced", async () => {
  const { app, files } = setup();
  const manage = as("test.records.manage");
  await app.request("/documents/templates/upload", { method: "POST", headers: manage, body: uploadBody() });
  const json = { "content-type": "application/json" };

  const forbidden = await app.request("/documents/generate", { method: "POST", headers: { ...as("documents.templates.read"), ...json }, body: JSON.stringify({ kind: "test.record", sourceId: SOURCE }) });
  assert.equal(forbidden.status, 403);

  const res = await app.request("/documents/generate", { method: "POST", headers: { ...as("test.records.read"), ...json }, body: JSON.stringify({ kind: "test.record", sourceId: SOURCE }) });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.format, "docx");
  assert.match(body.url, /^https:\/\/files\.example\//);
  assert.match(new PizZip(files.blobs.get(body.fileAssetId)).file("word/document.xml").asText(), /Hola Ana/);

  const preview = await app.request("/documents/preview", { method: "POST", headers: { ...as("test.records.read"), ...json }, body: JSON.stringify({ kind: "test.record" }) });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("content-type"), /wordprocessingml/);
  assert.match(new PizZip(Buffer.from(await preview.arrayBuffer())).file("word/document.xml").asText(), /Nombre de ejemplo/);
});

test("personal templates are only visible to their owner; the owner shares them and only company ones can be default", async () => {
  const { app } = setup();
  const ana = as("test.records.manage,test.records.read", { "x-user": "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa" });
  const beto = as("test.records.manage,test.records.read", { "x-user": "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb" });
  const mine = await (await app.request("/documents/templates/upload", { method: "POST", headers: ana, body: uploadBody("test.record", { visibility: "personal" }) })).json();
  const id = mine.template.id;
  assert.equal(mine.template.visibility, "personal");
  assert.equal(mine.template.isDefault, false); // published but personal: never the default
  assert.equal(mine.template.isOwner, true);

  assert.equal((await (await app.request("/documents/templates?kind=test.record", { headers: ana })).json()).items.length, 1);
  assert.equal((await (await app.request("/documents/templates?kind=test.record", { headers: beto })).json()).items.length, 0);
  assert.equal((await app.request(`/documents/templates/${id}/file`, { headers: beto })).status, 404);
  assert.equal((await app.request(`/documents/templates/${id}/default`, { method: "PATCH", headers: ana })).status, 409);

  const json = { "content-type": "application/json" };
  const generate = (headers, body) => app.request("/documents/generate", { method: "POST", headers: { ...headers, ...json }, body: JSON.stringify(body) });
  assert.equal((await generate(beto, { kind: "test.record", templateId: id, sourceId: SOURCE })).status, 404);
  assert.equal((await generate(beto, { kind: "test.record", sourceId: SOURCE })).status, 404); // no default for Beto
  assert.equal((await generate(ana, { kind: "test.record", templateId: id, sourceId: SOURCE })).status, 201);

  const shared = await app.request(`/documents/templates/${id}/visibility`, { method: "PATCH", headers: { ...ana, ...json }, body: JSON.stringify({ visibility: "company" }) });
  assert.equal((await shared.json()).visibility, "company");
  assert.equal((await (await app.request("/documents/templates?kind=test.record", { headers: beto })).json()).items.length, 1);
  assert.equal((await app.request(`/documents/templates/${id}/default`, { method: "PATCH", headers: ana })).status, 200);
  assert.equal((await generate(beto, { kind: "test.record", sourceId: SOURCE })).status, 201); // company default
  // A non-owner without manage permission cannot change it.
  const reader = as("test.records.read", { "x-user": "cccccccc-cccc-7ccc-8ccc-cccccccccccc" });
  assert.equal((await app.request(`/documents/templates/${id}/visibility`, { method: "PATCH", headers: { ...reader, ...json }, body: JSON.stringify({ visibility: "personal" }) })).status, 403);
  // Back to personal drops the default.
  const back = await (await app.request(`/documents/templates/${id}/visibility`, { method: "PATCH", headers: { ...ana, ...json }, body: JSON.stringify({ visibility: "personal" }) })).json();
  assert.equal(back.isDefault, false);
});
