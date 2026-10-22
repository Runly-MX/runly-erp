import test from "node:test";
import assert from "node:assert/strict";
import { buildInlineCreatePrefill } from "../runly-form-utils.js";

const descriptor = (create) => ({ create: { prefillFromSearch: true, ...create } });

test("prefillSplit spreads the typed text over first and rest fields", () => {
  const out = buildInlineCreatePrefill({
    nestedBlueprint: { schema: { sections: [] } },
    searchText: "  Juan Perez Lopez ",
    descriptor: descriptor({ prefillSplit: ["first_name", "last_name"] }),
  });
  assert.deepEqual(out, { first_name: "Juan", last_name: "Perez Lopez" });
});

test("prefillSplit with a single word only fills the first field", () => {
  const out = buildInlineCreatePrefill({
    nestedBlueprint: { schema: { sections: [] } },
    searchText: "Juan",
    descriptor: descriptor({ prefillSplit: ["first_name", "last_name"] }),
  });
  assert.deepEqual(out, { first_name: "Juan" });
});

test("no prefill without prefillFromSearch or text", () => {
  assert.deepEqual(buildInlineCreatePrefill({ nestedBlueprint: {}, searchText: "x", descriptor: { create: {} } }), {});
  assert.deepEqual(buildInlineCreatePrefill({ nestedBlueprint: {}, searchText: " ", descriptor: descriptor({}) }), {});
});
