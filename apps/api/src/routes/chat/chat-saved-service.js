// apps/api/src/routes/chat/chat-saved-service.js
//
// Messages saved for later and reminders ("recordarme de esto"). A reminder is a saved
// message with `remind_at`; the worker notifies the person when it is due. Spec
// docs/superpowers/specs/2026-10-26-saved-and-reminders-design.md.
import { ChatServiceError } from "./chat-service-error.js";
import { plainMentions } from "../work-activity.js";

export const MAX_SAVED = 500;
export const MAX_REMINDER_DAYS = 365;
const EXCERPT = 160;

// remindAt: ISO text or null. Returns a Date in the future (within a year) or null; throws on nonsense.
export function parseRemindAt(value, now = new Date()) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ChatServiceError("La fecha del recordatorio no es válida.", 400);
  if (date.getTime() <= now.getTime()) throw new ChatServiceError("El recordatorio debe ser en el futuro.", 400);
  if (date.getTime() > now.getTime() + MAX_REMINDER_DAYS * 86_400_000) throw new ChatServiceError("El recordatorio puede ser hasta dentro de un año.", 400);
  return date;
}

export function createChatSavedService({ prisma, notificationService = null, now = () => new Date() }) {
  // The message must be in a conversation the person belongs to, in the active company, with access.
  async function assertReadable({ companyId, profileId, messageId }) {
    const [row] = await prisma.$queryRaw`
      SELECT m.id, m.conversation_id
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id AND c.company_id = ${companyId}::uuid AND c.deleted_at IS NULL
      JOIN chat_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL
      WHERE m.id = ${messageId}::uuid AND m.deleted_at IS NULL AND public.runly_chat_user_access(m.conversation_id, ${profileId}::uuid)
    `;
    if (!row) throw new ChatServiceError("Mensaje no encontrado.", 404);
    return row;
  }

  async function save({ companyId, profileId, messageId, remindAt }) {
    const message = await assertReadable({ companyId, profileId, messageId });
    const when = parseRemindAt(remindAt, now());
    const [{ count }] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM chat_saved_messages WHERE user_id = ${profileId}::uuid AND completed_at IS NULL`;
    if (count >= MAX_SAVED) throw new ChatServiceError(`Puedes guardar hasta ${MAX_SAVED} mensajes: quita algunos.`, 400);
    const [row] = await prisma.$queryRaw`
      INSERT INTO chat_saved_messages (user_id, company_id, message_id, conversation_id, remind_at)
      VALUES (${profileId}::uuid, ${companyId}::uuid, ${messageId}::uuid, ${message.conversation_id}::uuid, ${when})
      ON CONFLICT (user_id, message_id) DO UPDATE
        SET remind_at = COALESCE(EXCLUDED.remind_at, chat_saved_messages.remind_at),
            reminded_at = CASE WHEN EXCLUDED.remind_at IS NOT NULL THEN NULL ELSE chat_saved_messages.reminded_at END,
            completed_at = NULL
      RETURNING id, message_id, conversation_id, remind_at
    `;
    return row;
  }

  // remindAt undefined = untouched, null = clear; completed true/false.
  async function update({ profileId, messageId, remindAt, completed }) {
    const touch = remindAt !== undefined;
    const when = touch ? parseRemindAt(remindAt, now()) : null;
    const done = completed === undefined ? null : completed === true;
    const [row] = await prisma.$queryRaw`
      UPDATE chat_saved_messages SET
        remind_at = CASE WHEN ${touch} THEN ${when}::timestamptz ELSE remind_at END,
        reminded_at = CASE WHEN ${touch} THEN NULL ELSE reminded_at END,
        completed_at = CASE WHEN ${done}::boolean IS NULL THEN completed_at WHEN ${done}::boolean THEN NOW() ELSE NULL END
      WHERE user_id = ${profileId}::uuid AND message_id = ${messageId}::uuid
      RETURNING id, message_id, conversation_id, remind_at, completed_at
    `;
    if (!row) throw new ChatServiceError("Ese mensaje no está guardado.", 404);
    return row;
  }

  async function remove({ profileId, messageId }) {
    await prisma.$executeRaw`DELETE FROM chat_saved_messages WHERE user_id = ${profileId}::uuid AND message_id = ${messageId}::uuid`;
    return { messageId };
  }

  // Saved messages still readable by the person, with reminders first.
  async function list({ companyId, profileId, includeCompleted = false }) {
    const rows = await prisma.$queryRaw`
      SELECT s.id, s.message_id, s.conversation_id, s.remind_at, s.reminded_at, s.completed_at, s.created_at,
             m.body, sender.display_name AS sender_name, c.title AS conversation_name, c.type AS conversation_type
      FROM chat_saved_messages s
      JOIN chat_messages m ON m.id = s.message_id AND m.deleted_at IS NULL
      JOIN chat_conversations c ON c.id = s.conversation_id AND c.company_id = ${companyId}::uuid AND c.deleted_at IS NULL
      JOIN chat_conversation_members cm ON cm.conversation_id = s.conversation_id AND cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL
      LEFT JOIN user_profile sender ON sender.id = m.sender_user_id
      WHERE s.user_id = ${profileId}::uuid AND (${includeCompleted} OR s.completed_at IS NULL)
        AND public.runly_chat_user_access(s.conversation_id, ${profileId}::uuid)
      ORDER BY (s.remind_at IS NULL), s.remind_at ASC, s.created_at DESC
      LIMIT ${MAX_SAVED}
    `;
    return rows.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      conversationId: row.conversation_id,
      conversation: row.conversation_name || (row.conversation_type === "direct" ? "Mensaje directo" : "Conversación"),
      sender: row.sender_name ?? "Alguien",
      excerpt: plainMentions(row.body).slice(0, EXCERPT),
      remindAt: row.remind_at,
      reminded: Boolean(row.reminded_at),
      completedAt: row.completed_at,
      createdAt: row.created_at,
    }));
  }

  // Worker pass: notifies each person whose reminder is due (claimed first, so a repeat pass never duplicates).
  async function processDueReminders({ limit = 100 } = {}) {
    const rows = await prisma.$queryRaw`
      UPDATE chat_saved_messages s SET reminded_at = NOW()
      WHERE s.id IN (
        SELECT id FROM chat_saved_messages
        WHERE remind_at <= NOW() AND reminded_at IS NULL AND completed_at IS NULL
        ORDER BY remind_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING s.id, s.user_id, s.company_id, s.message_id, s.conversation_id
    `;
    let sent = 0;
    for (const row of rows) {
      try {
        const [message] = await prisma.$queryRaw`SELECT m.body FROM chat_messages m WHERE m.id = ${row.message_id}::uuid`;
        await notificationService?.publish?.({
          companyId: row.company_id.toString(),
          actorId: null,
          input: {
            eventType: "chat.reminder",
            title: "Recordatorio",
            body: plainMentions(message?.body ?? "").slice(0, 140) || "Un mensaje que guardaste",
            link: `/app/m/runly.chat/chat/inbox/${row.conversation_id}?msg=${row.message_id}`,
            priority: "high",
            recipients: { userIds: [row.user_id.toString()] },
            sourceType: "chat_message",
            sourceId: row.message_id.toString(),
            dedupeKey: `chat.reminder:${row.id}:${Date.now()}`,
          },
        });
        sent += 1;
      } catch (error) {
        console.error("[chat.reminders] no se pudo avisar:", error?.message ?? error);
      }
    }
    return { due: rows.length, sent };
  }

  return { save, update, remove, list, processDueReminders };
}
