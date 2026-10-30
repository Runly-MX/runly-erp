import test from "node:test";
import assert from "node:assert/strict";
import { markChatViewUnmounted, recallChatView, rememberChatView } from "../chatViewMemory.js";

test("chatViewMemory restores the open view only on an immediate remount of the same conversation", () => {
  rememberChatView({ conversationId: "a", recordingsView: true });
  // New tree rendered before the old one's cleanup ran.
  assert.equal(recallChatView("a")?.recordingsView, true);
  assert.equal(recallChatView("b"), null);
  markChatViewUnmounted("a");
  assert.equal(recallChatView("a", Date.now() + 500)?.recordingsView, true);
  // Leaving the conversation and coming back later opens it on its messages.
  assert.equal(recallChatView("a", Date.now() + 10_000), null);
});
