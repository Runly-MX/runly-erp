import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { stripMentionTokens } from "../../lib/mention-utils.js";
import { signHs256Jwt } from "../../services/jwt-verification.js";
import { publishChatEvent } from "./chat-automation-events.js";

// How long a minted Realtime auth token for a guest session stays valid.
// Matches chat_guest_sessions' own idle-expiry window (bumped by the same
// amount on every guest message, see sendGuestMessage) — the token is
// re-minted and returned alongside the session's own activity, so it never
// needs its own separate refresh loop on the client.
const GUEST_REALTIME_TOKEN_TTL_SECS = 30 * 60;

// Mints a short-lived JWT identifying a chat_guest_sessions row for Supabase
// Realtime Authorization (private channels on chat:conv:<id> — see migration
// 20260911180000_chat_guest_realtime_authorization). The guest never has a
// real Supabase Auth session, so this is a self-signed token verified with
// the same SUPABASE_JWT_SECRET Realtime already trusts for real Supabase-
// issued tokens. role: "authenticated" is safe here: every existing
// authenticated-role RLS policy in this schema keys off auth.uid() resolving
// to a real user_profile.auth_user_id, and this token's `sub` (the guest
// session id) can never match one — the new chat_guest_is_member policy is
// the only thing that reads the custom guest_session_id claim.
export function mintGuestRealtimeToken(guestSessionId) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || !guestSessionId) return null;
  return signHs256Jwt(
    { sub: guestSessionId, role: "authenticated", guest_session_id: guestSessionId },
    secret,
    GUEST_REALTIME_TOKEN_TTL_SECS,
  );
}

