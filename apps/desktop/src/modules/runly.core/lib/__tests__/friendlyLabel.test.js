import test from "node:test";
import assert from "node:assert/strict";
import { friendlyLabel, pickerOptions } from "../flowModel.js";

test("friendlyLabel turns technical keys into names", () => {
  assert.equal(friendlyLabel("modelId"), "Modelo");
  assert.equal(friendlyLabel("created_at"), "Creado");
  assert.equal(friendlyLabel("plate"), "Placa");
  assert.equal(friendlyLabel("id"), "Id");
});

test("pickerOptions keeps the technical key visible and searchable", () => {
  const [option] = pickerOptions([{ value: "modelId", label: "Modelo", description: "Modelo del vehículo" }]);
  assert.equal(option.hint, "modelId");
  assert.match(option.keywords, /modelId/);
  assert.equal(pickerOptions([{ value: "paso1_id", label: "Identificador" }])[0].keywords, "id");
});
