import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSearchRouter } from "../search-routes.js";

function fakeProvider(source, moduleKey, { items = [], permission = `${source}.read`, delay = 0, fail = false, seen } = {}) {
  return {
    source,
    moduleKey,
    label: source.toUpperCase(),
    permission,
    target: (id) => `/t/${source}/${id}`,
    seeAllTarget: (q) => `/all/${source}?q=${q}`,
    async search(ctx) {
      seen?.push({ source, limit: ctx.limit, companyId: ctx.companyId });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (fail) throw new Error("boom");
      return { items: items.map((id) => ({ id, title: `${source}-${id}`, icon: "X" })), total: items.length };
    },
  };
}

function makeContext({ isAdmin = false, permissions = [] } = {}) {
  return { profile: { id: "actor-1" }, isAdmin, permissionSet: new Set(permissions), memberships: [{ companyId: "co-1" }] };
}

async function resolveTenantContext(c, context) {
  const companyId = context.memberships?.[0]?.companyId ?? null;
  return { ok: true, tenant: { companyId, isAdmin: context.isAdmin, permissionSet: context.permissionSet } };
}

function makeApp(context, providers, extra = {}) {
  return createSearchRouter({ prisma: {}, getUserContext: async () => context, resolveTenantContext, providers, suggest: async () => [], ...extra });
}

async function get(app, path) {
  const res = await app.request(`http://localhost${path}`);
  return { status: res.status, body: await res.json() };
}

describe("GET /search", () => {
  it("short query or no company returns empty groups without running providers", async () => {
    const seen = [];
    const app = makeApp(makeContext({ isAdmin: true }), [fakeProvider("a", "m.a", { items: ["1"], seen })]);
    assert.deepEqual((await get(app, "/search?q=a")).body, { query: "a", groups: [] });
    const ctx = makeContext({ isAdmin: true });
    ctx.memberships = [];
    assert.deepEqual((await get(makeApp(ctx, [fakeProvider("a", "m.a", { seen })]), "/search?q=abc")).body.groups, []);
    assert.equal(seen.length, 0);
  });

  it("unscoped: every allowed provider, contract fields present", async () => {
    const app = makeApp(makeContext({ isAdmin: true }), [fakeProvider("a", "m.a", { items: ["1"] }), fakeProvider("b", "m.b", { items: ["2"] })]);
    const { body } = await get(app, "/search?q=abc");
    assert.equal(body.scope, null);
    assert.equal(body.scopeLabel, null);
    assert.equal(body.fallback, false);
    assert.deepEqual(body.groups.map((g) => g.source), ["a", "b"]);
    assert.deepEqual(body.groups[0], {
      source: "a", moduleKey: "m.a", label: "A", total: 1, seeAllTarget: "/all/a?q=abc",
      items: [{ id: "1", title: "a-1", icon: "X", source: "a", target: "/t/a/1" }],
    });
    assert.deepEqual(body.suggestions, []);
  });

  it("scoped with results returns only the scope module, limit up to 10", async () => {
    const seen = [];
    const app = makeApp(makeContext({ isAdmin: true }), [
      fakeProvider("a", "m.a", { items: ["1"], seen }),
      fakeProvider("b", "m.b", { items: ["2"], seen }),
    ]);
    const { body } = await get(app, "/search?q=abc&module=m.a");
    assert.equal(body.scope, "m.a");
    assert.equal(body.fallback, false);
    assert.deepEqual(body.groups.map((g) => g.source), ["a"]);
    assert.deepEqual(seen, [{ source: "a", limit: 10, companyId: "co-1" }]);
  });

  it("scoped with no results falls back to other modules (limit 5)", async () => {
    const seen = [];
    const app = makeApp(makeContext({ isAdmin: true }), [
      fakeProvider("a", "m.a", { items: [], seen }),
      fakeProvider("b", "m.b", { items: ["2"], seen }),
    ]);
    const { body } = await get(app, "/search?q=abc&module=m.a&limit=9");
    assert.equal(body.scope, "m.a");
    assert.equal(body.fallback, true);
    assert.deepEqual(body.groups.map((g) => g.source), ["b"]);
    assert.equal(seen.find((s) => s.source === "b").limit, 5);
  });

  it("unknown module is ignored; nothing anywhere returns suggestions", async () => {
    const app = makeApp(makeContext({ isAdmin: true }), [fakeProvider("a", "m.a")], {
      suggest: async () => [{ text: "Lenovo", source: "a", label: "A", target: "/t/a/1" }],
    });
    const { body } = await get(app, "/search?q=lenvo&module=nope");
    assert.equal(body.scope, null);
    assert.equal(body.fallback, false);
    assert.deepEqual(body.groups, []);
    assert.equal(body.suggestions.length, 1);
  });

  it("never leaks modules the user has no permission for, scoped or not", async () => {
    const providers = [fakeProvider("a", "m.a", { items: ["1"] }), fakeProvider("b", "m.b", { items: ["2"] })];
    const app = makeApp(makeContext({ permissions: ["a.read"] }), providers);
    assert.deepEqual((await get(app, "/search?q=abc")).body.groups.map((g) => g.source), ["a"]);
    const scopedForbidden = (await get(app, "/search?q=abc&module=m.b")).body;
    assert.equal(scopedForbidden.fallback, true);
    assert.deepEqual(scopedForbidden.groups.map((g) => g.source), ["a"]);
    const none = await get(makeApp(makeContext(), providers), "/search?q=abc&module=m.b");
    assert.deepEqual(none.body.groups, []);
  });

  it("a failing or slow provider is isolated and the response is still 200", async () => {
    const app = makeApp(
      makeContext({ isAdmin: true }),
      [fakeProvider("ok", "m.ok", { items: ["1"] }), fakeProvider("bad", "m.bad", { fail: true }), fakeProvider("slow", "m.slow", { items: ["3"], delay: 300 })],
      { providerTimeoutMs: 50 },
    );
    const { status, body } = await get(app, "/search?q=abc");
    assert.equal(status, 200);
    assert.deepEqual(body.groups.map((g) => g.source), ["ok"]);
  });

  it("401 without profile", async () => {
    const app = createSearchRouter({ prisma: {}, getUserContext: async () => null, resolveTenantContext, providers: [] });
    assert.equal((await get(app, "/search?q=abc")).status, 401);
  });
});

describe("GET /search help-only results", () => {
  it("still suggests close matches and does not trigger the module fallback", async () => {
    const providers = [fakeProvider("a", "m.a"), { ...fakeProvider("help", null, { items: ["h"] }), permission: "help.read" }];
    const app = makeApp(makeContext({ isAdmin: true }), providers, {
      suggest: async () => [{ text: "Lenovo", source: "a", label: "A", target: "/t/a/1" }],
    });
    const scoped = (await get(app, "/search?q=abc&module=m.a")).body;
    assert.equal(scoped.fallback, false);
    assert.equal(scoped.suggestions.length, 1);
    assert.equal((await get(app, "/search?q=abc")).body.suggestions.length, 1);
  });
});
