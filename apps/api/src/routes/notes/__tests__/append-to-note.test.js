import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { createNotesService, NotesServiceError } from "../notes-service.js";

const NOTE = "01900000-0000-7000-8000-0000000000aa";
const USER = "01900000-0000-7000-8000-000000000001";
const CO = "01900000-0000-7000-8000-0000000000c1";

const norm = (strings) => strings.join(" ? ").replace(/\s+/g, " ").trim().toLowerCase();

function setup({ ydocState = null, owner = USER, share = null, noteCompany = CO, content = "<p>previo</p>", extra = {} } = {}) {
  const store = {
    row: ydocState ? { state: Buffer.from(ydocState), version: 1 } : null,
    note: { content, content_text: "previo", word_count: 1, is_trashed: false, note_type: "document" },
    updates: [],
  };
  const run = async (strings, ...values) => {
    const t = norm(strings);
    if (t.includes("from notes n left join note_shares ns")) {
      return [{ id: NOTE, owner_user_id: owner, company_id: noteCompany, share_permission: share }];
    }
    if (t.startsWith("select content, content_text, word_count")) return [store.note];
    if (t.startsWith("select state from note_ydoc_state")) return store.row ? [{ state: store.row.state }] : [];
    if (t.startsWith("select state, version from note_ydoc_state")) return store.row ? [{ ...store.row }] : [];
    if (t.startsWith("select id from notes where id")) return [{ id: NOTE }];
    if (t.startsWith("update note_ydoc_state")) {
      const [state, , version] = values;
      if (store.row.version !== version) return 0;
      store.row = { state, version: version + 1 };
      return 1;
    }
    if (t.startsWith("select * from notes")) return [{ ...store.note }];
    if (t.startsWith("update notes")) {
      store.updates.push(values);
      return [{ id: NOTE, title: "T", company_id: noteCompany, owner_user_id: owner }];
    }
    return [];
  };
  const broadcasts = [];
  const broadcaster = { broadcastToChannel: async (...a) => { broadcasts.push(a); }, broadcastToUsers: async () => {} };
  const prisma = { $queryRaw: run, $executeRaw: run };
  return { svc: createNotesService({ prisma, broadcaster, ...extra }), store, broadcasts, broadcaster };
}

function stateWithParagraph() {
  const d = new Y.Doc();
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, "previo");
  p.insert(0, [t]);
  d.getXmlFragment("default").insert(0, [p]);
  return Y.encodeStateAsUpdate(d);
}

test("appendToNote: with Y.js state merges nodes, mirrors columns and broadcasts", async () => {
  const { svc, store, broadcasts } = setup({ ydocState: stateWithParagraph() });
  const out = await svc.appendToNote({ noteId: NOTE, userId: USER, companyId: CO, text: "# H\n- a" });
  assert.equal(out.ydoc, true);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(store.row.state));
  assert.equal(doc.getXmlFragment("default").length, 3);
  assert.equal(store.row.version, 2);
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0][0], `note:ydoc:${NOTE}`);
  assert.equal(broadcasts[0][1], "ydoc.update");
  assert.ok(broadcasts[0][2].update);
  const joined = JSON.stringify(store.updates);
  assert.match(joined, /<p>previo<\/p><h1>H<\/h1><ul><li><p>a<\/p><\/li><\/ul>/);
  assert.ok(joined.includes("previo\\nH\\na"));
});

test("appendToNote: without Y.js state only columns change and nothing is broadcast", async () => {
  const { svc, store, broadcasts } = setup();
  const out = await svc.appendToNote({ noteId: NOTE, userId: USER, text: "hola" });
  assert.equal(out.ydoc, false);
  assert.equal(store.row, null);
  assert.equal(broadcasts.length, 0);
  assert.match(JSON.stringify(store.updates), /<p>previo<\/p><p>hola<\/p>/);
});

test("appendToNote: a failing broadcast never fails the append", async () => {
  const { svc, broadcaster } = setup({ ydocState: stateWithParagraph() });
  broadcaster.broadcastToChannel = async () => { throw new Error("down"); };
  const out = await svc.appendToNote({ noteId: NOTE, userId: USER, text: "x" });
  assert.equal(out.ydoc, true);
});

