import test from "node:test";
import assert from "node:assert/strict";
import {
  isBlockedAddress, parseSafeImageUrl, assertSafeImageUrl, detectImageType, readImageSize,
  fetchImageBytes, createNoteImageAppender, initialImageWidthPct, hostOfUrl, MAX_IMAGE_BYTES,
} from "../append-images.js";

const png = (w = 640, h = 320, pad = 0) => {
  const b = Buffer.alloc(33 + pad);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const resp = (body, init = {}) => new Response(body, init);

test("isBlockedAddress classifies private, loopback, metadata, CGNAT and IPv6 forms", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "2002:7f00:1::", "ff02::1", "2001:db8::1"]) {
    assert.equal(isBlockedAddress(a), true, a);
  }
  for (const a of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.63.0.1", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:5db8:d822"]) {
    assert.equal(isBlockedAddress(a), false, a);
  }
});

test("parseSafeImageUrl enforces https, no credentials, port 443, public literal IPs", () => {
  assert.throws(() => parseSafeImageUrl("http://example.com/a.png"), /https/);
  assert.throws(() => parseSafeImageUrl("ftp://example.com/a.png"), /https/);
  assert.throws(() => parseSafeImageUrl("https://user:pw@example.com/a.png"), /credenciales/);
  assert.throws(() => parseSafeImageUrl("https://example.com:8443/a.png"), /443/);
  assert.throws(() => parseSafeImageUrl("https://127.0.0.1/a.png"), /no permitida/);
  assert.throws(() => parseSafeImageUrl("https://[::1]/a.png"), /no permitida/);
  assert.throws(() => parseSafeImageUrl("https://[::ffff:127.0.0.1]/a.png"), /no permitida/);
  assert.throws(() => parseSafeImageUrl("nope"), /no es válida/);
  assert.equal(parseSafeImageUrl("https://example.com:443/a.png?x=1").hostname, "example.com");
});

test("assertSafeImageUrl rejects hosts resolving to internal addresses (any record)", async () => {
  await assert.rejects(assertSafeImageUrl("https://evil.example/a.png", { lookupImpl: async () => [{ address: "93.184.216.34" }, { address: "10.0.0.5" }] }), /no permitida/);
  await assert.rejects(assertSafeImageUrl("https://nx.example/a.png", { lookupImpl: async () => { throw new Error("ENOTFOUND"); } }), /resolver/);
  assert.equal((await assertSafeImageUrl("https://ok.example/a.png", { lookupImpl: publicLookup })).hostname, "ok.example");
});

test("hostOfUrl never returns the query string", () => {
  assert.equal(hostOfUrl("https://cdn.example.com/a.png?token=secret"), "cdn.example.com");
});

test("detectImageType uses magic bytes and rejects svg/html", () => {
  assert.equal(detectImageType(png()).mime, "image/png");
  assert.equal(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])).ext, "jpg");
  assert.equal(detectImageType(Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(20)])).mime, "image/gif");
  const webp = Buffer.alloc(30); webp.write("RIFF", 0, "latin1"); webp.write("WEBP", 8, "latin1");
  assert.equal(detectImageType(webp).mime, "image/webp");
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectImageType(Buffer.from("<html>aaaaaaaaaaaa</html>")), null);
});

test("readImageSize parses png, gif, jpeg and webp headers", () => {
  assert.deepEqual(readImageSize(png(640, 320), "image/png"), { width: 640, height: 320 });
  const gif = Buffer.alloc(14); gif.write("GIF89a", 0, "latin1"); gif.writeUInt16LE(100, 6); gif.writeUInt16LE(50, 8);
  assert.deepEqual(readImageSize(gif, "image/gif"), { width: 100, height: 50 });
  // SOI, APP0 (len 4), SOF0 with 200x300
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(readImageSize(jpg, "image/jpeg"), { width: 200, height: 300 });
  const vp8x = Buffer.alloc(30); vp8x.write("RIFF", 0, "latin1"); vp8x.write("WEBP", 8, "latin1"); vp8x.write("VP8X", 12, "latin1");
  vp8x.writeUIntLE(799, 24, 3); vp8x.writeUIntLE(399, 27, 3);
  assert.deepEqual(readImageSize(vp8x, "image/webp"), { width: 800, height: 400 });
  const vp8 = Buffer.alloc(30); vp8.write("RIFF", 0, "latin1"); vp8.write("WEBP", 8, "latin1"); vp8.write("VP8 ", 12, "latin1");
  vp8.writeUInt16LE(321, 26); vp8.writeUInt16LE(123, 28);
  assert.deepEqual(readImageSize(vp8, "image/webp"), { width: 321, height: 123 });
  assert.equal(readImageSize(Buffer.alloc(5), "image/png"), null);
});

test("initialImageWidthPct mirrors the editor default and tall-image cap", () => {
  assert.equal(initialImageWidthPct(null), 60);
  assert.equal(initialImageWidthPct({ width: 1000, height: 500 }), 60);
  assert.ok(initialImageWidthPct({ width: 500, height: 2000 }) < 60);
});

