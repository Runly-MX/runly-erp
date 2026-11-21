import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMeetingInput } from "../meetingInput.js";

test("parseMeetingInput reads an ID, a code link and a token link", () => {
  assert.deepEqual(parseMeetingInput(" ABC-d234-5 "), { code: "ABCD2345", guestPath: "/app/p/call?code=abcd2345" });
  assert.equal(parseMeetingInput("https://x.example/app/p/call?code=abc-d234-5").code, "ABCD2345");
  const token = "a".repeat(64);
  assert.deepEqual(parseMeetingInput(`https://x.example/app/p/call/${token}?i=beef`), { token, guestPath: `/app/p/call/${token}?i=beef` });
  assert.equal(parseMeetingInput("abc"), null);
  assert.equal(parseMeetingInput(""), null);
});
