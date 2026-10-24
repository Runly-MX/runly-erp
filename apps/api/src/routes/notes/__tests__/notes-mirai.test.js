// apps/api/src/routes/notes/__tests__/notes-mirai.test.js
//
// Focused tests for runly.notes MirAI tools/actions (spec
// 2026-09-30-mirai-remaining-modules §4): exact totals/ids, prepare() never
// writes, execute() goes through the real services, access-denied -> error.
import test from "node:test";
import assert from "node:assert/strict";
import { createNotesMiraiQueries } from "../notes-mirai-queries.js";
import { createNotesMiraiActions } from "../mirai-actions.js";
import { createNotesMiraiCapabilities } from "../mirai-capabilities.js";
import { NotesServiceError } from "../notes-service.js";

const actx = { companyId: "co1", actorProfileId: "me", actorAuthUserId: "auth" };

function fakeNotesSvc(overrides = {}) {
  return {
    getNote: async () => { throw new NotesServiceError("Nota no encontrada.", 404); },
    createNote: async (data) => ({ id: "n1", title: data.title ?? "Sin titulo" }),
    updateNote: async (id, _userId, data) => ({ id, title: data.title ?? "Nota", ...data }),
    trashNote: async () => ({ ok: true }),
    ...overrides,
  };
}

test("notes_search: returns exact total with noteId and a capped excerpt", async () => {
  const rows = [{ id: "n1", title: "Proveedor X", content_text: "a".repeat(500), updated_at: new Date(), folder_name: null }];
  const prisma = { $queryRaw: async () => rows };
  const [notes_search] = createNotesMiraiQueries({ prisma, notesSvc: fakeNotesSvc() });
  const out = await notes_search.run({ query: "proveedor" }, actx);
  assert.equal(out.total, 1);
  assert.equal(out.notas[0].noteId, "n1");
  assert.equal(out.notas[0].extracto.length, 200);
});

test("notes_get: caps content at 6000 chars and flags truncation", async () => {
  const notesSvc = fakeNotesSvc({ getNote: async () => ({ id: "n1", title: "Larga", content_text: "x".repeat(7000), tags: [{ name: "importante" }] }) });
  const [, notes_get] = createNotesMiraiQueries({ prisma: {}, notesSvc });
  const out = await notes_get.run({ noteId: "n1" }, actx);
  assert.equal(out.contenido.length, 6000);
  assert.equal(out.truncado, true);
  assert.deepEqual(out.etiquetas, ["importante"]);
});

test("notes_get: not found -> error, never throws", async () => {
  const [, notes_get] = createNotesMiraiQueries({ prisma: {}, notesSvc: fakeNotesSvc() });
  const out = await notes_get.run({ noteId: "nope" }, actx);
  assert.match(out.error, /no encontre/i);
});

function setupActions({ folders = [], tags = [] } = {}) {
  const calls = [];
  const notesSvc = fakeNotesSvc({
    createNote: async (data) => { calls.push(["create", data]); return { id: "n1", title: data.title ?? "Sin titulo" }; },
    updateNote: async (id, userId, data) => { calls.push(["update", id, data]); return { id, title: data.title ?? "Nota" }; },
    trashNote: async (id) => { calls.push(["trash", id]); return { ok: true }; },
  });
  const foldersSvc = { listFolders: async () => folders };
  const tagsSvc = { listTags: async () => tags, setNoteTags: async (id, userId, ids) => calls.push(["tags", id, ids]) };
  const actions = Object.fromEntries(createNotesMiraiActions({ prisma: {}, notesSvc, foldersSvc, tagsSvc }).map((a) => [a.key, a]));
  return { actions, calls, notesSvc };
}

test("create: resolves folder/tags by name, writes nothing in prepare", async () => {
  const { actions, calls } = setupActions({ folders: [{ id: "f1", name: "Proveedores" }], tags: [{ id: "t1", name: "urgente" }] });
  const out = await actions["notes.note.create"].prepare({ content: "Resumen de la llamada", folder: "Proveedores", tags: ["urgente"] }, actx);
  assert.equal(out.input.folderId, "f1");
  assert.deepEqual(out.input.tagIds, ["t1"]);
  assert.equal(calls.length, 0);
});

test("create: unknown tag name is rejected (tags must already exist)", async () => {
  const { actions } = setupActions({ tags: [] });
  const out = await actions["notes.note.create"].prepare({ content: "x", tags: ["no-existe"] }, actx);
  assert.match(out.error, /No encontre estas etiquetas/);
});

test("create: execute creates the note, sets content_text, and applies tags", async () => {
  const { actions, calls } = setupActions({ tags: [{ id: "t1", name: "urgente" }] });
  const res = await actions["notes.note.create"].execute({ title: null, content: "Hola\nMundo", folderId: null, tagIds: ["t1"] }, actx);
  assert.equal(res.id, "n1");
  assert.deepEqual(calls.map((c) => c[0]), ["create", "update", "tags"]);
  assert.equal(calls[1][2].contentText, "Hola\nMundo");
});

test("rename/move: no-op change returns an error", async () => {
  const { actions } = setupActions();
  const notesSvc = fakeNotesSvc({ getNote: async () => ({ id: "n1", title: "Nota", folder_id: null }) });
  const actions2 = Object.fromEntries(createNotesMiraiActions({ prisma: {}, notesSvc, foldersSvc: { listFolders: async () => [] }, tagsSvc: { listTags: async () => [] } }).map((a) => [a.key, a]));
  const out = await actions2["notes.note.rename_move"].prepare({ noteId: "n1", title: "Nota" }, actx);
  assert.match(out.error, /ningun cambio/);
  assert.ok(actions["notes.note.create"]); // sanity: setup() helper still usable
});