test("fetchImageBytes rejects wrong type and oversize bodies", async () => {
  const lookupImpl = publicLookup;
  await assert.rejects(fetchImageBytes("https://img.example/a", { lookupImpl, fetchImpl: async () => resp(Buffer.from("hola mundo, no soy imagen"), { status: 200 }) }), /Formato/);
  await assert.rejects(fetchImageBytes("https://img.example/a", { lookupImpl, fetchImpl: async () => resp(png(1, 1, MAX_IMAGE_BYTES), { status: 200 }) }), /10 MB/);
});

test("fetchImageBytes follows safe redirects, ignores content-type and detects the real type", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/a")) return resp(null, { status: 302, headers: { location: "https://cdn.example/b.png" } });
    return resp(png(), { status: 200, headers: { "content-type": "text/html" } });
  };
  const out = await fetchImageBytes("https://img.example/a", { fetchImpl, lookupImpl: publicLookup });
  assert.equal(out.mime, "image/png");
  assert.equal(calls.length, 2);
});

test("fetchImageBytes re-validates every redirect hop and caps hops", async () => {
  await assert.rejects(fetchImageBytes("https://img.example/a", {
    lookupImpl: publicLookup,
    fetchImpl: async () => resp(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } }),
  }), /no permitida/);
  await assert.rejects(fetchImageBytes("https://img.example/a", {
    lookupImpl: publicLookup,
    fetchImpl: async () => resp(null, { status: 302, headers: { location: "http://img.example/b" } }),
  }), /https/);
  let n = 0;
  await assert.rejects(fetchImageBytes("https://img.example/a", {
    lookupImpl: publicLookup,
    fetchImpl: async () => { n++; return resp(null, { status: 302, headers: { location: "https://img.example/a" } }); },
  }), /redirecciones/);
  assert.equal(n, 4);
});

test("fetchImageBytes enforces the size cap on the stream, the real type and the status", async () => {
  const big = Buffer.concat([png(), Buffer.alloc(MAX_IMAGE_BYTES)]);
  await assert.rejects(fetchImageBytes("https://img.example/a.png", { lookupImpl: publicLookup, fetchImpl: async () => resp(big, { status: 200 }) }), /10 MB/);
  await assert.rejects(fetchImageBytes("https://img.example/a.png", { lookupImpl: publicLookup, fetchImpl: async () => resp("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } }) }), /Formato/);
  await assert.rejects(fetchImageBytes("https://img.example/a.png", { lookupImpl: publicLookup, fetchImpl: async () => resp("no", { status: 404 }) }), /404/);
});

function storageStub({ failOn = null } = {}) {
  const store = { uploads: [], removed: [] };
  const bucket = {
    upload: async (key, buf, opts) => {
      if (failOn !== null && store.uploads.length === failOn) return { error: new Error("boom") };
      store.uploads.push({ key, size: buf.length, opts });
      return { error: null };
    },
    getPublicUrl: (key) => ({ data: { publicUrl: `https://files.example/storage/v1/object/public/runly-notes/${key}` } }),
    remove: async (keys) => { store.removed.push(...keys); return {}; },
  };
  return { store, supabaseAdmin: { storage: { from: (b) => { assert.equal(b, "runly-notes"); return bucket; } } } };
}

test("appender uploads under the editor's key layout and fills image blocks", async () => {
  const { store, supabaseAdmin } = storageStub();
  const blocks = [{ type: "paragraph", text: "x" }, { type: "image", url: "https://img.example/a.png", alt: "uno" }];
  const appender = createNoteImageAppender({ supabaseAdmin, lookupImpl: publicLookup, fetchImpl: async () => resp(png(800, 400), { status: 200 }) });
  const n = await appender.attach({ blocks, images: [{ url: "https://img.example/b.png", alt: "dos" }], companyId: "co1", userId: "u1", noteId: "n1" });
  assert.equal(n, 2);
  assert.equal(blocks.length, 3);
  assert.match(store.uploads[0].key, /^companies\/co1\/notes\/n1\/\d+-[a-z0-9]+\.png$/);
  assert.equal(store.uploads[0].opts.contentType, "image/png");
  assert.match(blocks[1].src, /^https:\/\/files\.example\/.*\.png$/);
  assert.equal(blocks[1].aspectRatio, 2);
  assert.equal(blocks[2].alt, "dos");
});

test("appender fails clearly without storage and removes uploads when a later image fails", async () => {
  const blocks = [{ type: "image", url: "https://img.example/a.png", alt: "" }];
  await assert.rejects(createNoteImageAppender({}).attach({ blocks, noteId: "n", userId: "u" }), /almacenamiento de imágenes no está disponible/);
  const { store, supabaseAdmin } = storageStub({ failOn: 1 });
  const appender = createNoteImageAppender({ supabaseAdmin, lookupImpl: publicLookup, fetchImpl: async () => resp(png(), { status: 200 }) });
  await assert.rejects(appender.attach({ blocks: [], images: [{ url: "https://i.example/1.png" }, { url: "https://i.example/2.png" }], noteId: "n", userId: "u" }), /guardar la imagen/);
  assert.equal(store.removed.length, 1);
});

test("appender rejects more than five images", async () => {
  const blocks = Array.from({ length: 6 }, () => ({ type: "image", url: "https://img.example/a.png", alt: "" }));
  await assert.rejects(createNoteImageAppender({ supabaseAdmin: storageStub().supabaseAdmin }).attach({ blocks, noteId: "n", userId: "u" }), /Máximo 5/);
});
