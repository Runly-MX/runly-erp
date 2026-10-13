// apps/api/src/routes/chat/chat-media-service.js
//
// "Multimedia": every attachment (or link) shared in the conversations the
// caller is an active member of, across all chats, newest first. Rows carry
// metadata only — the client signs each file lazily (GET
// /chat/attachments/:id/signed-url) when its tile scrolls into view.
import { Prisma } from "@prisma/client";
import { ChatServiceError } from "./chat-service-error.js";
import { resolveUserProfileId } from "./chat-service.js";

export const CHAT_MEDIA_TYPES = ["media", "documents", "audio", "links"];

const MAX_LIMIT = 60;

// Keyset cursor over (created_at, id), both descending.
export function encodeMediaCursor(row) {
  return Buffer.from(`${new Date(row.createdAt).toISOString()}|${row.id}`).toString("base64url");
}

export function decodeMediaCursor(cursor) {
  if (!cursor) return null;
  const [at, id] = Buffer.from(String(cursor), "base64url").toString("utf8").split("|");
  const date = new Date(at);
  if (!id || Number.isNaN(date.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new ChatServiceError("Cursor no valido.", 422);
  }
  return { at: date, id };
}

function mimeFilter(type) {
  if (type === "media") return Prisma.sql`(a.mime_type LIKE 'image/%' OR a.mime_type LIKE 'video/%')`;
  if (type === "audio") return Prisma.sql`a.mime_type LIKE 'audio/%'`;
  return Prisma.sql`NOT (a.mime_type LIKE 'image/%' OR a.mime_type LIKE 'video/%' OR a.mime_type LIKE 'audio/%')`;
}

export function createChatMediaService({ prisma }) {
  async function listMedia({ authUserId, companyId = null, type = "media", cursor = null, limit = 40, q = "" }) {
    if (!CHAT_MEDIA_TYPES.includes(type)) throw new ChatServiceError("Tipo de multimedia no valido.", 422);
    const profileId = await resolveUserProfileId(prisma, authUserId);
    const take = Math.min(Math.max(Number(limit) || 40, 1), MAX_LIMIT);
    const after = decodeMediaCursor(cursor);
    const search = String(q ?? "").trim().slice(0, 100);

    // Conversations the caller can see right now (same rules as the chat list).
    const access = Prisma.sql`
      JOIN chat_conversations c ON c.id = x.conversation_id AND c.deleted_at IS NULL
        AND (${companyId}::uuid IS NULL OR c.company_id = ${companyId}::uuid)
      JOIN chat_conversation_members ccm ON ccm.conversation_id = c.id
        AND ccm.user_id = ${profileId}::uuid AND ccm.left_at IS NULL
    `;

    let rows;
    if (type === "links") {
      rows = await prisma.$queryRaw`
        SELECT m.id, m.conversation_id AS "conversationId", m.body, m.created_at AS "createdAt",
               up.display_name AS "senderName"
        FROM chat_messages m
        CROSS JOIN LATERAL (SELECT m.conversation_id) x
        ${access}
        LEFT JOIN user_profile up ON up.id = m.sender_user_id
        WHERE m.deleted_at IS NULL AND m.body ~* 'https?://'
          AND public.runly_chat_user_access(m.conversation_id, ${profileId}::uuid)
          ${search ? Prisma.sql`AND m.body ILIKE ${`%${search}%`}` : Prisma.empty}
          ${after ? Prisma.sql`AND (m.created_at, m.id) < (${after.at}, ${after.id}::uuid)` : Prisma.empty}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ${take + 1}
      `;
    } else {
      rows = await prisma.$queryRaw`
        SELECT a.id, a.conversation_id AS "conversationId", a.message_id AS "messageId",
               a.file_name AS "fileName", a.mime_type AS "mimeType", a.size_bytes AS "sizeBytes",
               a.duration_ms AS "durationMs", a.created_at AS "createdAt",
               up.display_name AS "senderName"
        FROM chat_attachments a
        CROSS JOIN LATERAL (SELECT a.conversation_id) x
        ${access}
        JOIN chat_messages m ON m.id = a.message_id AND m.deleted_at IS NULL
        LEFT JOIN user_profile up ON up.id = m.sender_user_id
        WHERE ${mimeFilter(type)}
          AND public.runly_chat_user_access(a.conversation_id, ${profileId}::uuid)
          ${search ? Prisma.sql`AND a.file_name ILIKE ${`%${search}%`}` : Prisma.empty}
          ${after ? Prisma.sql`AND (a.created_at, a.id) < (${after.at}, ${after.id}::uuid)` : Prisma.empty}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${take + 1}
      `;
    }

    const page = rows.slice(0, take).map((row) => (
      row.sizeBytes != null ? { ...row, sizeBytes: Number(row.sizeBytes) } : row
    ));
    return {
      data: page,
      nextCursor: rows.length > take ? encodeMediaCursor(page[page.length - 1]) : null,
    };
  }

  return { listMedia };
}
