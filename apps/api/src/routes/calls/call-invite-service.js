import { LIVE_CALL_STATUSES, RING_TIMEOUT_MS } from "./call-constants.js";

// Pulls platform users into a conversation's live call (or meeting) and rings
// them: adds missing conversation members, (re)sets their call participant to
// RINGING, and sends the same "incoming call" alert a rung member gets.
// Extracted from call-service.js to keep that file under the size limit.
export function createCallInviteService({ prisma, notificationService = null, broadcaster = null, deliveryWorker = null, now = () => new Date() }) {
  // Bring already-registered platform users (matched by email in
  // call-links-service) straight into the meeting instead of emailing them a
  // guest link: add them to the conversation if needed, attach them to the live
  // call as RINGING participants, and fire the same in-app + web_push "incoming
  // call" alert a normally-rung member gets. Only for people who have an account
  // in the inviter's company — external addresses keep going out by email.
  async function inviteMembersToLiveCall({ conversationId, inviterProfileId, users }) {
    const targets = [
      ...new Map((users ?? []).filter((u) => u?.userId).map((u) => [u.userId, u])).values(),
    ];
    if (!targets.length) return { notified: [], addedMembers: [], addedParticipants: [] };
    const targetIds = targets.map((u) => u.userId);

    // The relevant company is the conversation's own company, not re-derived
    // from the inviter's memberships — see call-links-service.js's sendInvites
    // for why (a multi-company inviter's "most recent membership" is not
    // necessarily this call's company).
    const [conversationRow] = await prisma.$queryRaw`
      SELECT company_id AS "companyId" FROM chat_conversations WHERE id = ${conversationId} LIMIT 1
    `;
    const companyId = conversationRow?.companyId ?? null;

    const [inviter] = await prisma.$queryRaw`
      SELECT display_name AS "displayName" FROM user_profile WHERE id = ${inviterProfileId} LIMIT 1
    `;
    const inviterName = inviter?.displayName ?? "Alguien";

    // 1. Add anyone who is not already an active member of the conversation.
    const memberRows = await prisma.$queryRaw`
      SELECT user_id AS "userId" FROM chat_conversation_members
      WHERE conversation_id = ${conversationId}
        AND user_id = ANY(${targetIds}::uuid[])
        AND left_at IS NULL
    `;
    const alreadyMembers = new Set(memberRows.map((r) => r.userId));
    const addedMembers = [];
    for (const uid of targetIds) {
      if (alreadyMembers.has(uid)) continue;
      // (conversation_id, user_id) is a PARTIAL unique index
      // (WHERE user_id IS NOT NULL AND left_at IS NULL); the ON CONFLICT clause
      // must repeat that predicate or Postgres raises 42P10 and this 500s.
      const inserted = await prisma.$executeRaw`
        INSERT INTO chat_conversation_members (conversation_id, user_id, role)
        VALUES (${conversationId}, ${uid}, 'member')
        ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL AND left_at IS NULL
        DO UPDATE
          SET left_at = NULL, role = EXCLUDED.role, role_id = NULL
          WHERE chat_conversation_members.left_at IS NOT NULL
      `;
      if (inserted === 0) continue;
      await prisma.$executeRaw`
        UPDATE chat_conversation_members
        SET role_id = (SELECT id FROM chat_channel_roles WHERE conversation_id = ${conversationId} AND name = 'Member' LIMIT 1)
        WHERE conversation_id = ${conversationId} AND user_id = ${uid} AND role_id IS NULL
      `;
      addedMembers.push(uid);
    }

    // 2. Attach them to the live call (if any) so their client can fetch it and
    //    they can actually join.
    const liveCall = await prisma.call.findFirst({
      where: { conversationId, status: { in: LIVE_CALL_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, initiatedByUserId: true },
    });
    const addedParticipants = [];
    if (liveCall) {
      const existing = await prisma.callParticipant.findMany({
        where: { callId: liveCall.id, userId: { in: targetIds } },
        select: { userId: true, status: true },
      });
      const havePart = new Set(existing.map((r) => r.userId));
      const toAdd = targetIds.filter((id) => !havePart.has(id));
      if (toAdd.length) {
        await prisma.callParticipant.createMany({
          data: toAdd.map((uid) => ({
            callId: liveCall.id,
            userId: uid,
            status: "RINGING",
            livekitIdentity: uid,
            ringStartedAt: now(),
          })),
          skipDuplicates: true,
        });
        addedParticipants.push(...toAdd);
      }
      // Someone already attached but not in the room (invited without ring,
      // missed/declined an earlier ring, or left) gets rung again.
      const toRing = existing.filter((r) => r.status !== "JOINED").map((r) => r.userId);
      if (toRing.length) {
        await prisma.callParticipant.updateMany({
          where: { callId: liveCall.id, userId: { in: toRing }, status: { not: "JOINED" } },
          data: { status: "RINGING", ringStartedAt: now(), leftAt: null },
        });
      }
    }

    // 3. System line in the conversation for the freshly-added members.
    if (addedMembers.length) {
      const names = await prisma.$queryRaw`
        SELECT display_name AS "displayName" FROM user_profile
        WHERE id = ANY(${addedMembers}::uuid[])
      `;
      const label = names.map((n) => n.displayName).filter(Boolean).join(", ");
      if (label) {
        await prisma.$executeRaw`
          INSERT INTO chat_messages (conversation_id, sender_type, body, message_type, sender_user_id)
          VALUES (${conversationId}, 'system', ${`${inviterName} invito a ${label} a la reunion`}, 'system', ${inviterProfileId})
        `;
      }
    }

    // 4. In-app + web_push alert — the same event type a rung member gets, so it
    //    reaches the incoming-call UI and honours the recipient's call prefs.
    const kind = liveCall?.kind ?? "VIDEO";
    const incomingPayload = liveCall
      ? {
          callId: liveCall.id,
          conversationId,
          kind,
          initiatorId: inviterProfileId,
          initiatorName: inviterName,
        }
      : { conversationId };
    let publishedIds = [];
    if (companyId && notificationService?.publish) {
      try {
        const published = await notificationService.publish({
          companyId,
          actorId: inviterProfileId,
          input: {
            eventType: "chat.call.incoming",
            title: inviterName || (kind === "VIDEO" ? "Videollamada" : "Llamada"),
            body: kind === "VIDEO"
              ? "Te invitaron a una videollamada"
              : "Te invitaron a una llamada",
            link: `/app/m/runly.chat/chat/inbox/${conversationId}`,
            recipients: { userIds: targetIds },
            channels: ["in_app", "web_push"],
            priority: "critical",
            sourceType: "call",
            sourceId: liveCall?.id ?? conversationId,
            metadata: incomingPayload,
            dedupeKey: liveCall
              ? `chat.call.incoming:${liveCall.id}`
              : `chat.call.invite:${conversationId}:${inviterProfileId}`,
            ...(liveCall
              ? { expiresAt: new Date(now().getTime() + RING_TIMEOUT_MS) }
              : {}),
          },
        });
        publishedIds = (published?.data ?? []).map((n) => n?.id).filter(Boolean);
      } catch (error) {
        console.warn(
          "[atlas.calls] No se pudo avisar a los invitados con cuenta:",
          error?.message ?? error,
        );
      }
    }

    // 5. Realtime nudges: ring the online ones now, refresh their channel list.
    await broadcaster
      ?.broadcastToUsers?.(targetIds, "chat.conversation.new", { conversationId })
      .catch(() => {});
    if (liveCall) {
      await broadcaster
        ?.broadcastToUsers?.(targetIds, "chat.call.incoming", incomingPayload)
        .catch(() => {});
    }

    // 6. Push out THIS alert's web_push/fcm deliveries now — don't wait for
    //    the ~30s worker poll — scoped by notificationId so we don't drain the queue.
    if (deliveryWorker?.processPendingNotificationDeliveries && publishedIds.length) {
      for (const channel of ["web_push", "fcm"]) {
        deliveryWorker
          .processPendingNotificationDeliveries({
            channel,
            notificationIds: publishedIds,
            limit: publishedIds.length,
          })
          .catch((error) => {
            console.warn(
              `[atlas.calls] Entrega inmediata de push a invitados (${channel}) fallo:`,
              error?.message ?? error,
            );
          });
      }
    }

    return { notified: targetIds, addedMembers, addedParticipants };
  }

  return { inviteMembersToLiveCall };
}
