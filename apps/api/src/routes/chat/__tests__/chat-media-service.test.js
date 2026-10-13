import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createChatMediaService, decodeMediaCursor, encodeMediaCursor } from "../chat-media-service.js";

const ID = "01a13756-e843-7131-872a-861398145b9f";

describe("chat media service", () => {
  it("round-trips the keyset cursor and rejects garbage", () => {
    const cursor = encodeMediaCursor({ createdAt: "2026-10-13T22:16:43.132Z", id: ID });
    assert.deepEqual(decodeMediaCursor(cursor), { at: new Date("2026-10-13T22:16:43.132Z"), id: ID });
    assert.equal(decodeMediaCursor(null), null);
    assert.throws(() => decodeMediaCursor("zzz"), (e) => e.status === 422);
  });

  it("rejects an unknown type before touching the database", async () => {
    const svc = createChatMediaService({ prisma: { $queryRaw: async () => { throw new Error("unexpected"); } } });
    await assert.rejects(svc.listMedia({ authUserId: "x", type: "nope" }), (e) => e.status === 422);
  });

  it("returns one page plus a cursor when more rows exist, with sizeBytes as a number", async () => {
    let call = 0;
    const prisma = {
      $queryRaw: async () => {
        call += 1;
        if (call === 1) return [{ id: "profile" }]; // resolveUserProfileId
        return [
          { id: ID, createdAt: new Date("2026-10-13T22:00:00Z"), sizeBytes: 10n },
          { id: "01a13756-0000-7000-8000-000000000001", createdAt: new Date("2026-10-13T21:00:00Z"), sizeBytes: 5n },
        ];
      },
      userProfile: { findFirst: async () => ({ id: "profile" }), findUnique: async () => ({ id: "profile" }) },
    };
    const svc = createChatMediaService({ prisma });
    const out = await svc.listMedia({ authUserId: "auth", type: "documents", limit: 1 });
    assert.equal(out.data.length, 1);
    assert.equal(out.data[0].sizeBytes, 10);
    assert.deepEqual(decodeMediaCursor(out.nextCursor), { at: new Date("2026-10-13T22:00:00Z"), id: ID });
  });
});
