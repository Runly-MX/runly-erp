import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { buildCallSystemMessage } from "./call-system-messages.js";
import { createCallScreenShareService } from './call-screen-share-service.js';
import { createCallInviteService } from "./call-invite-service.js";
import { LIVE_CALL_STATUSES, RING_TIMEOUT_MS } from "./call-constants.js";

function isLiveCallConflict(error) {
  return error?.code === "P2002"
    || error?.meta?.code === "23505"
    || String(error?.message ?? "").includes("call_one_live_per_conversation_idx");
}

export class CallServiceError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = "CallServiceError";
    this.status = status;
    this.details = details;
  }
}

export function readLiveKitConfig(env = process.env) {
  const requestedMode = String(env.LIVEKIT_MODE ?? "embedded").trim().toLowerCase();
  const mode = ["embedded", "external", "disabled"].includes(requestedMode)
    ? requestedMode
    : "disabled";
  const publicUrl = String(env.LIVEKIT_URL ?? "").trim();
  const internalUrl = String(env.LIVEKIT_INTERNAL_URL ?? publicUrl).trim();
  const apiKey = String(env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET ?? "").trim();
  const enabled = mode !== "disabled" && Boolean(publicUrl && internalUrl && apiKey && apiSecret);

  return { mode, enabled, publicUrl, internalUrl, apiKey, apiSecret };
}

