import test from "node:test";
import assert from "node:assert/strict";
import { rowOpenProps } from "../row-open.js";

test("rowOpenProps is empty without a handler", () => {
  assert.deepEqual(rowOpenProps(null, {}), {});
});

test("Enter on the row itself opens it; Enter from a child does not", () => {
  const opened = [];
  const props = rowOpenProps((row) => opened.push(row.id), { id: "a" });
  const row = {};
  props.onKeyDown({ key: "Enter", target: row, currentTarget: row, preventDefault() {} });
  props.onKeyDown({ key: "Enter", target: {}, currentTarget: row, preventDefault() {} });
  assert.deepEqual(opened, ["a"]);
});
