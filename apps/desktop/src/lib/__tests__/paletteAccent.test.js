import { test } from "node:test";
import assert from "node:assert/strict";
import { glassTileStyle, itemAccent } from "../paletteAccent.js";
import { buildCommandItems, mapSearchGroups } from "../commandPalette.js";
import { buildPaletteCommands } from "../paletteCommands.js";

test("every kind of row gets an accent color", () => {
  assert.equal(itemAccent({ kind: "module", color: "#10b981" }), "#10b981");
  assert.equal(itemAccent({ kind: "widen" }), "#7c3aed");
  assert.equal(itemAccent({ kind: "suggestion" }), "#f59e0b");
  assert.equal(itemAccent({ kind: "record", source: "help" }), "#0ea5e9");
  assert.equal(itemAccent({ kind: "page", key: "page:profile" }), "#ec4899");
  assert.ok(itemAccent({ kind: "record" }));
  assert.ok(buildPaletteCommands({ miraiAvailable: true, chatAvailable: true, fullscreenEnabled: true }).every((c) => itemAccent(c) !== "#7c3aed" || c.color === "#8b5cf6" || c.color));
});

test("glass tile tints the accent", () => {
  const style = glassTileStyle("#3b82f6");
  assert.match(style.background, /#3b82f6/);
  assert.equal(style.color, "#3b82f6");
});

test("records take the module color and keep the asset number badge", () => {
  const groups = [{ source: "inventory", moduleKey: "runly.inventory", label: "Inventario", total: 1, seeAllTarget: "/x", items: [
    { id: "1", title: "Laptop", subtitle: "Serie A1", icon: "Boxes", target: "/t", badge: "# AF-0042", badgeLabel: "Número de activo" },
    { id: "2", title: "Mouse", subtitle: null, icon: "Boxes", target: "/t2" }] }];
  const [section] = mapSearchGroups(groups, { "runly.inventory": "#f97316" });
  assert.equal(section.items[0].color, "#f97316");
  assert.equal(section.items[0].badge, "# AF-0042");
  assert.equal(section.items[0].badgeLabel, "Número de activo");
  assert.equal(section.items[1].badge, undefined);
  const built = buildCommandItems({ availableModules: [{ key: "runly.inventory", name: "Inventario", color: "#f97316", navigation: [] }], searchGroups: groups, query: "laptop" });
  assert.equal(built.flat.find((i) => i.kind === "record").color, "#f97316");
});