export function createCallService({
  prisma,
  env = process.env,
  AccessTokenImpl = AccessToken,
  RoomServiceClientImpl = RoomServiceClient,
  notificationService = null,
  broadcaster = null,
  deliveryWorker = null,
  now = () => new Date(),
}) {
  function getConfig() {
    return readLiveKitConfig(env);
  }
  const { inviteMembersToLiveCall } = createCallInviteService({ prisma, notificationService, broadcaster, deliveryWorker, now });

  function assertEnabled() {
    const config = getConfig();
    if (!config.enabled) {
      throw new CallServiceError("Las llamadas no estan configuradas en esta instancia.", 501);
    }
    return config;
  }

  async function resolveProfile(authUserId) {
    const profile = await prisma.userProfile.findUnique({
      where: { authUserId, enabled: true },
      select: { id: true, displayName: true, avatarFileId: true },
    });
    if (!profile) throw new CallServiceError("Perfil de usuario no encontrado.", 404);
    return profile;
  }

  async function listConversationMembers(conversationId) {
    return prisma.$queryRaw`
      SELECT m.user_id AS "userId", up.display_name AS "displayName"
      FROM chat_conversation_members m
      JOIN user_profile up ON up.id = m.user_id
      JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ${conversationId}
        AND m.user_id IS NOT NULL
        AND m.left_at IS NULL
        AND public.runly_chat_user_access(m.conversation_id, m.user_id)
        AND c.deleted_at IS NULL
    `;
  }

  async function postSystemMessage(conversationId, { body, metadata }) {
    try {
      const rows = await prisma.$queryRaw`
        INSERT INTO chat_messages (conversation_id, sender_type, body, message_type, metadata)
        VALUES (${conversationId}, 'system', ${body}, 'system', ${JSON.stringify(metadata)}::jsonb)
        RETURNING id, created_at
      `;
      const messageId = rows?.[0]?.id ?? null;
      const createdAt = rows?.[0]?.created_at ?? now();
      if (!messageId) return;
      await prisma.$executeRaw`
        UPDATE chat_conversations
        SET last_message_id = ${messageId}, last_message_at = ${createdAt}, updated_at = NOW()
        WHERE id = ${conversationId}
      `;
      const members = await listConversationMembers(conversationId);
      const memberIds = members.map((member) => member.userId).filter(Boolean);
      if (memberIds.length) {
        await broadcaster?.broadcastToUsers?.(memberIds, "chat.message.new", {
          conversationId,
          messageId,
          senderId: null,
          senderName: null,
          threadRootId: null,
          replyToMessageId: null,
        });
      }
    } catch (error) {
      console.warn(
        "[atlas.calls] No se pudo publicar el mensaje de sistema:",
        error?.message ?? error,
      );
    }
  }

  async function postCallSystemMessage(call, spec) {
    const { body, metadata } = buildCallSystemMessage(spec);
    await postSystemMessage(call.conversationId, { body, metadata: { call: { ...metadata.call, callId: call.id } } });
  }

  async function assertMembership(conversationId, userProfileId) {
    const rows = await prisma.$queryRaw`
      SELECT m.id
      FROM chat_conversation_members m
      JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ${conversationId}
        AND m.user_id = ${userProfileId}
        AND m.left_at IS NULL
        AND public.runly_chat_user_access(m.conversation_id, m.user_id)
        AND c.deleted_at IS NULL
      LIMIT 1
    `;
    if (!rows.length) throw new CallServiceError("Conversacion no encontrada.", 404);
  }

  async function assertCalendarLink(calendarEventId, conversationId) {
    if (!calendarEventId) return;
    const event = await prisma.calendarEvent.findFirst({
      where: {
        id: calendarEventId,
        enabled: true,
        sourceModule: "runly.chat",
        sourceEntityId: conversationId,
      },
      select: { id: true },
    });
    if (!event) {
      throw new CallServiceError("La reunion no esta vinculada a esta conversacion.", 422);
    }
  }

  async function getCallRecord(callId) {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        initiator: { select: { id: true, displayName: true } },
        calendarEvent: { select: { id: true, title: true } },
        participants: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, displayName: true, avatarFileId: true } },
          },
        },
      },
    });
    if (!call) throw new CallServiceError("Llamada no encontrada.", 404);
    return call;
  }

  async function assertCallAccess(call, profileId) {
    await assertMembership(call.conversationId, profileId);
    const participant = call.participants.find((entry) => entry.userId === profileId);
    if (!participant) throw new CallServiceError("No formas parte de esta llamada.", 403);
    return participant;
  }

  // Shared "may this user manage the call?" gate: the initiator, or a member
  // holding `channel.manage` (or a system role) on the conversation. Reused by
  // the guest-link and guest-moderation services.
  async function assertCanManageCall({ conversationId, initiatedByUserId, profileId, action = "gestionar esta llamada" }) {
    if (profileId && profileId === initiatedByUserId) return;
    const roleRows = await prisma.$queryRaw`
      SELECT r.is_system AS "isSystem", r.permissions
      FROM chat_conversation_members m
      JOIN chat_channel_roles r ON r.id = m.role_id
      WHERE m.conversation_id = ${conversationId}
        AND m.user_id = ${profileId}
        AND m.left_at IS NULL
        AND public.runly_chat_user_access(m.conversation_id, m.user_id)
      LIMIT 1
    `;
    const role = roleRows[0];
    if (!role?.isSystem && role?.permissions?.["channel.manage"] !== true) {
      throw new CallServiceError(`No tienes permiso para ${action}.`, 403);
    }
  }

  async function createToken(config, call, profile) {
    const token = new AccessTokenImpl(config.apiKey, config.apiSecret, {
      identity: profile.id,
      name: profile.displayName,
      metadata: JSON.stringify({ callId: call.id }),
      ttl: "1m",
    });
    token.addGrant({
      room: call.livekitRoomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return token.toJwt();
  }

  async function closeLiveKitRoom(call) {
    const config = getConfig();
    if (!config.enabled) return;
    try {
      const client = new RoomServiceClientImpl(
        config.internalUrl,
        config.apiKey,
        config.apiSecret,
      );
      await client.deleteRoom(call.livekitRoomName);
    } catch (error) {
      console.warn("[atlas.calls] No se pudo cerrar la sala LiveKit:", error?.message ?? error);
    }
  }

  // Rings sent from inside an already-ACTIVE meeting expire per person: the
  // participant goes MISSED (their device stops ringing via the participant
  // realtime feed) but can still join the meeting later.
  async function expireStaleRings(cutoff) {
    await prisma.callParticipant.updateMany({
      where: { status: "RINGING", ringStartedAt: { lte: cutoff }, call: { status: "ACTIVE" } },
      data: { status: "MISSED", ringStartedAt: null },
    });
  }

  async function expireStaleCalls() {
    const cutoff = new Date(now().getTime() - RING_TIMEOUT_MS);
    await expireStaleRings(cutoff).catch((error) => {
      console.warn("[atlas.calls] No se pudieron expirar los timbres:", error?.message ?? error);
    });
    const stale = await prisma.call.findMany({
      where: { status: "RINGING", createdAt: { lte: cutoff } },
      select: { id: true, livekitRoomName: true, conversationId: true, kind: true, startedAt: true },
    });
    if (!stale.length) return 0;
    const ids = stale.map((call) => call.id);
    await prisma.$transaction([
      prisma.callParticipant.updateMany({
        where: { callId: { in: ids }, status: "RINGING" },
        data: { status: "MISSED", leftAt: now() },
      }),
      prisma.callParticipant.updateMany({
        where: { callId: { in: ids }, status: "JOINED" },
        data: { status: "LEFT", leftAt: now() },
      }),
      prisma.call.updateMany({
        where: { id: { in: ids }, status: "RINGING" },
        data: { status: "ENDED", endedAt: now(), endReason: "missed" },
      }),
    ]);
    await Promise.all(stale.map(closeLiveKitRoom));
    await Promise.all(stale.map((call) =>
      postCallSystemMessage(call, { event: "ended", kind: call.kind, endReason: "missed" }),
    ));
    return stale.length;
  }

  async function getConfigStatus() {
    const config = getConfig();
    return { enabled: config.enabled, mode: config.mode };
  }

  function queueBusyCallNotification({ profile, conversationId, kind, recipientIds }) {
    if (!notificationService?.publish || !recipientIds?.length) return;
    setImmediate(async () => {
      try {
        // The conversation's own company, not re-derived from profile's
        // memberships — see call-links-service.js's sendInvites for why.
        const [conversationRow] = await prisma.$queryRaw`
          SELECT company_id AS "companyId" FROM chat_conversations WHERE id = ${conversationId} LIMIT 1
        `;
        const companyId = conversationRow?.companyId ?? null;
        if (!companyId) return;
        await notificationService.publish({
          companyId,
          actorId: profile.id,
          input: {
            eventType: "chat.call.busy_attempt",
            title: "Llamada mientras estabas ocupado",
            body: `${profile.displayName || "Alguien"} intento iniciar una ${kind === "VIDEO" ? "videollamada" : "llamada"}.`,
            link: `/app/m/runly.chat/chat/inbox/${conversationId}`,
            recipients: { userIds: recipientIds },
            channels: ["in_app"],
            priority: "medium",
            sourceType: "chat_conversation",
            sourceId: conversationId,
            dedupeKey: `chat.call.busy_attempt:${conversationId}:${profile.id}`,
          },
        });
      } catch (error) {
        console.warn("[atlas.calls] No se pudo publicar el aviso de usuario ocupado:", error?.message ?? error);
      }
    });
  }

  // Quiet counterpart of the incoming-call alert: a normal-priority in-app
  // notice + realtime nudge so members can join, without any ringing.
  function notifyMeetingStarted({ call, profile, recipientIds, payload }) {
    if (!recipientIds.length) return;
    broadcaster?.broadcastToUsers?.(recipientIds, "chat.call.meeting_started", payload).catch(() => {});
    if (!notificationService?.publish) return;
    setImmediate(async () => {
      try {
        const [conversationRow] = await prisma.$queryRaw`
          SELECT company_id AS "companyId" FROM chat_conversations WHERE id = ${call.conversationId} LIMIT 1
        `;
        const companyId = conversationRow?.companyId ?? null;
        if (!companyId) return;
        await notificationService.publish({
          companyId,
          actorId: profile.id,
          input: {
            eventType: "chat.call.meeting_started",
            title: `${profile.displayName || "Alguien"} inició una reunión`,
            body: "Toca para unirte.",
            link: `/app/m/runly.chat/chat/inbox/${call.conversationId}`,
            recipients: { userIds: recipientIds },
            channels: ["in_app"],
            priority: "normal",
            sourceType: "call",
            sourceId: call.id,
            metadata: payload,
            dedupeKey: `chat.call.meeting_started:${call.id}`,
          },
        });
      } catch (error) {
        console.warn("[atlas.calls] No se pudo avisar del inicio de la reunión:", error?.message ?? error);
      }
    });
  }

  // ring=false starts a meeting: ACTIVE right away with only the host, other
  // members INVITED (not rung) and told "X inició una reunión" instead.
  async function createCall({ authUserId, conversationId, kind, calendarEventId = null, ring = true }) {
    const config = assertEnabled();
    await expireStaleCalls();
    const profile = await resolveProfile(authUserId);
    const members = await listConversationMembers(conversationId);
    if (!members.some((member) => member.userId === profile.id)) {
      throw new CallServiceError("Conversacion no encontrada.", 404);
    }
    // A "meeting room" — a conversation with a live guest link — can start a
    // call with just the host; external guests join later via the link.
    const meetingLink = await prisma.callLink.findFirst({
      where: { conversationId, revokedAt: null },
      select: { id: true },
    });
    const isMeetingRoom = Boolean(meetingLink) || !ring;
    if (members.length < 2 && !isMeetingRoom) {
      throw new CallServiceError("No hay otra persona disponible en esta conversacion.", 422);
    }
    const memberIds = [];
    const candidateRecipientIds = [];
    for (const member of members) {
      memberIds.push(member.userId);
      if (member.userId !== profile.id) candidateRecipientIds.push(member.userId);
    }
    const candidateRecipientSet = new Set(candidateRecipientIds);
    await assertCalendarLink(calendarEventId, conversationId);

    const existing = await prisma.call.findFirst({
      where: { conversationId, status: { in: LIVE_CALL_STATUSES } },
      select: { id: true },
    });
    if (existing) {
      throw new CallServiceError("Ya hay una llamada en curso en esta conversacion.", 409, {
        callId: existing.id,
      });
    }

    let created;
    let invitedMembers = members;
    let busyRecipientIds = [];
    try {
      created = await prisma.$transaction(async (tx) => {
        // Serialize call creation for the same users. Locking in UUID order
        // avoids deadlocks when two people call each other simultaneously.
        await tx.$queryRaw`
          SELECT id
          FROM user_profile
          WHERE id = ANY(${memberIds}::uuid[])
          ORDER BY id
          FOR UPDATE
        `;
        const busyRows = await tx.$queryRaw`
          SELECT DISTINCT ON (cp.user_id)
                 cp.user_id AS "userId", cp.call_id AS "callId"
          FROM call_participant cp
          JOIN "call" c ON c.id = cp.call_id
          WHERE cp.user_id = ANY(${memberIds}::uuid[])
            AND cp.status IN ('RINGING', 'JOINED')
            AND c.status IN ('RINGING', 'ACTIVE')
          ORDER BY cp.user_id, c.created_at DESC
        `;
        const callerBusy = busyRows.find((row) => row.userId === profile.id);
        if (callerBusy) {
          throw new CallServiceError("Ya tienes una llamada en curso.", 409, {
            code: "caller_busy",
            callId: callerBusy.callId,
          });
        }

        const busySet = new Set();
        for (const row of busyRows) {
          if (candidateRecipientSet.has(row.userId)) busySet.add(row.userId);
        }
        busyRecipientIds = [...busySet];
        invitedMembers = members.filter(
          (member) => member.userId === profile.id || !busySet.has(member.userId),
        );
        if (invitedMembers.length < 2 && !isMeetingRoom) {
          throw new CallServiceError("El usuario ya esta en otra llamada.", 409, {
            code: "recipient_busy",
            busyUserIds: busyRecipientIds,
          });
        }

        // A meeting-room call starts ACTIVE (host alone, guests join via link);
        // a normal call starts RINGING until someone answers.
        const soloRoom = !ring || (isMeetingRoom && invitedMembers.length < 2);
        const initialStatus = soloRoom ? "ACTIVE" : "RINGING";
        const startedAt = soloRoom ? now() : null;
        const rows = await tx.$queryRaw`
          WITH generated AS (SELECT uuidv7() AS id)
          INSERT INTO "call" (
            id, conversation_id, calendar_event_id, kind, status,
            initiated_by_user_id, livekit_room_name, created_at, started_at
          )
          SELECT id, ${conversationId}, ${calendarEventId}, ${kind}::"CallKind", ${initialStatus}::"CallStatus",
                 ${profile.id}, 'call_' || id::text, NOW(), ${startedAt}
          FROM generated
          RETURNING id
        `;
        const callId = rows[0].id;
        await tx.callParticipant.createMany({
          data: invitedMembers.map((member) => {
            const isHost = member.userId === profile.id;
            const status = isHost ? "JOINED" : ring ? "RINGING" : "INVITED";
            return {
              callId,
              userId: member.userId,
              status,
              livekitIdentity: member.userId,
              ringStartedAt: status === "RINGING" ? now() : null,
              joinedAt: isHost ? now() : null,
            };
          }),
        });
        return tx.call.findUnique({ where: { id: callId } });
      });
    } catch (error) {
      if (isLiveCallConflict(error)) {
        const active = await prisma.call.findFirst({
          where: { conversationId, status: { in: LIVE_CALL_STATUSES } },
          select: { id: true },
        });
        throw new CallServiceError("Ya hay una llamada en curso en esta conversacion.", 409, {
          callId: active?.id ?? null,
        });
      }
      if (error instanceof CallServiceError && error.details?.code === "recipient_busy") {
        queueBusyCallNotification({
          profile,
          conversationId,
          kind,
          recipientIds: busyRecipientIds,
        });
      }
      throw error;
    }

    const call = await getCallRecord(created.id);
    // A solo meeting-room call starts ACTIVE, so joinCall never fires the
    // RINGING->ACTIVE "iniciada" system message — post it here.
    if (call.status === "ACTIVE") {
      await postCallSystemMessage(call, { event: "started", kind: call.kind });
    }
    const recipientIds = [];
    for (const member of invitedMembers) {
      if (member.userId !== profile.id) recipientIds.push(member.userId);
    }
    if (busyRecipientIds.length) {
      queueBusyCallNotification({
        profile,
        conversationId,
        kind,
        recipientIds: busyRecipientIds,
      });
    }
    const incomingPayload = {
      callId: call.id,
      conversationId,
      kind,
      initiatorId: profile.id,
      initiatorName: profile.displayName,
    };
    if (!ring) {
      notifyMeetingStarted({ call, profile, recipientIds, payload: incomingPayload });
      return {
        callId: call.id,
        call,
        livekitUrl: config.publicUrl,
        token: await createToken(config, call, profile),
      };
    }
    await broadcaster?.broadcastToUsers?.(
      recipientIds,
      "chat.call.incoming",
      incomingPayload,
    ).catch(() => {});

    if (notificationService?.publish) {
      setImmediate(async () => {
        try {
          // The conversation's own company, not re-derived from profile's
          // memberships — see call-links-service.js's sendInvites for why.
          const [conversationRow] = await prisma.$queryRaw`
            SELECT company_id AS "companyId" FROM chat_conversations WHERE id = ${conversationId} LIMIT 1
          `;
          const companyId = conversationRow?.companyId ?? null;
          if (!companyId) return;
          const published = await notificationService.publish({
            companyId,
            actorId: profile.id,
            input: {
              eventType: "chat.call.incoming",
              title: profile.displayName || "Llamada entrante",
              body: kind === "VIDEO" ? "Videollamada entrante" : "Llamada entrante",
              link: `/app/m/runly.chat/chat/inbox/${conversationId}`,
              recipients: { userIds: recipientIds },
              channels: ["in_app", "web_push"],
              priority: "critical",
              sourceType: "call",
              sourceId: call.id,
              metadata: incomingPayload,
              dedupeKey: `chat.call.incoming:${call.id}`,
              expiresAt: new Date(now().getTime() + RING_TIMEOUT_MS),
            },
          });

          // A ringing call can't wait for the background delivery worker's
          // ~30s poll — push THIS notification's web_push/fcm deliveries out
          // now, scoped by notificationId so we don't drain everyone else's queue.
          const notificationIds = (published?.data ?? [])
            .map((n) => n?.id)
            .filter(Boolean);
          if (deliveryWorker?.processPendingNotificationDeliveries && notificationIds.length) {
            for (const channel of ["web_push", "fcm"]) {
              deliveryWorker
                .processPendingNotificationDeliveries({ channel, notificationIds, limit: notificationIds.length })
                .catch((error) => {
                  console.warn(
                    `[atlas.calls] Entrega inmediata de push (${channel}) fallo; el worker lo reintentara:`,
                    error?.message ?? error,
                  );
                });
            }
          }
        } catch (error) {
          console.warn("[atlas.calls] No se pudo publicar el aviso de llamada:", error?.message ?? error);
        }
      });
    }
    return {
      callId: call.id,
      call,
      livekitUrl: config.publicUrl,
      token: await createToken(config, call, profile),
    };
  }

  async function getRecordingActiveStatus(callId) {
    const activeRecording = await prisma.$queryRaw`
      SELECT id FROM "call_recording" WHERE call_id = ${callId} AND status IN ('STARTING','ACTIVE') LIMIT 1
    `;
    return activeRecording.length > 0;
  }

  async function getCall({ authUserId, callId }) {
    assertEnabled();
    await expireStaleCalls();
    const profile = await resolveProfile(authUserId);
    const call = await getCallRecord(callId);
    await assertCallAccess(call, profile.id);
    return { ...call, recording: { active: await getRecordingActiveStatus(call.id) } };
  }

  async function getLiveCallOrThrow(callId) {
    const rows = await prisma.$queryRaw`
      SELECT id, conversation_id AS "conversationId", status,
             livekit_room_name AS "livekitRoomName", initiated_by_user_id AS "initiatedByUserId"
      FROM "call" WHERE id = ${callId} LIMIT 1
    `;
    const call = rows[0];
    if (!call || !["RINGING", "ACTIVE"].includes(call.status)) {
      throw new CallServiceError("La llamada no está activa.", 409);
    }
    return call;
  }

  async function getCurrentCall({ authUserId }) {
    assertEnabled();
    await expireStaleCalls();
    const profile = await resolveProfile(authUserId);
    const participant = await prisma.callParticipant.findFirst({
      where: {
        userId: profile.id,
        status: { in: ["RINGING", "JOINED"] },
        call: { status: { in: LIVE_CALL_STATUSES } },
      },
      orderBy: { createdAt: "desc" },
      select: { callId: true, status: true },
    });
    if (!participant) return null;
    const call = await getCallRecord(participant.callId);
    return {
      participantStatus: participant.status,
      call: { ...call, recording: { active: await getRecordingActiveStatus(call.id) } },
    };
  }

  async function joinCall({ authUserId, callId }) {
    const config = assertEnabled();
    await expireStaleCalls();
    const profile = await resolveProfile(authUserId);
    const before = await getCallRecord(callId);
    if (before.status === "ENDED") throw new CallServiceError("Esta llamada ya termino.", 409);
    // Any member of the conversation may join (or re-join) a live meeting —
    // even if they declined, missed the ring, left, or were never rung.
    await assertMembership(before.conversationId, profile.id);
    let participant = before.participants.find((entry) => entry.userId === profile.id) ?? null;
    if (participant?.status === "REMOVED") {
      throw new CallServiceError("El anfitrión te quitó de esta llamada.", 403);
    }
    if (!participant) {
      participant = await prisma.callParticipant.create({
        data: { callId, userId: profile.id, status: "INVITED", livekitIdentity: profile.id },
      });
    }

    const shouldActivate = profile.id !== before.initiatedByUserId || before.status === "ACTIVE";
    const operations = [
      prisma.callParticipant.update({
        where: { callId_userId: { callId, userId: profile.id } },
        data: { status: "JOINED", joinedAt: participant.joinedAt ?? now(), leftAt: null, ringStartedAt: null },
      }),
    ];
    if (shouldActivate) {
      operations.push(prisma.call.update({
        where: { id: callId },
        data: { status: "ACTIVE", startedAt: before.startedAt ?? now() },
      }));
    }
    await prisma.$transaction(operations);
    const call = await getCallRecord(callId);
    if (shouldActivate && before.status === "RINGING") {
      await postCallSystemMessage(call, { event: "started", kind: call.kind });
    }
    return {
      callId,
      call,
      livekitUrl: config.publicUrl,
      token: await createToken(config, call, profile),
    };
  }

  async function declineCall({ authUserId, callId }) {
    assertEnabled();
    await expireStaleCalls();
    const profile = await resolveProfile(authUserId);
    const call = await getCallRecord(callId);
    const participant = await assertCallAccess(call, profile.id);
    if (call.status === "ENDED") return call;
    if (participant.userId === call.initiatedByUserId) {
      throw new CallServiceError("El iniciador debe finalizar la llamada.", 409);
    }
    await prisma.callParticipant.update({
      where: { callId_userId: { callId, userId: profile.id } },
      data: { status: "DECLINED", leftAt: now() },
    });
    const remaining = await prisma.callParticipant.count({
      where: { callId, userId: { not: call.initiatedByUserId }, status: { in: ["RINGING", "JOINED"] } },
    });
    if (remaining === 0 && call.status === "RINGING") {
      await endCallRecord(call, "rejected");
    }
    return getCallRecord(callId);
  }

  async function endCallRecord(call, reason = "ended") {
    await prisma.$transaction([
      prisma.callParticipant.updateMany({
        where: { callId: call.id, status: "RINGING" },
        data: { status: reason === "missed" ? "MISSED" : "DECLINED", leftAt: now() },
      }),
      prisma.callParticipant.updateMany({
        where: { callId: call.id, status: "JOINED" },
        data: { status: "LEFT", leftAt: now() },
      }),
      prisma.call.update({
        where: { id: call.id },
        data: { status: "ENDED", endedAt: now(), endReason: reason },
      }),
    ]);
    await closeLiveKitRoom(call);
    await postCallSystemMessage(call, {
      event: "ended",
      kind: call.kind,
      endReason: reason === "missed" ? "missed" : reason === "rejected" ? "rejected" : "ended",
      startedAt: call.startedAt ?? null,
      endedAt: now(),
    });
    const participantIds = [];
    for (const participant of call.participants ?? []) {
      if (participant.userId && !participantIds.includes(participant.userId)) {
        participantIds.push(participant.userId);
      }
    }
    if (participantIds.length) {
      try {
        await broadcaster?.broadcastToUsers?.(
          participantIds,
          "chat.call.ended",
          { callId: call.id, reason },
        );
      } catch (error) {
        console.warn("[atlas.calls] No se pudo emitir el cierre de llamada:", error?.message ?? error);
      }
    }
  }

  async function leaveCall({ authUserId, callId }) {
    assertEnabled();
    const profile = await resolveProfile(authUserId);
    const call = await getCallRecord(callId);
    await assertCallAccess(call, profile.id);
    if (call.status === "ENDED") return call;
    await prisma.callParticipant.update({
      where: { callId_userId: { callId, userId: profile.id } },
      data: { status: "LEFT", leftAt: now() },
    });
    // A 1:1 call ends when either side hangs up. A group call or meeting keeps
    // going while anyone is still in it — even after the host leaves (the host
    // ends it for everyone with endCall, "Finalizar para todos").
    const remaining = await prisma.callParticipant.count({
      where: { callId, userId: { not: profile.id }, status: "JOINED" },
    });
    const [conversation] = await prisma.$queryRaw`
      SELECT type FROM chat_conversations WHERE id = ${call.conversationId} LIMIT 1
    `;
    if (conversation?.type === "direct" || remaining === 0) {
      await endCallRecord(call, "ended");
    }
    return getCallRecord(callId);
  }

  async function endCall({ authUserId, callId }) {
    assertEnabled();
    const profile = await resolveProfile(authUserId);
    const call = await getCallRecord(callId);
    await assertCallAccess(call, profile.id);
    if (call.status === "ENDED") return call;
    await assertCanManageCall({
      conversationId: call.conversationId,
      initiatedByUserId: call.initiatedByUserId,
      profileId: profile.id,
      action: "finalizar esta llamada",
    });
    await endCallRecord(call, "ended");
    return getCallRecord(callId);
  }

  // Ring specific members from inside a live call/meeting ("Llamar" in the
  // people panel). Any joined participant may ring; targets must already be
  // members of the conversation (outsiders go through the invite flow).
  async function ringParticipants({ authUserId, callId, profileIds }) {
    assertEnabled();
    const profile = await resolveProfile(authUserId);
    const call = await getCallRecord(callId);
    if (call.status === "ENDED") throw new CallServiceError("Esta llamada ya termino.", 409);
    const me = call.participants.find((entry) => entry.userId === profile.id);
    if (me?.status !== "JOINED") throw new CallServiceError("Únete a la llamada para llamar a alguien.", 403);
    const targets = [...new Set(profileIds ?? [])].filter((id) => id && id !== profile.id);
    if (!targets.length) return { rung: [] };
    const memberRows = await prisma.$queryRaw`
      SELECT m.user_id AS "userId", up.email
      FROM chat_conversation_members m
      JOIN user_profile up ON up.id = m.user_id
      WHERE m.conversation_id = ${call.conversationId}
        AND m.user_id = ANY(${targets}::uuid[])
        AND m.left_at IS NULL
        AND public.runly_chat_user_access(m.conversation_id, m.user_id)
    `;
    const joined = new Set(call.participants.filter((p) => p.status === "JOINED").map((p) => p.userId));
    const users = memberRows.filter((row) => !joined.has(row.userId));
    if (!users.length) return { rung: [] };
    await inviteMembersToLiveCall({ conversationId: call.conversationId, inviterProfileId: profile.id, users });
    return { rung: users.map((u) => u.userId) };
  }

  // The live call of a conversation, for the "Reunión en curso · Unirse"
  // banner. Members only; returns null when nothing is live.
  async function getConversationLiveCall({ authUserId, conversationId }) {
    assertEnabled();
    const profile = await resolveProfile(authUserId);
    await assertMembership(conversationId, profile.id);
    const live = await prisma.call.findFirst({
      where: { conversationId, status: { in: LIVE_CALL_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!live) return null;
    const call = await getCallRecord(live.id);
    const mine = call.participants.find((entry) => entry.userId === profile.id) ?? null;
    return {
      call: {
        id: call.id,
        kind: call.kind,
        status: call.status,
        startedAt: call.startedAt ?? null,
        initiatedByUserId: call.initiatedByUserId,
        joinedCount: call.participants.filter((p) => p.status === "JOINED").length,
      },
      myStatus: mine?.status ?? null,
    };
  }

  async function revokeUnauthorizedParticipants() {
    const config = getConfig();
    if (!config.enabled) return;
    const rows = await prisma.$queryRaw`SELECT cp.id, cp.livekit_identity, c.livekit_room_name
      FROM call_participant cp JOIN call c ON c.id = cp.call_id
      WHERE c.status IN ('RINGING', 'ACTIVE')
        AND NOT public.runly_chat_user_access(c.conversation_id, cp.user_id)`;
    const rooms = new RoomServiceClientImpl(config.internalUrl, config.apiKey, config.apiSecret);
    // Keep checking LEFT participants: self-hosted LiveKit does not revoke old
    // tokens, so a reconnect must be removed again, including screen publishers.
    const failures = [];
    for (const row of rows) {
      for (const identity of row.livekit_identity ? [row.livekit_identity, `screen:${row.livekit_identity}`] : []) {
        try {
          await rooms.removeParticipant(row.livekit_room_name, identity);
        } catch (error) {
          if (error?.status !== 404 && error?.code !== 'not_found') failures.push(error);
        }
      }
      await prisma.callParticipant.updateMany({ where: { id: row.id, leftAt: null }, data: { leftAt: now(), status: 'LEFT' } });
    }
    if (failures.length) throw new AggregateError(failures, 'No se pudo revocar el acceso a todas las conexiones de llamada.');
  }

  function startExpirySweeper() {
    if (!getConfig().enabled) return () => {};
    const timer = setInterval(() => {
      Promise.all([expireStaleCalls(), revokeUnauthorizedParticipants()]).catch((error) => {
        console.error("[atlas.calls] Error expirando llamadas:", error?.message ?? error);
      });
    }, 15_000);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  return {
    ...createCallScreenShareService({ assertEnabled, resolveProfile, getCallRecord, assertCallAccess, AccessTokenImpl, ErrorImpl: CallServiceError }),
    getConfigStatus,
    createCall,
    getCall,
    getLiveCallOrThrow,
    getCurrentCall,
    joinCall,
    declineCall,
    leaveCall,
    endCall,
    expireStaleCalls,
    startExpirySweeper,
    revokeUnauthorizedParticipants,
    assertCanManageCall,
    inviteMembersToLiveCall,
    ringParticipants,
    getConversationLiveCall,
    postSystemMessage,
    getRecordingActiveStatus,
  };
}
