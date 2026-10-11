import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCallMemberModerationService } from "../call-member-moderation-service.js";

const CALL = "11111111-1111-4111-8111-111111111111";
const HOST = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";
const env = { LIVEKIT_MODE: "embedded", LIVEKIT_URL: "wss://x", LIVEKIT_INTERNAL_URL: "http://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" };

function setup({ manageOk = true, participant = { id: "p1", status: "JOINED", livekitIdentity: MEMBER } } = {}) {
  const updates = [];
  const removed = [];
  const muted = [];
  const prisma = {
    call: { findUnique: async () => ({ id: CALL, status: "ACTIVE", conversationId: "conv", initiatedByUserId: HOST, livekitRoomName: "room" }) },
    callParticipant: {
      findFirst: async () => participant,
      update: async (args) => { updates.push(args); return {}; },
    },
  };
  const callService = {
    assertCanManageCall: async () => { if (!manageOk) throw Object.assign(new Error("No"), { status: 403 }); },
  };
  class FakeRooms {
    async listParticipants() { return [{ identity: MEMBER, tracks: [{ sid: "TR_a", type: 1, muted: false }, { sid: "TR_v", type: 2 }] }]; }
    async mutePublishedTrack(room, identity, sid, value) { muted.push({ identity, sid, value }); }
    async removeParticipant(room, identity) { removed.push(identity); }
  }
  const svc = createCallMemberModerationService({ prisma, callService, env, RoomServiceClientImpl: FakeRooms });
  return { svc, updates, removed, muted };
}

describe("call member moderation", () => {
  it("mutes only the target's audio track", async () => {
    const { svc, muted } = setup();
    const out = await svc.muteMember({ profileId: HOST, callId: CALL, targetId: MEMBER });
    assert.equal(out.liveActionOk, true);
    assert.deepEqual(muted, [{ identity: MEMBER, sid: "TR_a", value: true }]);
  });

  it("removes a member: REMOVED status and drops camera + screen connections", async () => {
    const { svc, updates, removed } = setup();
    await svc.removeMember({ profileId: HOST, callId: CALL, targetId: MEMBER });
    assert.equal(updates[0].data.status, "REMOVED");
    assert.deepEqual(removed, [MEMBER, `screen:${MEMBER}`]);
  });

  it("refuses to remove the call initiator", async () => {
    const { svc } = setup();
    await assert.rejects(svc.removeMember({ profileId: MEMBER, callId: CALL, targetId: HOST }), (e) => e.status === 422);
  });

  it("propagates the manage gate", async () => {
    const { svc } = setup({ manageOk: false });
    await assert.rejects(svc.muteMember({ profileId: MEMBER, callId: CALL, targetId: HOST }), (e) => e.status === 403);
  });
});
