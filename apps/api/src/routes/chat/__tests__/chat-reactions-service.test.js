import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createChatReactionsService, ChatReactionsError } from "../chat-reactions-service.js";
import { _resetProfileIdCacheForTests } from "../chat-service.js";

// resolveUserProfileId caches auth_user_id -> profileId at module scope in
// chat-service.js; every test below uses the same authUserId ("auth-1"), so
// without resetting between tests, tests 2 and 3 would hit the cache instead
// of calling prisma.$queryRaw, shifting every subsequent mocked result by one
// index. Same pattern as chat-service.test.js / chat-permissions-service.test.js.
beforeEach(() => {
  _resetProfileIdCacheForTests();
});

function buildPrismaMock(queryRawResults, executeRawResults = []) {
  let qIdx = 0, eIdx = 0;
  return {
    $queryRaw: async () => {
      if (qIdx >= queryRawResults.length) throw new Error(`Unexpected $queryRaw call #${qIdx + 1}`);
      return queryRawResults[qIdx++];
    },
    $executeRaw: async () => executeRawResults[eIdx++] ?? { count: 1 },
  };
}

describe("chat-reactions-service — toggleReaction", () => {
  it("throws 404 when the message doesn't exist or isn't in a conversation the caller belongs to", async () => {
    const prisma = buildPrismaMock([
      [{ id: "profile-1" }], // resolveUserProfileId
      [], // message + membership lookup: no match
    ]);
    const svc = createChatReactionsService({ prisma });
    await assert.rejects(
      () => svc.toggleReaction({ messageId: "msg-1", authUserId: "auth-1", emoji: "👍" }),
      (err) => err instanceof ChatReactionsError && err.status === 404,
    );
  });

  it("adds the reaction when the caller hasn't reacted with this emoji yet", async () => {
    const prisma = buildPrismaMock([
      [{ id: "profile-1" }],
      [{ id: "msg-1" }],       // message + membership lookup: found
      [],                      // existing-reaction check: none
      [{ id: "reaction-1" }],  // INSERT ... RETURNING id
    ]);
    const svc = createChatReactionsService({ prisma });
    const result = await svc.toggleReaction({ messageId: "msg-1", authUserId: "auth-1", emoji: "👍" });
    assert.deepEqual(result, { added: true, emoji: "👍", attachmentId: null });
  });

  it("removes the reaction when the caller already reacted with this emoji (toggle off)", async () => {
    const prisma = buildPrismaMock([
      [{ id: "profile-1" }],
      [{ id: "msg-1" }],
      [{ id: "reaction-1" }], // existing-reaction check: found
    ], [
      { count: 1 }, // DELETE
    ]);
    const svc = createChatReactionsService({ prisma });
    const result = await svc.toggleReaction({ messageId: "msg-1", authUserId: "auth-1", emoji: "👍" });
    assert.deepEqual(result, { added: false, emoji: "👍", attachmentId: null });
  });

  it("throws 404 when attachmentId doesn't belong to the target message", async () => {
    const prisma = buildPrismaMock([
      [{ id: "profile-1" }],
      [{ id: "msg-1" }],       // message + membership lookup: found
      [],                      // attachment ownership check: no match
    ]);
    const svc = createChatReactionsService({ prisma });
    await assert.rejects(
      () => svc.toggleReaction({ messageId: "msg-1", authUserId: "auth-1", emoji: "👍", attachmentId: "att-1" }),
      (err) => err instanceof ChatReactionsError && err.status === 404,
    );
  });

  it("adds an attachment-scoped reaction, keyed separately from message-level ones", async () => {
    const prisma = buildPrismaMock([
      [{ id: "profile-1" }],
      [{ id: "msg-1" }],
      [{ id: "att-1" }],       // attachment ownership check: found
      [],                      // existing-reaction check (scoped to this attachment): none
      [{ id: "reaction-1" }],  // INSERT ... RETURNING id
    ]);
    const svc = createChatReactionsService({ prisma });
    const result = await svc.toggleReaction({ messageId: "msg-1", authUserId: "auth-1", emoji: "😂", attachmentId: "att-1" });
    assert.deepEqual(result, { added: true, emoji: "😂", attachmentId: "att-1" });
  });

  it("removes an attachment-scoped reaction on toggle-off", async () => {
    const prisma = buildPrismaMock([
      [{ id: "profile-1" }],
      [{ id: "msg-1" }],
      [{ id: "att-1" }],
      [{ id: "reaction-1" }], // existing-reaction check: found
    ], [
      { count: 1 }, // DELETE
    ]);
    const svc = createChatReactionsService({ prisma });
    const result = await svc.toggleReaction({ messageId: "msg-1", authUserId: "auth-1", emoji: "😂", attachmentId: "att-1" });
    assert.deepEqual(result, { added: false, emoji: "😂", attachmentId: "att-1" });
  });
});

describe("chat-reactions-service — realtime", () => {
  it("broadcasts chat.message.reaction to the conversation members after a toggle", async () => {
    const prisma = buildPrismaMock([
      [{ id: "profile-1" }], // resolveUserProfileId
      [{ id: "msg-1", conversation_id: "conv-1" }], // message + membership
      [], // no existing reaction
      [{ id: "r1" }], // insert
      [{ user_id: "u1" }, { user_id: "u2" }], // members for the broadcast
    ]);
    const sent = [];
    const svc = createChatReactionsService({ prisma, broadcaster: { broadcastToUsers: async (ids, event, payload) => sent.push([ids, event, payload]) } });
    await svc.toggleReaction({ messageId: "msg-1", authUserId: "auth-1", emoji: "👍" });
    assert.deepEqual(sent, [[["u1", "u2"], "chat.message.reaction", { conversationId: "conv-1", messageId: "msg-1" }]]);
  });
});
