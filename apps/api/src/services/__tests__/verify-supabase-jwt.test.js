import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifySupabaseJwt, signHs256Jwt } from "../jwt-verification.js";

// Independent compact-token fixture generator. It can sign malformed headers
// and claims without using the production signer or any real secret.
function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signEncoded(headerB64, payloadB64, secret) {
  const signatureB64 = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

function signJwt(payload, secret, header = { alg: "HS256", typ: "JWT" }) {
  return signEncoded(base64url(JSON.stringify(header)), base64url(JSON.stringify(payload)), secret);
}

function fixedClock(t) {
  const now = 1_800_000_000;
  t.mock.method(Date, "now", () => now * 1000);
  return now;
}

const SECRET = "test-secret-for-verify-supabase-jwt";

test("accepts a token expired by less than the clock-skew leeway", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ sub: "user-1", exp: now - 5 }, SECRET);

  const payload = verifySupabaseJwt(token, SECRET);

  assert.ok(payload, "expected token within leeway to be accepted");
  assert.equal(payload.sub, "user-1");
});

test("rejects a token expired by more than the clock-skew leeway", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ sub: "user-1", exp: now - 30 }, SECRET);

  const payload = verifySupabaseJwt(token, SECRET);

  assert.equal(payload, null);
});

test("rejects a token with an invalid signature", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ sub: "user-1", exp: now + 3600 }, "a-different-secret");

  const payload = verifySupabaseJwt(token, SECRET);

  assert.equal(payload, null);
});

test("rejects a token with no exp field", () => {
  const token = signJwt({ sub: "user-1" }, SECRET);

  const payload = verifySupabaseJwt(token, SECRET);

  assert.equal(payload, null, "an access token must have a finite numeric expiry");
});

test("signHs256Jwt round-trips through verifySupabaseJwt with the given claims and a future exp", () => {
  const token = signHs256Jwt({ sub: "guest-session-1", role: "authenticated", guest_session_id: "guest-session-1" }, SECRET, 1800);

  const payload = verifySupabaseJwt(token, SECRET);

  assert.ok(payload, "expected the freshly signed token to verify");
  assert.equal(payload.sub, "guest-session-1");
  assert.equal(payload.role, "authenticated");
  assert.equal(payload.guest_session_id, "guest-session-1");
  const now = Math.floor(Date.now() / 1000);
  assert.ok(payload.exp > now + 1700 && payload.exp <= now + 1800, "expected exp roughly 1800s in the future");
});

test("signHs256Jwt output is rejected by verifySupabaseJwt under a different secret", () => {
  const token = signHs256Jwt({ sub: "guest-session-1" }, SECRET, 1800);

  const payload = verifySupabaseJwt(token, "a-different-secret");

  assert.equal(payload, null);
});

test("rejects signed headers that do not declare HS256", (t) => {
  const now = fixedClock(t);
  for (const header of [{ alg: "none" }, { alg: "RS256" }, { alg: "HS512" }, {}, null, [], "HS256"]) {
    assert.equal(verifySupabaseJwt(signJwt({ sub: "user-1", exp: now + 60 }, SECRET, header), SECRET), null);
  }
});

test("rejects unsupported critical headers and unencoded payload declarations", (t) => {
  const now = fixedClock(t);
  for (const extension of [{ crit: ["fixture"] }, { crit: [] }, { crit: null }, { b64: false }, { b64: "true" }]) {
    assert.equal(verifySupabaseJwt(signJwt({ exp: now + 60 }, SECRET, { alg: "HS256", ...extension }), SECRET), null);
  }
});

test("rejects signed payloads that are not claim objects", () => {
  for (const payload of ["fixture", [1, 2], 42, true, null]) {
    assert.equal(verifySupabaseJwt(signJwt(payload, SECRET), SECRET), null);
  }
});

test("rejects non-numeric and non-finite expiry claims", (t) => {
  const now = fixedClock(t);
  for (const exp of [String(now + 60), null, [], {}, false]) {
    assert.equal(verifySupabaseJwt(signJwt({ sub: "user-1", exp }, SECRET), SECRET), null);
  }
  const token = signEncoded(base64url('{"alg":"HS256"}'), base64url('{"sub":"user-1","exp":1e999}'), SECRET);
  assert.equal(verifySupabaseJwt(token, SECRET), null);
});

test("rejects a signed token that is not yet valid beyond clock leeway", (t) => {
  const now = fixedClock(t);
  assert.equal(verifySupabaseJwt(signJwt({ sub: "user-1", exp: now + 60, nbf: now + 11 }, SECRET), SECRET), null);
});

test("rejects malformed optional not-before claims", (t) => {
  const now = fixedClock(t);
  for (const nbf of [String(now), null, {}, [], true, Infinity]) {
    assert.equal(verifySupabaseJwt(signJwt({ exp: now + 60, nbf }, SECRET), SECRET), null);
  }
});

test("preserves exact clock leeway, optional typ and fractional NumericDate", (t) => {
  const now = fixedClock(t);
  assert.equal(verifySupabaseJwt(signJwt({ exp: now - 10 }, SECRET), SECRET), null);
  assert.ok(verifySupabaseJwt(signJwt({ exp: now - 9 }, SECRET), SECRET));
  assert.ok(verifySupabaseJwt(signJwt({ exp: now + 60, nbf: now + 10 }, SECRET), SECRET));
  assert.ok(verifySupabaseJwt(signJwt({ exp: now + 0.5, nbf: now + 0.5 }, SECRET, { alg: "HS256" }), SECRET));
});

test("rejects non-base64url or empty compact segments even when their bytes are signed", (t) => {
  const now = fixedClock(t);
  const header = base64url('{"alg":"HS256"}');
  const payload = base64url(JSON.stringify({ exp: now + 60 }));
  for (const token of [signEncoded(header + "*", payload, SECRET), signEncoded(header, payload + "=", SECRET), signEncoded("", payload, SECRET), signEncoded("not-json", payload, SECRET)]) {
    assert.equal(verifySupabaseJwt(token, SECRET), null);
  }
  for (const token of [null, undefined, 42, "", "a.b", "a.b.c.d"]) assert.equal(verifySupabaseJwt(token, SECRET), null);
});

test("returns valid claims unchanged without inferring authorization from metadata", (t) => {
  const now = fixedClock(t);
  const claims = { sub: "user-1", exp: now + 60, role: "authenticated", user_metadata: { fixture: true } };
  assert.deepEqual(verifySupabaseJwt(signJwt(claims, SECRET), SECRET), claims);
});
