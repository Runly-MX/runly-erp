import assert from "node:assert/strict";
import test from "node:test";

import { describeVerification } from "../verify-message.js";

test("verified result is a success", () => {
  assert.equal(describeVerification({ verified: true }).kind, "success");
});

test("no ping means the script never loaded", () => {
  assert.match(describeVerification({ verified: false, diagnostic: null }).message, /no ha cargado/);
});

test("a ping with a mismatching origin points at the configured domain", () => {
  const { message } = describeVerification({
    verified: false,
    diagnostic: { state: "tracking", origin: "https://www.x.com", originAllowed: false },
  });
  assert.match(message, /https:\/\/www\.x\.com/);
  assert.match(message, /dominio/);
});

test("a blocked ping explains the cause", () => {
  assert.match(describeVerification({ verified: false, diagnostic: { state: "dnt", originAllowed: true } }).message, /No rastrear/);
});
