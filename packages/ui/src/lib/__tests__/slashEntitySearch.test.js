import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlashContext, slashSourceRows } from "../slashEntitySearch.js";
import { parseEntityTokens, stripEntityTokens } from "../entityTokenParse.js";

const SOURCES = [
  { key: "inventory_item", label: "Inventario", aliases: ["inventario", "inventarios", "inv"] },
  { key: "contact", label: "Contactos", aliases: ["contactos"] },
];

test("a bare slash opens the module list, filtered by alias prefix", () => {
  assert.deepEqual(parseSlashContext("hola /", SOURCES), { phase: "source", query: "", start: 5 });
  assert.equal(parseSlashContext("hola /inv", SOURCES).phase, "source");
  assert.deepEqual(slashSourceRows(SOURCES, "inv").map((r) => r.id), ["source:inventory_item"]);
  assert.equal(slashSourceRows(SOURCES, "").length, 2);
});

test("module:query and module query both start a search, accents ignored", () => {
  const colon = parseSlashContext("/inventarios:SN12", SOURCES);
  assert.equal(colon.phase, "search");
  assert.equal(colon.source.key, "inventory_item");
  assert.equal(colon.query, "SN12");
  assert.equal(parseSlashContext("/inventario laptop dell", SOURCES).query, "laptop dell");
  assert.equal(parseSlashContext("/INVENTARIÓS:x", SOURCES).source.key, "inventory_item");
});

test("slashes inside words or URLs never trigger", () => {
  assert.equal(parseSlashContext("y/o", SOURCES), null);
  assert.equal(parseSlashContext("https://runly.mx", SOURCES), null);
  assert.equal(parseSlashContext("/nada:algo", SOURCES), null);
});

test("entity tokens parse and strip to the display name", () => {
  const body = "mira #[inventory_item:0190a1b2-0000-7000-8000-000000000001:Laptop Dell] ok";
  assert.deepEqual(parseEntityTokens(body), [{ entityType: "inventory_item", recordId: "0190a1b2-0000-7000-8000-000000000001", name: "Laptop Dell" }]);
  assert.equal(stripEntityTokens(body), "mira Laptop Dell ok");
});

test("commands are offered only at the start of the message and never open a record search", () => {
  const withCommand = [...SOURCES, { key: "cmd_estado", label: "Estado", aliases: ["estado"], command: true, description: "Cambia tu estado" }];
  assert.deepEqual(slashSourceRows(withCommand, "es", true).map((r) => r.id), ["source:cmd_estado"]);
  assert.equal(slashSourceRows(withCommand, "es", true)[0].description, "Cambia tu estado");
  assert.equal(slashSourceRows(withCommand, "es", false).length, 0);
  assert.equal(slashSourceRows(withCommand, "", false).length, 2);
  assert.equal(parseSlashContext("/estado en reunión", withCommand), null);
  assert.equal(parseSlashContext("/estado", withCommand).phase, "source");
});
