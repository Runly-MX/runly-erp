import test from "node:test";
import assert from "node:assert/strict";
import { saveBarFloating } from "../form-save-dock.js";

test("save pill floats only with pending changes and the form end off screen", () => {
  assert.equal(saveBarFloating({ dirty: false, endVisible: false }), false);
  assert.equal(saveBarFloating({ dirty: true, endVisible: false }), true);
  assert.equal(saveBarFloating({ dirty: true, endVisible: true }), false);
  assert.equal(saveBarFloating({ submitting: true }), true);
  assert.equal(saveBarFloating({ forceVisible: true, endVisible: true }), false);
});
