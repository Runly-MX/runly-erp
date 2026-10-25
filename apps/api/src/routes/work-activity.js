// "Menciones y actividad" of the chat: what is addressed to the person, in one feed of
// the last 7 days: mentions, replies in threads of their messages, reactions to their
// messages and invitations to channels. Only conversations they belong to, in the active
// company and with access. Spec docs/superpowers/specs/2026-10-26-chat-organization-design.md, section 4.

// Text of a message without mention tokens' ids: "@[id:Ana]" -> "@Ana".
export const plainMentions = (body) => String(body ?? "").replace(/@\[[^:\]\s]+:([^\]]*)\]/g, "@$1").replace(/\s+/g, " ").trim();

export const WINDOW_DAYS = 7;
export const MAX_ITEMS = 40;
const EXCERPT = 140;

const base = (row, kind, extra) => ({
  id: `${kind}:${row.id}`,
  kind,
  conversationId: row.conversation_id,
  conversation: row.conversation_name || (row.conversation_type === "direct" ? "Mensaje directo" : "Conversación"),
  messageId: row.message_id ?? null,
  createdAt: row.created_at,
  unread: !row.last_read_at || new Date(row.last_read_at) < new Date(row.created_at),
  ...extra,
});

export async function loadActivity({ prisma, companyId, profileId, now = new Date() }) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const [mentions, replies, reactions, invites] = await Promise.all([
    prisma.$queryRaw`
      SELECT m.id, m.id AS message_id, m.conversation_id, m.body, m.created_at, conv.title AS conversation_name, conv.type AS conversation_type,
             sender.display_name AS sender_name, cm.last_read_at
      FROM chat_messages m
      JOIN chat_conversations conv ON conv.id = m.conversation_id AND conv.company_id = ${companyId}::uuid AND conv.deleted_at IS NULL
      JOIN chat_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL
      LEFT JOIN user_profile sender ON sender.id = m.sender_user_id
      WHERE m.deleted_at IS NULL AND m.created_at >= ${since} AND m.sender_type = 'user' AND m.sender_user_id <> ${profileId}::uuid
        AND m.body LIKE ${`%@[${profileId}:%`}
        AND public.runly_chat_user_access(m.conversation_id, ${profileId}::uuid)
      ORDER BY m.created_at DESC LIMIT ${MAX_ITEMS}`,
    prisma.$queryRaw`
      SELECT r.id, r.id AS message_id, r.conversation_id, r.body, r.created_at, conv.title AS conversation_name, conv.type AS conversation_type,
             sender.display_name AS sender_name, cm.last_read_at
      FROM chat_messages r
      JOIN chat_messages root ON root.id = r.thread_root_id AND root.sender_user_id = ${profileId}::uuid
      JOIN chat_conversations conv ON conv.id = r.conversation_id AND conv.company_id = ${companyId}::uuid AND conv.deleted_at IS NULL
      JOIN chat_conversation_members cm ON cm.conversation_id = r.conversation_id AND cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL
      LEFT JOIN user_profile sender ON sender.id = r.sender_user_id
      WHERE r.deleted_at IS NULL AND r.created_at >= ${since} AND r.sender_type = 'user' AND r.sender_user_id <> ${profileId}::uuid
        AND public.runly_chat_user_access(r.conversation_id, ${profileId}::uuid)
      ORDER BY r.created_at DESC LIMIT ${MAX_ITEMS}`,
    prisma.$queryRaw`
      SELECT x.id, x.message_id, msg.conversation_id, msg.body, x.created_at, x.emoji, conv.title AS conversation_name, conv.type AS conversation_type,
             who.display_name AS sender_name, cm.last_read_at
      FROM chat_message_reactions x
      JOIN chat_messages msg ON msg.id = x.message_id AND msg.sender_user_id = ${profileId}::uuid AND msg.deleted_at IS NULL
      JOIN chat_conversations conv ON conv.id = msg.conversation_id AND conv.company_id = ${companyId}::uuid AND conv.deleted_at IS NULL
      JOIN chat_conversation_members cm ON cm.conversation_id = msg.conversation_id AND cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL
      LEFT JOIN user_profile who ON who.id = x.user_id
      WHERE x.created_at >= ${since} AND x.user_id <> ${profileId}::uuid
        AND public.runly_chat_user_access(msg.conversation_id, ${profileId}::uuid)
      ORDER BY x.created_at DESC LIMIT ${MAX_ITEMS}`,
    prisma.$queryRaw`
      SELECT cm.id, cm.conversation_id, cm.joined_at AS created_at, conv.title AS conversation_name, conv.type AS conversation_type,
             inviter.display_name AS sender_name, cm.last_read_at
      FROM chat_conversation_members cm
      JOIN chat_conversations conv ON conv.id = cm.conversation_id AND conv.company_id = ${companyId}::uuid AND conv.deleted_at IS NULL
        AND conv.type IN ('channel', 'group') AND conv.created_by_user_id IS DISTINCT FROM ${profileId}::uuid
      LEFT JOIN user_profile inviter ON inviter.id = conv.created_by_user_id
      WHERE cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL AND cm.joined_at >= ${since}
      ORDER BY cm.joined_at DESC LIMIT ${MAX_ITEMS}`,
  ]);
  const items = [
    ...mentions.map((row) => base(row, "mention", { sender: row.sender_name ?? "Alguien", excerpt: plainMentions(row.body).slice(0, EXCERPT) })),
    ...replies.map((row) => base(row, "reply", { sender: row.sender_name ?? "Alguien", excerpt: plainMentions(row.body).slice(0, EXCERPT) })),
    ...reactions.map((row) => base(row, "reaction", { sender: row.sender_name ?? "Alguien", emoji: row.emoji, excerpt: plainMentions(row.body).slice(0, EXCERPT) })),
    ...invites.map((row) => base(row, "invite", { sender: row.sender_name ?? "Alguien", excerpt: "" })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, MAX_ITEMS);
  return { items, unread: items.filter((item) => item.unread).length };
}