test("delete: moves to trash via trashNote", async () => {
  const notesSvc = fakeNotesSvc({ getNote: async () => ({ id: "n1", title: "Nota" }), trashNote: async (id) => ({ ok: true, id }) });
  const actions = Object.fromEntries(createNotesMiraiActions({ prisma: {}, notesSvc, foldersSvc: { listFolders: async () => [] }, tagsSvc: { listTags: async () => [] } }).map((a) => [a.key, a]));
  const prepared = await actions["notes.note.delete"].prepare({ noteId: "n1" }, actx);
  assert.equal(prepared.targetId, "n1");
  const res = await actions["notes.note.delete"].execute({ noteId: "n1" }, actx);
  assert.match(res.summary, /papelera/);
});

test("capability exposes the append action next to create/rename/delete", () => {
  const cap = createNotesMiraiCapabilities({ prisma: {} });
  assert.deepEqual(cap.actions.map((a) => a.key).sort(), ["notes.note.append", "notes.note.create", "notes.note.delete", "notes.note.rename_move"]);
});

test("append: prepare previews 300 chars without writing; execute calls appendToNote", async () => {
  const NOTE = "01900000-0000-7000-8000-0000000000aa";
  const calls = [];
  const notesSvc = fakeNotesSvc({
    getNote: async () => ({ id: NOTE, title: "Acta" }),
    appendToNote: async (args) => { calls.push(args); return { id: NOTE, title: "Acta" }; },
  });
  const actions = Object.fromEntries(createNotesMiraiActions({ prisma: {}, notesSvc, foldersSvc: {}, tagsSvc: {} }).map((a) => [a.key, a]));
  const a = actions["notes.note.append"];
  assert.equal(a.permission, "notes.notes.update");
  assert.match((await a.prepare({ noteId: "no-uuid", content: "x" }, actx)).error, /noteId/);
  const out = await a.prepare({ noteId: NOTE, content: "z".repeat(500) }, actx);
  assert.equal(out.preview.fields.find((f) => f.label === "Texto a agregar").value.length, 300);
  assert.equal(calls.length, 0);
  const res = await a.execute(out.input, actx);
  assert.equal(calls[0].companyId, "co1");
  assert.equal(res.link, `/app/m/runly.notes?note=${NOTE}`);
});

test("describeContext: returns null when getNote throws (no access)", async () => {
  const cap = createNotesMiraiCapabilities({ prisma: {} });
  const line = await cap.describeContext({ recordType: "note", recordId: "n1" }, actx);
  assert.equal(line, null);
});

test("append with images: preview lists count and hosts only, limits and unsafe urls are rejected in prepare", async () => {
  const NOTE = "01900000-0000-7000-8000-0000000000aa";
  const calls = [];
  const notesSvc = fakeNotesSvc({
    getNote: async () => ({ id: NOTE, title: "Acta" }),
    appendToNote: async (args) => { calls.push(args); return { id: NOTE, title: "Acta" }; },
  });
  const a = createNotesMiraiActions({ prisma: {}, notesSvc, foldersSvc: {}, tagsSvc: {} }).find((x) => x.key === "notes.note.append");
  const out = await a.prepare({
    noteId: NOTE,
    content: "![x](https://cdn.example.com/a.png?token=secret)",
    images: [{ url: "https://img.example.org/b.jpg?sig=zzz" }, { url: "https://third.example.net/c.webp" }],
  }, actx);
  const field = out.preview.fields.find((f) => f.label === "Imagenes").value;
  assert.equal(field, "3: cdn.example.com, img.example.org, third.example.net");
  assert.ok(!JSON.stringify(out.preview).includes("secret") && !JSON.stringify(out.preview).includes("sig=zzz"));
  await a.execute(out.input, actx);
  assert.equal(calls[0].images.length, 2);
  assert.equal(calls[0].images[0].url, "https://img.example.org/b.jpg?sig=zzz");
  assert.match((await a.prepare({ noteId: NOTE, content: "x", images: [{ url: "http://a.example/x.png" }] }, actx)).error, /https/);
  assert.match((await a.prepare({ noteId: NOTE, content: "x", images: [{ url: "https://127.0.0.1/x.png" }] }, actx)).error, /no permitida/);
  assert.ok((await a.prepare({ noteId: NOTE, content: "x", images: Array.from({ length: 6 }, () => ({ url: "https://a.example/x.png" })) }, actx)).error);
  for (const bad of [{ data: "QUJD", mimeType: "image/png" }, { url: "https://a.example/x.png", data: "QUJD" }]) {
    assert.match((await a.prepare({ noteId: NOTE, content: "x", images: [bad] }, actx)).error, /solo por URL https/);
  }
  const oversized = { noteId: NOTE, content: "x".repeat(20000), images: ["p", "q", "r"].map((c) => ({ url: `https://a.example/${c.repeat(1900)}.png` })), extra: "y".repeat(70000) };
  assert.match((await a.prepare(oversized, actx)).error, /demasiado grande/);
  assert.equal(calls.length, 1);
  assert.ok((await a.prepare({ noteId: NOTE }, actx)).error);
});