export class GuestChatServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "GuestChatServiceError";
    this.status = status;
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ------------------------------------------------------------------
// Sequential tracking code per company: CHAT-000001
// ------------------------------------------------------------------
async function generateTrackingCode(prisma, companyId) {
  if (!companyId) {
    // Fallback: short random hex when no company
    return `CHAT-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  }
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM chat_conversations
    WHERE company_id = ${companyId}::uuid
      AND tracking_code IS NOT NULL
  `;
  const seq = (rows[0]?.total ?? 0) + 1;
  return `CHAT-${String(seq).padStart(6, "0")}`;
}

// ------------------------------------------------------------------
// Auto-assign conversation to least-loaded available operator
// ------------------------------------------------------------------
async function autoAssign(prisma, conversationId, companyId) {
  const candidates = await prisma.$queryRaw`
    SELECT up.id AS user_id, COUNT(cc.id)::int AS open_count
    FROM user_profile up
    INNER JOIN membership m ON m.user_id = up.id AND m.company_id = ${companyId}::uuid AND m.enabled = true
    LEFT JOIN chat_conversations cc
      ON cc.assigned_user_id = up.id
      AND cc.status IN ('open', 'pending')
      AND cc.type = 'external_support'
      AND cc.deleted_at IS NULL
    WHERE up.available_for_chat = true
    GROUP BY up.id
    ORDER BY open_count ASC, RANDOM()
    LIMIT 1
  `;
  if (!candidates[0]) return null;
  const userId = candidates[0].user_id;
  await prisma.$executeRaw`
    UPDATE chat_conversations SET assigned_user_id = ${userId}::uuid WHERE id = ${conversationId}::uuid
  `;
  await prisma.$executeRaw`
    INSERT INTO chat_conversation_members (conversation_id, user_id, role)
    VALUES (${conversationId}::uuid, ${userId}::uuid, 'operator')
    ON CONFLICT DO NOTHING
  `;
  return userId;
}

// ------------------------------------------------------------------
// Non-blocking lead capture in runly.growth
// ------------------------------------------------------------------
async function captureGrowthLead(prisma, { companyId, email, name, trackingCode }) {
  try {
    const sites = await prisma.$queryRaw`
      SELECT id FROM website_site WHERE company_id = ${companyId}::uuid AND enabled = true LIMIT 1
    `;
    if (!sites[0]) return;
    const existing = await prisma.$queryRaw`
      SELECT id FROM growth_lead
      WHERE company_id = ${companyId}::uuid
        AND email_normalized = lower(${email})
        AND created_at > NOW() - INTERVAL '7 days'
      LIMIT 1
    `;
    if (existing[0]) return;
    await prisma.growthLead.create({
      data: {
        companyId,
        siteId: sites[0].id,
        status: "new",
        source: "chat_widget",
        email,
        emailNormalized: email.toLowerCase().trim(),
        name: name ?? null,
        message: "Lead generado desde el chat de la web.",
        firstSubmissionAt: new Date(),
        lastSubmissionAt: new Date(),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        metadata: trackingCode ? { chatTrackingCode: trackingCode } : undefined,
      },
    });
  } catch {
    // Non-fatal
  }
}

export function createGuestChatService({ prisma, supabaseAdmin, notificationService, broadcaster }) {
  // ------------------------------------------------------------------
  // Session management
  // ------------------------------------------------------------------

  async function createGuestSession({ email, name, phone, websiteId, pageUrl, referrer, userAgent, metadata = {}, companyId }) {
    // Session continuation: if same email has an active session, issue a resume token
    if (email && companyId) {
      const existing = await prisma.$queryRaw`
        SELECT cgs.id, cgs.session_token_hash, cc.id AS conversation_id, cc.tracking_code
        FROM chat_guest_sessions cgs
        JOIN chat_conversations cc ON cc.created_by_guest_id = cgs.id
        WHERE lower(cgs.email) = lower(${email})
          AND cgs.closed_at IS NULL
          AND cgs.idle_expires_at > NOW()
          AND cgs.absolute_expires_at > NOW()
          AND cc.status != 'closed'
          AND cc.deleted_at IS NULL
        ORDER BY cgs.created_at DESC
        LIMIT 1
      `;
      if (existing[0]) {
        // Issue a fresh primary token so all subsequent requests work without re-auth.
        // Single-use resume_token_hash would be consumed on the first poll and break polling.
        const newToken = crypto.randomBytes(32).toString("hex");
        const newHash = hashToken(newToken);
        await prisma.$executeRaw`
          UPDATE chat_guest_sessions
          SET session_token_hash = ${newHash},
              resume_token_hash = NULL,
              idle_expires_at = NOW() + INTERVAL '30 minutes',
              last_seen_at = NOW()
          WHERE id = ${existing[0].id}::uuid
        `;
        return {
          token: newToken,
          sessionId: existing[0].id,
          conversationId: existing[0].conversation_id,
          trackingCode: existing[0].tracking_code ?? null,
          resumed: true,
          realtimeToken: mintGuestRealtimeToken(existing[0].id),
        };
      }
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const sessionRows = await prisma.$queryRaw`
      INSERT INTO chat_guest_sessions
        (session_token_hash, email, name, phone, website_id, page_url, referrer, user_agent, metadata)
      VALUES (
        ${tokenHash},
        ${email ?? null},
        ${name ?? null},
        ${phone ?? null},
        ${websiteId ?? null}::uuid,
        ${pageUrl ?? null},
        ${referrer ?? null},
        ${userAgent ?? null},
        ${JSON.stringify(metadata)}::jsonb
      )
      RETURNING *
    `;
    const session = sessionRows[0];

    // Generate sequential tracking code per company (CHAT-000001)
    const trackingCode = await generateTrackingCode(prisma, companyId);

    // Create a support conversation for this guest
    const convRows = await prisma.$queryRaw`
      INSERT INTO chat_conversations
        (type, title, created_by_guest_id, website_id, company_id, status, metadata, tracking_code)
      VALUES (
        'external_support',
        ${name ? `Chat de ${name}` : email ? `Chat de ${email}` : "Chat de visitante"},
        ${session.id},
        ${websiteId ?? null}::uuid,
        ${companyId ?? null}::uuid,
        'pending',
        ${JSON.stringify({ pageUrl, referrer, userAgent })}::jsonb,
        ${trackingCode}
      )
      RETURNING *
    `;
    const conv = convRows[0];

    // Add guest as member
    await prisma.$executeRaw`
      INSERT INTO chat_conversation_members (conversation_id, guest_session_id, role)
      VALUES (${conv.id}, ${session.id}, 'guest')
    `;

    // Auto-assign to an available operator
    let assignedUserId = null;
    if (companyId) {
      assignedUserId = await autoAssign(prisma, conv.id, companyId);
    }

    // Broadcast new conversation to all operators' inbox (non-fatal)
    if (companyId) {
      broadcaster?.broadcastToChannel(`chat:company:${companyId}`, "new_external_conversation", {
        conversationId: conv.id, assignedUserId,
      });
    }

    // System message so the guest immediately sees their tracking code
    const sysMsg = await prisma.$queryRaw`
      INSERT INTO chat_messages (conversation_id, sender_type, body, message_type, metadata)
      VALUES (
        ${conv.id},
        'system',
        ${`Conversacion iniciada. Tu numero de seguimiento es ${trackingCode}.`},
        'text',
        '{}'::jsonb
      )
      RETURNING id, created_at
    `.catch(() => []);
    if (sysMsg[0]) {
      await prisma.$executeRaw`
        UPDATE chat_conversations
        SET last_message_id = ${sysMsg[0].id},
            last_message_at = ${sysMsg[0].created_at},
            updated_at = NOW()
        WHERE id = ${conv.id}
      `.catch(() => {});
    }

    // Non-blocking: capture lead in runly.growth (pass trackingCode for metadata)
    if (email && companyId) {
      setImmediate(() => captureGrowthLead(prisma, { companyId, email, name, trackingCode }));
    }

    return {
      token: rawToken,
      sessionId: session.id,
      conversationId: conv.id,
      trackingCode,
      assignedUserId,
      resumed: false,
      realtimeToken: mintGuestRealtimeToken(session.id),
    };
  }

  async function resolveGuestSession(rawToken) {
    const tokenHash = hashToken(rawToken);

    // Check primary token
    let rows = await prisma.$queryRaw`
      SELECT * FROM chat_guest_sessions
      WHERE session_token_hash = ${tokenHash}
        AND closed_at IS NULL
        AND idle_expires_at > NOW()
        AND absolute_expires_at > NOW()
      LIMIT 1
    `;

    // Check resume token (single-use)
    if (!rows.length) {
      rows = await prisma.$queryRaw`
        SELECT * FROM chat_guest_sessions
        WHERE resume_token_hash = ${tokenHash}
          AND closed_at IS NULL
          AND idle_expires_at > NOW()
          AND absolute_expires_at > NOW()
        LIMIT 1
      `;
      if (rows.length) {
        // Consume the resume token immediately
        await prisma.$executeRaw`
          UPDATE chat_guest_sessions SET resume_token_hash = NULL WHERE id = ${rows[0].id}
        `;
      }
    }

    if (!rows.length) throw new GuestChatServiceError("Sesion de invitado invalida o expirada.", 401);
    return rows[0];
  }

  async function getGuestSessionInfo(rawToken) {
    const session = await resolveGuestSession(rawToken);

    const convRows = await prisma.$queryRaw`
      SELECT c.id, c.status, c.title, c.created_at, c.tracking_code,
             c.assigned_user_id AS "assignedUserId"
      FROM chat_conversations c
      INNER JOIN chat_conversation_members ccm
        ON ccm.conversation_id = c.id AND ccm.guest_session_id = ${session.id}
      WHERE c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 1
    `;

    return {
      sessionId: session.id,
      email: session.email,
      name: session.name,
      conversation: convRows[0] ?? null,
      trackingCode: convRows[0]?.tracking_code ?? null,
      idleExpiresAt: session.idle_expires_at,
      absoluteExpiresAt: session.absolute_expires_at,
      realtimeToken: mintGuestRealtimeToken(session.id),
    };
  }

  // ------------------------------------------------------------------
  // Guest messages
  // ------------------------------------------------------------------

  async function sendGuestMessage({ rawToken, body, messageType = "text", metadata = {} }) {
    const session = await resolveGuestSession(rawToken);

    const convRows = await prisma.$queryRaw`
      SELECT c.id, c.company_id, c.assigned_user_id
      FROM chat_conversations c
      INNER JOIN chat_conversation_members ccm
        ON ccm.conversation_id = c.id AND ccm.guest_session_id = ${session.id}
      WHERE c.deleted_at IS NULL AND c.status != 'closed'
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    if (!convRows.length) throw new GuestChatServiceError("No hay conversacion activa.", 404);
    const { id: conversationId, company_id: companyId, assigned_user_id: assignedUserId } = convRows[0];

    const msgRows = await prisma.$queryRaw`
      INSERT INTO chat_messages
        (conversation_id, sender_guest_id, sender_type, body, message_type, metadata)
      VALUES (
        ${conversationId},
        ${session.id},
        'guest',
        ${body},
        ${messageType},
        ${JSON.stringify(metadata)}::jsonb
      )
      RETURNING *
    `;
    const msg = msgRows[0];

    // Link a guest-presigned attachment (created by /attachments/presign) to
    // this message. Scoped to the conversation and to rows not yet linked so a
    // stale or foreign attachmentId is a no-op.
    if (metadata?.attachmentId) {
      const linked = await prisma.$executeRaw`
        UPDATE chat_attachments
        SET message_id = ${msg.id}
        WHERE id = ${metadata.attachmentId}::uuid
          AND conversation_id = ${conversationId}::uuid
          AND message_id IS NULL
      `;
      if (linked > 0) {
        await prisma.$executeRaw`
          UPDATE chat_messages
          SET attachment_count = attachment_count + ${linked}
          WHERE id = ${msg.id}
        `;
      }
    }

    // Update conversation + bump idle expiry on the session
    await Promise.all([
      prisma.$executeRaw`
        UPDATE chat_conversations
        SET last_message_id = ${msg.id},
            last_message_at = ${msg.created_at},
            status = CASE WHEN status = 'pending' THEN 'open' ELSE status END,
            updated_at = NOW()
        WHERE id = ${conversationId}
      `,
      prisma.$executeRaw`
        UPDATE chat_guest_sessions
        SET idle_expires_at = NOW() + INTERVAL '30 minutes',
            last_seen_at = NOW()
        WHERE id = ${session.id}
      `,
    ]);

    // Broadcast to operators via Supabase Realtime
    const broadcastPayload = {
      conversationId,
      messageId: msg.id,
      sessionId: session.id,
      senderType: "guest",
      senderName: session.name ?? session.email ?? "Visitante",
      body,
      messageType,
      createdAt: msg.created_at,
    };
    // Broadcast to conversation channel (guest widget updates)
    broadcaster?.broadcastToChannel(`chat:conv:${conversationId}`, "new_guest_message", broadcastPayload);
    // Also broadcast at company level so inbox sidebar updates immediately
    if (companyId) {
      broadcaster?.broadcastToChannel(`chat:company:${companyId}`, "external_message", {
        conversationId, messageId: msg.id,
      });
    }

    // Automations can answer the visitor (spec 2026-10-31-automations-calls-chat-autoreply §B).
    if (companyId) {
      setImmediate(async () => {
        const [{ count } = {}] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM chat_messages WHERE conversation_id = ${conversationId} AND sender_type = 'guest'`.catch(() => []);
        await publishChatEvent(prisma, {
          companyId: String(companyId),
          event: "chat.external.message.received",
          at: msg.created_at,
          payload: {
            conversationId: String(conversationId), messageId: String(msg.id), guestName: session.name ?? null, guestEmail: session.email ?? null,
            text: String(stripMentionTokens(body ?? "")).slice(0, 500), first: count === 1, assignedUserId: assignedUserId ? String(assignedUserId) : null,
          },
        });
      });
    }

    // In-app notification to assigned operator (or all available operators)
    if (notificationService && companyId) {
      setImmediate(async () => {
        try {
          const previewSource = stripMentionTokens(body);
          const preview = previewSource.length > 80 ? `${previewSource.slice(0, 80)}...` : previewSource;
          if (assignedUserId) {
            await notificationService.publish({
              companyId,
              input: {
                eventType: "chat.new_guest_message",
                title: "Nuevo mensaje de visitante",
                body: preview,
                link: `/app/m/runly.chat/chat/external`,
                recipients: { userIds: [assignedUserId.toString()] },
                channels: ["in_app", "web_push"],
                priority: "medium",
                sourceType: "chat_conversation",
                sourceId: conversationId,
                dedupeKey: `chat.new_guest_message:${conversationId}`,
              },
            });
          } else {
            // No assigned operator: notify all available operators in the company
            const operators = await prisma.$queryRaw`
              SELECT up.id FROM user_profile up
              INNER JOIN membership m ON m.user_id = up.id
                AND m.company_id = ${companyId}::uuid AND m.enabled = true
              WHERE up.available_for_chat = true
            `;
            if (operators.length) {
              await notificationService.publish({
                companyId,
                input: {
                  eventType: "chat.new_guest_message",
                  title: "Nuevo mensaje de visitante sin asignar",
                  body: preview,
                  link: `/app/m/runly.chat/chat/external`,
                  recipients: { userIds: operators.map((op) => op.id.toString()) },
                  channels: ["in_app", "web_push"],
                  priority: "medium",
                  sourceType: "chat_conversation",
                  sourceId: conversationId,
                  dedupeKey: `chat.new_guest_message:${conversationId}`,
                },
              });
            }
          }
        } catch {
          // Non-fatal
        }
      });
    }

    return {
      messageId: msg.id,
      conversationId,
      createdAt: msg.created_at,
      realtimeToken: mintGuestRealtimeToken(session.id),
    };
  }

  async function listGuestMessages({ rawToken, limit = 40, before = null }) {
    const session = await resolveGuestSession(rawToken);

    const convRows = await prisma.$queryRaw`
      SELECT c.id FROM chat_conversations c
      INNER JOIN chat_conversation_members ccm
        ON ccm.conversation_id = c.id AND ccm.guest_session_id = ${session.id}
      WHERE c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    if (!convRows.length) return { data: [], operatorLastReadAt: null };
    const conversationId = convRows[0].id;

    // Latest moment any operator viewed the conversation — drives the guest
    // widget's "Visto" marker and survives widget reloads.
    const readRows = await prisma.$queryRaw`
      SELECT MAX(last_read_at) AS operator_last_read_at
      FROM chat_conversation_members
      WHERE conversation_id = ${conversationId} AND user_id IS NOT NULL AND left_at IS NULL
    `;

    const rows = await prisma.$queryRaw`
      SELECT
        m.id,
        m.body,
        m.sender_type AS "senderType",
        m.message_type AS "messageType",
        m.attachment_count AS "attachmentCount",
        m.metadata,
        m.created_at AS "createdAt",
        m.edited_at AS "editedAt",
        m.deleted_at AS "deletedAt",
        CASE
          WHEN m.sender_type = 'user' THEN
            json_build_object('displayName', up.display_name, 'avatarUrl', NULL)
          ELSE NULL
        END AS sender,
        (
          SELECT json_agg(json_build_object(
            'id', a.id,
            'fileName', a.file_name,
            'mimeType', a.mime_type,
            'sizeBytes', a.size_bytes,
            'objectKey', a.object_key
          ))
          FROM chat_attachments a WHERE a.message_id = m.id
        ) AS attachments
      FROM chat_messages m
      LEFT JOIN user_profile up ON up.id = m.sender_user_id
      WHERE m.conversation_id = ${conversationId}
        AND m.deleted_at IS NULL
        ${before ? Prisma.sql`AND m.created_at < ${new Date(before)}` : Prisma.empty}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;

    return {
      data: rows.reverse(),
      conversationId,
      operatorLastReadAt: readRows[0]?.operator_last_read_at ?? null,
    };
  }

  async function getGuestAttachmentUrl({ rawToken, attachmentId }) {
    const session = await resolveGuestSession(rawToken);
    const convRows = await prisma.$queryRaw`
      SELECT c.id FROM chat_conversations c
      INNER JOIN chat_conversation_members ccm
        ON ccm.conversation_id = c.id AND ccm.guest_session_id = ${session.id}
      WHERE c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    if (!convRows.length) throw new GuestChatServiceError("No hay conversacion activa.", 404);
    const conversationId = convRows[0].id;

    const attRows = await prisma.$queryRaw`
      SELECT bucket, object_key
      FROM chat_attachments
      WHERE id = ${attachmentId}::uuid AND conversation_id = ${conversationId}::uuid
      LIMIT 1
    `;
    if (!attRows.length) throw new GuestChatServiceError("Adjunto no encontrado.", 404);

    const { bucket, object_key: objectKey } = attRows[0];
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(objectKey, 300);
    if (error || !data?.signedUrl) throw new GuestChatServiceError("Error generando URL del adjunto.", 500);
    return { url: data.signedUrl, expiresIn: 300 };
  }

  async function broadcastGuestTyping({ rawToken }) {
    const session = await resolveGuestSession(rawToken);
    const convRows = await prisma.$queryRaw`
      SELECT c.id FROM chat_conversations c
      INNER JOIN chat_conversation_members ccm
        ON ccm.conversation_id = c.id AND ccm.guest_session_id = ${session.id}
      WHERE c.deleted_at IS NULL AND c.status != 'closed'
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    if (!convRows.length) return { ok: true };
    broadcaster?.broadcastToChannel(`chat:conv:${convRows[0].id}`, "guest_typing", {
      conversationId: convRows[0].id,
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  async function markGuestRead({ rawToken }) {
    const session = await resolveGuestSession(rawToken);
    const convRows = await prisma.$queryRaw`
      SELECT c.id FROM chat_conversations c
      INNER JOIN chat_conversation_members ccm
        ON ccm.conversation_id = c.id AND ccm.guest_session_id = ${session.id}
      WHERE c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    await prisma.$executeRaw`
      UPDATE chat_guest_sessions
      SET guest_last_read_at = NOW(), last_seen_at = NOW()
      WHERE id = ${session.id}
    `;
    if (convRows.length) {
      broadcaster?.broadcastToChannel(`chat:conv:${convRows[0].id}`, "guest_read", {
        conversationId: convRows[0].id,
        at: new Date().toISOString(),
      });
    }
    return { ok: true };
  }

  async function closeGuestSession({ rawToken }) {
    const session = await resolveGuestSession(rawToken);
    await prisma.$executeRaw`
      UPDATE chat_guest_sessions SET closed_at = NOW() WHERE id = ${session.id}
    `;
    await prisma.$executeRaw`
      UPDATE chat_conversations
      SET status = 'closed', updated_at = NOW()
      FROM chat_conversation_members ccm
      WHERE chat_conversations.id = ccm.conversation_id
        AND ccm.guest_session_id = ${session.id}
    `;
    return { ok: true };
  }

  return {
    createGuestSession,
    resolveGuestSession,
    getGuestSessionInfo,
    sendGuestMessage,
    listGuestMessages,
    getGuestAttachmentUrl,
    broadcastGuestTyping,
    markGuestRead,
    closeGuestSession,
  };
}
