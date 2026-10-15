import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchUrl,
  resolveSearchScope,
  normalizeSearchResponse,
  fallbackNotice,
  orderGroups,
  buildSearchExtras,
  searchReducer,
  initialSearchState,
} from "../commandSearch.js";
import { mapSearchGroups } from "../commandPalette.js";

test("buildSearchUrl includes module only when scoped", () => {
  assert.equal(buildSearchUrl({ q: "abc", moduleKey: "runly.inventory" }), "/search?q=abc&module=runly.inventory&limit=5");
  assert.equal(buildSearchUrl({ q: "a b" }), "/search?q=a+b&limit=5");
});

test("resolveSearchScope: global, scoped and widened", () => {
  const mod = { key: "runly.inventory", name: "Inventario" };
  assert.deepEqual(resolveSearchScope(null), { moduleKey: null, label: null, canWiden: false, widened: false });
  assert.equal(resolveSearchScope(mod).moduleKey, "runly.inventory");
  assert.equal(resolveSearchScope(mod).canWiden, true);
  const w = resolveSearchScope(mod, true);
  assert.equal(w.moduleKey, null);
  assert.equal(w.widened, true);
});

test("normalizeSearchResponse supports the old shape", () => {
  const r = normalizeSearchResponse({ query: "x", groups: [{ source: "a", items: [] }] });
  assert.equal(r.fallback, false);
  assert.deepEqual(r.suggestions, []);
  assert.equal(normalizeSearchResponse(null).groups.length, 0);
});

test("fallbackNotice and orderGroups", () => {
  assert.match(fallbackNotice({ fallback: true }, "Inventario"), /No encontramos resultados en Inventario/);
  assert.equal(fallbackNotice({ fallback: false }, "Inventario"), null);
  const g = [{ moduleKey: "b" }, { moduleKey: "a" }];
  assert.equal(orderGroups(g, "a")[0].moduleKey, "a");
});

test("mapSearchGroups adds count, matchedIn and a see-all row", () => {
  const [sec] = mapSearchGroups([
    { source: "inv", label: "Inventario", total: 12, seeAllTarget: "/app/m/runly.inventory/inventory?search=x", items: [{ id: "1", title: "T", matchedIn: "Serie", target: "/t" }] },
  ]);
  assert.equal(sec.count, 12);
  assert.equal(sec.items[0].matchedIn, "Serie");
  assert.equal(sec.items.at(-1).kind, "see-all");
});

test("buildSearchExtras: widen row and suggestions", () => {
  const scope = resolveSearchScope({ key: "k", name: "Mod" });
  const { top, bottom } = buildSearchExtras({ scope, searching: true, response: { suggestions: [{ text: "abc" }] } });
  assert.equal(top[0].items[0].kind, "widen");
  assert.equal(bottom[0].items[0].text, "abc");
});

test("searchReducer ignores stale responses", () => {
  let s = searchReducer(initialSearchState, { type: "start", id: 1, key: "a" });
  s = searchReducer(s, { type: "start", id: 2, key: "b" });
  s = searchReducer(s, { type: "success", id: 1, data: "old" });
  assert.equal(s.data, null);
  s = searchReducer(s, { type: "success", id: 2, data: "new" });
  assert.equal(s.data, "new");
  s = searchReducer(s, { type: "error", id: 1 });
  assert.equal(s.status, "success");
});
