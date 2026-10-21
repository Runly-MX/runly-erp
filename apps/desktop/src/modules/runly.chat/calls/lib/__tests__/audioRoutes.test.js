import test from "node:test";
import assert from "node:assert/strict";
import { defaultRouteId, nonSpeakerRouteId } from "../audioRoutes.js";

const routes = (...ids) => ids.map((id) => ({ id }));

test("defaultRouteId prefers connected headsets, then speaker for video, earpiece for voice", () => {
  assert.equal(defaultRouteId(routes("earpiece", "speaker", "bluetooth"), true), "bluetooth");
  assert.equal(defaultRouteId(routes("earpiece", "speaker", "wired"), false), "wired");
  assert.equal(defaultRouteId(routes("earpiece", "speaker"), true), "speaker");
  assert.equal(defaultRouteId(routes("earpiece", "speaker"), false), "earpiece");
  assert.equal(defaultRouteId(routes("speaker"), false), "speaker");
});

test("nonSpeakerRouteId falls back from bluetooth to wired to earpiece", () => {
  assert.equal(nonSpeakerRouteId(routes("speaker", "earpiece", "bluetooth")), "bluetooth");
  assert.equal(nonSpeakerRouteId(routes("speaker", "earpiece")), "earpiece");
  assert.equal(nonSpeakerRouteId(routes("speaker")), null);
});
