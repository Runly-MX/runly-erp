import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestionsFor } from "../argSuggestions.js";

// Data of "Se creó un artículo de inventario" plus the outputs of an earlier block.
const fields = [
  { value: "id", label: "Identificador", type: "id" },
  { value: "name", label: "Nombre", type: "text" },
  { value: "assetTag", label: "Número de activo", type: "text" },
  { value: "categoryId", label: "Tipo", type: "id" },
  { value: "assigneeId", label: "Responsable", type: "person" },
  { value: "dueDate", label: "Vence", type: "date" },
  { value: "total", label: "Total", type: "number" },
  { value: "paso1_link", label: "Enlace" },
  { value: "paso1_email", label: "Correo" },
];
const keys = (name, spec) => suggestionsFor(name, spec, fields).map((option) => option.value);

test("texts never offer raw ids; titles skip links, messages take them", () => {
  assert.deepEqual(keys("title", { type: "string" }), ["name", "assetTag", "dueDate", "total", "paso1_email"]);
  assert.ok(keys("body", { type: "text" }).includes("paso1_link"));
  assert.ok(!keys("body", { type: "text" }).some((key) => ["id", "categoryId", "assigneeId"].includes(key)));
});

test("typed arguments only get matching data, the namesake first", () => {
  assert.deepEqual(keys("dueDate", { type: "date" }), ["dueDate"]);
  assert.deepEqual(keys("to", { type: "email" }), ["paso1_email"]);
  assert.deepEqual(keys("assigneeId", { type: "uuid" }), ["assigneeId", "id", "categoryId"]);
});

test("a chat channel is never suggested from unrelated data", () => {
  assert.deepEqual(keys("channel", { type: "string" }), []);
});
