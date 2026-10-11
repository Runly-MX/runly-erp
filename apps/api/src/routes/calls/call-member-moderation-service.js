import { RoomServiceClient } from "livekit-server-sdk";
import { readLiveKitConfig, CallServiceError } from "./call-service.js";

// Host moderation of internal members in a live call (the people panel):
// mute someone's microphone, or take them out of the call. Guests have their
// own equivalents in call-guest-service.js. Same manage gate as guests: the
// call initiator, or a member with channel.manage / a system role.
export function createCallMemberModerationService({
  prisma,
  callService,
  env = process.env,
  RoomServiceClientImpl = RoomServiceClient,
  now = () => new Date(),
}) {
  function rooms() {
    const config = readLiveKitConfig(env);
    if (!config.enabled) throw new CallServiceError("Las llamadas no están disponibles.", 501);
    return new RoomServiceClientImpl(config.internalUrl, config.apiKey, config.apiSecret);
  }

  async function loadManagedCall({ profileId, callId, targetId, action }) {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { id: true, status: true, conversationId: true, initiatedByUserId: true, livekitRoomName: true },
    });
    if (!call) throw new CallServiceError("Llamada no encontrada.", 404);
    if (call.status === "ENDED") throw new CallServiceError("Esta llamada ya termino.", 409);
    await callService.assertCanManageCall({
      conversationId: call.conversationId,
      initiatedByUserId: call.initiatedByUserId,
      profileId,
      action,
    });
    if (targetId === profileId) throw new CallServiceError("No puedes hacer esto contigo.", 422);
    const participant = await prisma.callParticipant.findFirst({
      where: { callId, userId: targetId },
      select: { id: true, status: true, livekitIdentity: true },
    });
    if (!participant) throw new CallServiceError("Esa persona no está en la llamada.", 404);
    return { call, participant };
  }

  // Server-side mute of the target's microphone track(s). Like Meet/Teams,
  // the host can mute but never unmute someone else.
  async function muteMember({ profileId, callId, targetId }) {
    const { call, participant } = await loadManagedCall({ profileId, callId, targetId, action: "silenciar participantes" });
    const identity = participant.livekitIdentity ?? targetId;
    let liveActionOk = false;
    for (let attempt = 0; attempt < 2 && !liveActionOk; attempt += 1) {
      try {
        const client = rooms();
        const live = await client.listParticipants(call.livekitRoomName);
        const target = live.find((p) => p.identity === identity);
        const audioTracks = (target?.tracks ?? []).filter((t) => t.type === 1 /* AUDIO */ || t.source === 2 /* MICROPHONE */);
        for (const track of audioTracks) {
          if (!track.muted) await client.mutePublishedTrack(call.livekitRoomName, identity, track.sid, true);
        }
        liveActionOk = true;
      } catch { /* retry once, then report */ }
    }
    return { ok: true, liveActionOk };
  }

  // Take a member out of the call: status REMOVED (joinCall refuses them for
  // this call) and their LiveKit connections (camera + native screen share)
  // are dropped. The call initiator cannot be removed.
  async function removeMember({ profileId, callId, targetId }) {
    const { call, participant } = await loadManagedCall({ profileId, callId, targetId, action: "quitar participantes" });
    if (targetId === call.initiatedByUserId) {
      throw new CallServiceError("No puedes quitar a quien inició la llamada.", 422);
    }
    await prisma.callParticipant.update({
      where: { id: participant.id },
      data: { status: "REMOVED", leftAt: now(), ringStartedAt: null },
    });
    const identity = participant.livekitIdentity ?? targetId;
    let liveActionOk = true;
    for (const id of [identity, `screen:${identity}`]) {
      try {
        await rooms().removeParticipant(call.livekitRoomName, id);
      } catch (error) {
        if (error?.status !== 404 && error?.code !== "not_found" && id === identity) liveActionOk = false;
      }
    }
    return { ok: true, liveActionOk };
  }

  return { muteMember, removeMember };
}
