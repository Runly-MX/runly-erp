import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SEARCH_PROVIDERS, SEARCH_MODULE_LABELS } from "../search-providers.js";
import { findSuggestions } from "../search/suggestions.js";

function bySource(source) {
  const provider = SEARCH_PROVIDERS.find((p) => p.source === source);
  assert.ok(provider, `provider ${source} exists`);
  return provider;
}

// Fake prisma that records the raw query objects and answers with canned rows.
function fakePrisma(rows) {
  const calls = [];
  return { calls, $queryRaw: async (sql) => (calls.push(sql), typeof rows === "function" ? rows(sql) : rows) };
}

describe("search provider registry", () => {
  it("every provider has the required shape and unique sources", () => {
    const sources = new Set();
    for (const p of SEARCH_PROVIDERS) {
      assert.ok(p.source && !sources.has(p.source), `unique source ${p.source}`);
      sources.add(p.source);
      assert.ok(p.label && p.permission && p.icon, `${p.source} label/permission/icon`);
      assert.equal(typeof p.target("abc"), "string");
      assert.equal(typeof p.search, "function");
      assert.equal(typeof p.run, "function");
      if (p.moduleKey) assert.ok(SEARCH_MODULE_LABELS[p.moduleKey], `${p.source} module label`);
    }
    for (const key of ["contacts", "users", "employees", "help", "inventory", "purchase_orders", "projects", "files"]) {
      assert.ok(sources.has(key), key);
    }
  });

  it("targets and see-all routes match the SPA", () => {
    assert.equal(bySource("inventory").target("i1"), "/app/m/runly.inventory/inventory/i1");
    assert.equal(bySource("inventory").seeAllTarget("a b"), "/app/m/runly.inventory/inventory?search=a%20b");
    assert.equal(bySource("contacts").target("c1"), "/app/m/runly.contacts/contacts/c1");
    assert.equal(bySource("tasks").target("t1"), "/app/m/runly.projects?open=task:t1");
    assert.equal(bySource("help").target("runly.chat"), "/app/help?module=runly.chat");
  });
});

describe("provider SQL", () => {
  it("contacts: company-scoped, enabled-only, token AND, bound text, never null titles", async () => {
    const prisma = fakePrisma([{ id: "c1", name: null, email: null, phone: "555", type: "person", search_total: 7n }]);
    const { items, total } = await bySource("contacts").search({ prisma, companyId: "co1", q: "acme sa", limit: 3 });
    const sql = prisma.calls[0];
    assert.match(sql.sql, /company_id = \?::uuid AND t\.enabled = true/);
    assert.ok(sql.values.includes("co1"));
    assert.ok(sql.values.includes("%acme%") && sql.values.includes("%sa%"));
    assert.ok(!sql.sql.includes("acme"), "user text is never concatenated");
    assert.equal(total, 7);
    assert.deepEqual(items[0], { id: "c1", title: "Contacto sin nombre", subtitle: "555", icon: "ContactRound" });
  });

  it("inventory: title never null, subtitle joins serial, asset and assignee", async () => {
    const prisma = fakePrisma((sql) =>
      sql.sql.includes("WITH ")
        ? [{ id: "i1" }, { id: "i2" }]
        : [{ id: "i1", name: "Laptop", serial_number: "SN1", asset_tag: null, first_name: "Ana", last_name: "Lopez" }],
    );
    const { items, total } = await bySource("inventory").search({ prisma, companyId: "co1", q: "sn1", limit: 5, inventoryAccess: { areaIdsFor: async () => null } });
    assert.equal(total, 2);
    assert.equal(items[0].title, "Laptop");
    assert.equal(items[0].subtitle, "Serie SN1 · Asignado a Ana Lopez");
    assert.equal(items[0].matchedIn, undefined);
  });

  it("inventory: a limited actor only matches items of their areas (and none without areas)", async () => {
    const prisma = fakePrisma((sql) => (sql.sql.includes("WITH ") ? [{ id: "i1" }] : sql.sql.includes("area_id = ANY") ? [{ id: "i1" }] : []));
    const input = { prisma, companyId: "co1", q: "sn1", limit: 5 };
    await bySource("inventory").search({ ...input, inventoryAccess: { areaIdsFor: async () => ["area-a"] } });
    const restricted = prisma.calls.find((c) => c.sql.includes("area_id = ANY"));
    assert.ok(restricted && restricted.values.some((v) => Array.isArray(v) && v.includes("area-a")));
    await assert.rejects(bySource("inventory").search({ ...input, inventoryAccess: { areaIdsFor: async () => { throw new Error("sin acceso"); } } }));
  });

  it("run() returns plain items for MirAI callers", async () => {
    const prisma = fakePrisma([{ id: "u1", display_name: "Jane", email: "j@x.com", search_total: 1 }]);
    const items = await bySource("users").run({ prisma, companyId: "co1", q: "jane", limit: 5 });
    assert.deepEqual(items, [{ id: "u1", title: "Jane", subtitle: "j@x.com", icon: "Users" }]);
  });
});

describe("suggestions", () => {
  it("merges, dedupes, caps to 5 and boosts the scope module; failures return []", async () => {
    const providers = [bySource("inventory"), bySource("contacts")];
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({ source: "inventory", id: `i${i}`, text: `Lenovo ${i}`, score: 0.5 })),
      { source: "contacts", id: "c1", text: "lenovo 0", score: 0.55 },
      { source: "contacts", id: "c2", text: "Lenox", score: 0.45 },
      { source: "contacts", id: "c3", text: "Lemon", score: 0.31 },
    ];
    const out = await findSuggestions({ prisma: fakePrisma(rows), providers, companyId: "co1", actorId: "a", q: "lenvo", scope: "runly.inventory" });
    assert.equal(out.length, 5);
    assert.equal(out[0].source, "inventory");
    assert.equal(new Set(out.map((s) => s.text.toLowerCase())).size, 5);
    assert.equal(out[0].target.startsWith("/app/m/runly.inventory/inventory/"), true);
    const failing = { $queryRaw: async () => { throw new Error("x"); } };
    assert.deepEqual(await findSuggestions({ prisma: failing, providers, companyId: "co1", actorId: "a", q: "lenvo" }), []);
    assert.deepEqual(await findSuggestions({ prisma: fakePrisma(rows), providers, companyId: "co1", actorId: "a", q: "ab" }), []);
  });
});
