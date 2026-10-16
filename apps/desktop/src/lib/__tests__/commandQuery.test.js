import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommandItems } from "../commandPalette.js";
import {
  filterGroupsForMode,
  initialsOf,
  parseQuery,
  pushRecent,
  toRecent,
} from "../commandQuery.js";

const modules = [
  { key: "runly.inventory", name: "Inventario", navigation: [{ label: "Activos", path: "/items" }] },
  { key: "runly.purchases", name: "Control de Compras", navigation: [] },
];
const recordGroup = {
  source: "inventory",
  label: "Inventario",
  items: [{ id: "1", title: "Inventarios 2026", target: "/app/m/runly.inventory/1" }],
};

test("parseQuery detects prefix modes and leaves plain text alone", () => {
  assert.deepEqual(parseQuery("/inv"), { mode: "modules", text: "inv" });
  assert.deepEqual(parseQuery("> nuevo"), { mode: "actions", text: "nuevo" });
  assert.deepEqual(parseQuery("@juan"), { mode: "people", text: "juan" });
  assert.deepEqual(parseQuery("inv"), { mode: null, text: "inv" });
});

test("filterGroupsForMode splits people, help and records", () => {
  const groups = [{ source: "contacts" }, { source: "help" }, { source: "inventory" }];
  assert.deepEqual(filterGroupsForMode(groups, "people").map((g) => g.source), ["contacts"]);
  assert.deepEqual(filterGroupsForMode(groups, "help").map((g) => g.source), ["help"]);
  assert.deepEqual(filterGroupsForMode(groups, "records").map((g) => g.source), ["inventory"]);
  assert.equal(filterGroupsForMode(groups, null).length, 3);
});

test("a clear module-name hit outranks matching records", () => {
  const { sections } = buildCommandItems({ availableModules: modules, query: "inv", searchGroups: [recordGroup] });
  assert.equal(sections[0].id, "modules");
});

test("a record-only query keeps records first", () => {
  const { sections } = buildCommandItems({ availableModules: modules, query: "2026", searchGroups: [recordGroup] });
  assert.equal(sections[0].id, "search:inventory");
});

test("modules mode shows only modules; initials reach a module", () => {
  const only = buildCommandItems({ availableModules: modules, query: "", mode: "modules" });
  assert.deepEqual(only.sections.map((s) => s.id), ["modules"]);
  assert.equal(initialsOf("Control de Compras"), "cdc");
  const byInitials = buildCommandItems({ availableModules: modules, query: "cdc" });
  assert.equal(byInitials.flat[0].title, "Control de Compras");
});

test("recents show on an empty query only, newest first and deduped", () => {
  const a = toRecent({ target: "/a", title: "A" });
  const b = toRecent({ target: "/b", title: "B" });
  const list = pushRecent(pushRecent(pushRecent([], a), b), a);
  assert.deepEqual(list.map((r) => r.target), ["/a", "/b"]);
  assert.equal(toRecent({ kind: "widen", target: "/x", title: "x" }), null);
  const empty = buildCommandItems({ availableModules: modules, query: "", recents: list });
  assert.equal(empty.sections[0].id, "recent");
  const typed = buildCommandItems({ availableModules: modules, query: "inv", recents: list });
  assert.ok(!typed.sections.some((s) => s.id === "recent"));
});
