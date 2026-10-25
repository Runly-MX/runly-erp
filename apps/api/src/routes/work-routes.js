// "Mi trabajo": what in chat is addressed to the person. Mentions are tokens
// `@[<profileId>:<name>]` inside message bodies (see lib/mention-utils.js); only
// conversations the person belongs to, in the active company, with access, are read.
import { Hono } from "hono";

const WINDOW_DAYS = 7;
const MAX_ITEMS = 20;
const EXCERPT = 140;

// Text of a message without mention tokens' ids: "@[id:Ana]" -> "@Ana".
export const plainMentions = (body) => String(body ?? "").replace(/@\[[^:\]\s]+:([^\]]*)\]/g, "@$1").replace(/\s+/g, " ").trim();

export function createWorkRouter({ prisma, requireActiveCompany }) {
  const app = new Hono();

  app.get("/work/mentions", requireActiveCompany, async (c) => {
    const companyId = c.get("companyId");
    const profileId = c.get("userContext")?.profile?.id ?? c.get("userId");
    if (!companyId || !profileId) return c.json({ data: { items: [], unread: 0 } });
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const rows = await prisma.$queryRaw`
      SELECT m.id, m.conversation_id, m.body, m.created_at, conv.title AS conversation_name, conv.type AS conversation_type,
             sender.display_name AS sender_name, cm.last_read_at
      FROM chat_messages m
      JOIN chat_conversations conv ON conv.id = m.conversation_id AND conv.company_id = ${companyId}::uuid AND conv.deleted_at IS NULL
      JOIN chat_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL
      LEFT JOIN user_profile sender ON sender.id = m.sender_user_id
      WHERE m.deleted_at IS NULL
        AND m.created_at >= ${since}
        AND m.sender_type = 'user'
        AND m.sender_user_id <> ${profileId}::uuid
        AND m.body LIKE ${`%@[${profileId}:%`}
        AND public.runly_chat_user_access(m.conversation_id, ${profileId}::uuid)
      ORDER BY m.created_at DESC
      LIMIT ${MAX_ITEMS}
    `;
    const items = rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      conversation: row.conversation_name || (row.conversation_type === "direct" ? "Mensaje directo" : "Conversación"),
      sender: row.sender_name ?? "Alguien",
      excerpt: plainMentions(row.body).slice(0, EXCERPT),
      createdAt: row.created_at,
      unread: !row.last_read_at || new Date(row.last_read_at) < new Date(row.created_at),
    }));
    return c.json({ data: { items, unread: items.filter((item) => item.unread).length } });
  });

  return app;
}
