import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createAuthMiddleware } from "../auth-middleware.js";
import { signHs256Jwt } from "../jwt-verification.js";

const SECRET = "fixture-only-auth-middleware-secret";

function fixture(t, { secret = SECRET, remoteTokens = new Map(), ttl = 300 } = {}) {
  let now = 1_800_000_000;
  t.mock.method(Date, "now", () => now * 1000);
  const cache = new Map(), writes = [], calls = [], warnings = [];
  const app = new Hono();
  app.use("*", createAuthMiddleware({
    getJwtSecret: () => secret,
    userContextTtlSeconds: ttl,
    cacheGet: key => { const entry = cache.get(key); return entry && entry.until > now ? entry.userId : undefined; },
    cacheSet: (key, userId, seconds) => { writes.push({ key, userId, seconds }); cache.set(key, { userId, until: now + seconds }); },
    supabaseAdmin: { auth: { getUser: async token => {
      calls.push(token);
      const userId = remoteTokens.get(token);
      return userId ? { data: { user: { id: userId } }, error: null } : { data: { user: null }, error: { status: 401, message: "Fixture rejected" } };
    } } },
    warn: (...args) => warnings.push(args),
  }));
  app.get("/fixture", c => c.json({ userId: c.get("authUserId") }));
  return { calls, writes, warnings, remoteTokens, advance: seconds => { now += seconds; }, request: token => app.request("/fixture", token ? { headers: { Authorization: `Bearer ${token}` } } : {}) };
}

test("missing Bearer returns 401 without querying the authority", async t => {
  const f = fixture(t);
  const response = await f.request();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "No autorizado. Debes iniciar sesion." });
  assert.equal(f.calls.length, 0);
});

test("valid local token supplies its identity and preserves cache hit behavior", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "local-user" }, SECRET, 3600);
  assert.deepEqual(await (await f.request(token)).json(), { userId: "local-user" });
  assert.deepEqual(await (await f.request(token)).json(), { userId: "local-user" });
  assert.equal(f.calls.length, 0);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].seconds, 300);
});

test("remote authority identity is used after local rejection and cached on repeated requests", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "untrusted-sub" }, "different-fixture-secret", 3600);
  f.remoteTokens.set(token, "remote-user");
  assert.deepEqual(await (await f.request(token)).json(), { userId: "remote-user" });
  assert.deepEqual(await (await f.request(token)).json(), { userId: "remote-user" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.writes[0].seconds, 300);
});

test("no configured local secret delegates to the remote authority", async t => {
  const f = fixture(t, { secret: null });
  const token = signHs256Jwt({ sub: "untrusted-sub" }, SECRET, 3600);
  f.remoteTokens.set(token, "remote-user");
  assert.deepEqual(await (await f.request(token)).json(), { userId: "remote-user" });
  assert.equal(f.calls.length, 1);
});

test("rejected authority response preserves 401 and diagnostic without the token", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "fixture-user" }, "different-fixture-secret", 3600);
  const response = await f.request(token);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "No autorizado. Token invalido o expirado." });
  assert.equal(f.writes.length, 0);
  assert.equal(f.warnings.length, 1);
  assert.equal(JSON.stringify(f.warnings).includes(token), false);
});

test("a local token inside the expiry leeway is accepted without creating a stale cache entry", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "local-user" }, SECRET, -5);
  assert.equal((await f.request(token)).status, 200);
  assert.equal(f.writes.length, 0);
  assert.equal(f.calls.length, 0);
});

test("a changed token with the same signature suffix cannot reuse a cached identity", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "local-user" }, SECRET, 3600);
  assert.equal((await f.request(token)).status, 200);
  const [header, , signature] = token.split(".");
  const changedPayload = Buffer.from(JSON.stringify({ sub: "changed-fixture-user", exp: 1_800_003_600 })).toString("base64url");
  const changed = `${header}.${changedPayload}.${signature}`;
  assert.equal(changed.slice(-32), token.slice(-32));
  assert.equal((await f.request(changed)).status, 401, "An invalid signature must not inherit cached authentication from a matching suffix");
  assert.equal(f.calls.length, 1);
  assert.equal(f.writes.length, 1);
});

test("a remotely validated identity is not served from cache after token expiry", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "untrusted-sub" }, "different-fixture-secret", 40);
  f.remoteTokens.set(token, "remote-user");
  assert.equal((await f.request(token)).status, 200);
  f.advance(41);
  f.remoteTokens.delete(token);
  assert.equal((await f.request(token)).status, 401, "Expired identity must be revalidated instead of using the five-minute fallback cache");
  assert.equal(f.calls.length, 2);
  assert.equal(f.writes[0].seconds, 10);
});

test("a fallback token inside the expiry buffer is not cached", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "untrusted-sub" }, "different-fixture-secret", 20);
  f.remoteTokens.set(token, "remote-user");
  assert.equal((await f.request(token)).status, 200);
  assert.equal((await f.request(token)).status, 200);
  assert.equal(f.writes.length, 0);
  assert.equal(f.calls.length, 2);
});

test("fallback authority remains authoritative but unknown or invalid expiry is never cached", async t => {
  const f = fixture(t);
  const tokens = [
    signHs256Jwt({ exp: undefined }, "different-fixture-secret", 3600),
    signHs256Jwt({ exp: "1800003600" }, "different-fixture-secret", 3600),
    signHs256Jwt({ exp: null }, "different-fixture-secret", 3600),
    "opaque-fixture-authority-token",
  ];
  for (const token of tokens) {
    // Simulate a successful authority without pretending these are real Auth tokens.
    f.remoteTokens.set(token, "remote-user");
    assert.deepEqual(await (await f.request(token)).json(), { userId: "remote-user" });
    assert.deepEqual(await (await f.request(token)).json(), { userId: "remote-user" });
  }
  assert.equal(f.writes.length, 0);
  assert.equal(f.calls.length, tokens.length * 2);
});

test("fallback TTL also respects the existing configured maximum", async t => {
  const f = fixture(t, { ttl: 20 });
  const token = signHs256Jwt({ sub: "untrusted-sub" }, "different-fixture-secret", 3600);
  f.remoteTokens.set(token, "remote-user");
  assert.equal((await f.request(token)).status, 200);
  assert.equal(f.writes[0].seconds, 20);
  f.advance(21);
  assert.equal((await f.request(token)).status, 200);
  assert.equal(f.calls.length, 2);
});

test("local expiry buffer and cache key prefix remain compatible without storing token text", async t => {
  const f = fixture(t);
  const token = signHs256Jwt({ sub: "local-user" }, SECRET, 40);
  assert.equal((await f.request(token)).status, 200);
  assert.equal(f.writes[0].seconds, 10);
  assert.match(f.writes[0].key, /^auth:token:[a-f0-9]{64}$/);
  assert.equal(f.writes[0].key.includes(token), false);
});
