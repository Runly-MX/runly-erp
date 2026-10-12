import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimCallForDevice,
  getClaimedCallId,
  getRememberedMeetingMode,
  releaseCallForDevice,
  rememberCallMeetingMode,
  shouldResumeCallOnDevice,
} from "../callDeviceSession.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

describe("call device session", () => {
  it("resumes a joined call only in the browser session that claimed it", () => {
    const ipad = createStorage();
    const laptop = createStorage();

    claimCallForDevice("call-1", ipad);

    assert.equal(shouldResumeCallOnDevice("call-1", "JOINED", ipad), true);
    assert.equal(shouldResumeCallOnDevice("call-1", "JOINED", laptop), false);
    assert.equal(shouldResumeCallOnDevice("call-1", "RINGING", ipad), false);
  });

  it("does not release a newer call claim when cleaning up an older call", () => {
    const storage = createStorage();
    claimCallForDevice("call-new", storage);

    assert.equal(releaseCallForDevice("call-old", storage), false);
    assert.equal(getClaimedCallId(storage), "call-new");
    assert.equal(releaseCallForDevice("call-new", storage), true);
    assert.equal(getClaimedCallId(storage), null);
  });

  it("remembers the meeting mode of the claimed call until it is released", () => {
    const storage = createStorage();
    claimCallForDevice("call-1", storage);
    rememberCallMeetingMode("call-1", "inperson", storage);

    assert.equal(getRememberedMeetingMode("call-1", storage), "inperson");
    assert.equal(getRememberedMeetingMode("call-2", storage), null);
    releaseCallForDevice("call-1", storage);
    assert.equal(getRememberedMeetingMode("call-1", storage), null);
  });
});