test("appendToNote: view-only share, other company, empty and oversized text are rejected", async () => {
  const viewer = setup({ owner: "other", share: "read" });
  await assert.rejects(() => viewer.svc.appendToNote({ noteId: NOTE, userId: USER, text: "x" }), (e) => e instanceof NotesServiceError && e.status === 403);
  const foreign = setup({ noteCompany: "01900000-0000-7000-8000-0000000000c2" });
  await assert.rejects(() => foreign.svc.appendToNote({ noteId: NOTE, userId: USER, companyId: CO, text: "x" }), { status: 404 });
  const ok = setup();
  await assert.rejects(() => ok.svc.appendToNote({ noteId: NOTE, userId: USER, text: "  " }), { status: 400 });
  await assert.rejects(() => ok.svc.appendToNote({ noteId: NOTE, userId: USER, text: "a".repeat(20001) }), { status: 400 });
});

const PNG = (() => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(600, 16); b.writeUInt32BE(300, 20);
  return b;
})();

function imageDeps({ failUpload = false } = {}) {
  const uploads = [];
  const fetched = [];
  const supabaseAdmin = { storage: { from: () => ({
    upload: async (key) => { if (failUpload) return { error: new Error("x") }; uploads.push(key); return { error: null }; },
    getPublicUrl: (key) => ({ data: { publicUrl: `https://files.example/public/runly-notes/${key}` } }),
    remove: async () => ({}),
  }) } };
  return {
    uploads, fetched,
    extra: {
      supabaseAdmin,
      lookupImpl: async (host) => [{ address: host === "internal.example" ? "10.0.0.9" : "93.184.216.34" }],
      fetchImpl: async (url) => { fetched.push(url); return new Response(PNG, { status: 200 }); },
    },
  };
}

test("appendToNote with images: src lands in the HTML column and the Y.js document", async () => {
  const deps = imageDeps();
  const { svc, store } = setup({ ydocState: stateWithParagraph(), extra: deps.extra });
  await svc.appendToNote({ noteId: NOTE, userId: USER, companyId: CO, text: "Texto\n![uno](https://img.example/a.png)", images: [{ data: PNG.toString("base64"), alt: "dos" }] });
  assert.equal(deps.uploads.length, 2);
  const joined = JSON.stringify(store.updates);
  const html = joined.replace(/\\+"/g, '"');
  assert.match(html, /<p>Texto<\/p><img src="https:\/\/files\.example\/public\/runly-notes\/companies\/[^"]+\.png" alt="uno" data-width="60" data-aspect-ratio="2"><img /);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(store.row.state));
  const frag = doc.getXmlFragment("default");
  assert.equal(frag.length, 4);
  assert.match(frag.get(2).getAttribute("src"), /^https:\/\/files\.example\//);
  assert.equal(frag.get(3).getAttribute("alt"), "dos");
});

test("appendToNote with images and no Y.js state writes only the columns", async () => {
  const deps = imageDeps();
  const { svc, store } = setup({ extra: deps.extra });
  const out = await svc.appendToNote({ noteId: NOTE, userId: USER, text: "", images: [{ url: "https://img.example/a.png" }] });
  assert.equal(out.ydoc, false);
  assert.match(JSON.stringify(store.updates), /<p>previo<\/p><img src=/);
});

test("appendToNote: an unsafe URL is rejected before any fetch or write", async () => {
  const deps = imageDeps();
  const { svc, store, broadcasts } = setup({ ydocState: stateWithParagraph(), extra: deps.extra });
  const before = store.row.version;
  for (const url of ["https://internal.example/a.png", "https://127.0.0.1/a.png", "http://img.example/a.png"]) {
    await assert.rejects(svc.appendToNote({ noteId: NOTE, userId: USER, text: "nuevo", images: [{ url: "https://img.example/ok.png" }, { url }] }), NotesServiceError);
  }
  assert.equal(deps.uploads.length <= 3, true);
  assert.equal(store.updates.length, 0);
  assert.equal(store.row.version, before);
  assert.equal(broadcasts.length, 0);
});

test("appendToNote: a failed upload or missing storage leaves the note unchanged", async () => {
  const failing = imageDeps({ failUpload: true });
  const a = setup({ ydocState: stateWithParagraph(), extra: failing.extra });
  await assert.rejects(a.svc.appendToNote({ noteId: NOTE, userId: USER, text: "nuevo", images: [{ url: "https://img.example/a.png" }] }), /guardar la imagen/);
  assert.equal(a.store.updates.length, 0);
  assert.equal(a.store.row.version, 1);
  const b = setup();
  await assert.rejects(b.svc.appendToNote({ noteId: NOTE, userId: USER, text: "nuevo", images: [{ url: "https://img.example/a.png" }] }), /no está disponible/);
  assert.equal(b.store.updates.length, 0);
});
