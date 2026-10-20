import { resolveUserProfileId } from "./chat-service.js";

export class ChatReactionsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ChatReactionsError";
    this.status = status;
  }
}

export function createChatReactionsService({ prisma, broadcaster = null }) {
  // Tells every member's open clients to refetch the message's reactions.
  async function broadcastReaction(conversationId, messageId) {
    if (!broadcaster || !conversationId) return;
    try {
      const members = await prisma.$queryRaw`
        SELECT user_id FROM chat_conversation_members WHERE conversation_id = ${conversationId}::uuid AND left_at IS NULL
      `;
      await broadcaster.broadcastToUsers(members.map((m) => m.user_id.toString()), "chat.message.reaction", { conversationId, messageId });
    } catch {
      // Best effort: clients still refetch on focus and every 30 s.
    }
  }

  // attachmentId omitted/null = message-level reaction (unchanged behavior).
  // attachmentId set = scoped to that one attachment inside the message —
  // toggled independently from the message-level reaction set and from
  // every other attachment's own reactions.
  async function toggleReaction({ messageId, authUserId, emoji, attachmentId = null }) {
    const profileId = await resolveUserProfileId(prisma, authUserId);

    const rows = await prisma.$queryRaw`
      SELECT m.id, m.conversation_id FROM chat_messages m
      INNER JOIN chat_conversation_members ccm
        ON ccm.conversation_id = m.conversation_id AND ccm.user_id = ${profileId} AND ccm.left_at IS NULL
      WHERE m.id = ${messageId} AND m.deleted_at IS NULL
      LIMIT 1
    `;
    if (!rows.length) throw new ChatReactionsError("Mensaje no encontrado.", 404);

    if (attachmentId) {
      const attRows = await prisma.$queryRaw`
        SELECT id FROM chat_attachments WHERE id = ${attachmentId} AND message_id = ${messageId} LIMIT 1
      `;
      if (!attRows.length) throw new ChatReactionsError("Archivo no encontrado.", 404);
    }

    // IS NOT DISTINCT FROM (not =) so a NULL attachmentId still matches NULL
    // rows — plain `=` never matches NULL in SQL, which would silently break
    // the message-level (attachmentId omitted) toggle-off path entirely.
    const existing = await prisma.$queryRaw`
      SELECT id FROM chat_message_reactions
      WHERE message_id = ${messageId}
        AND attachment_id IS NOT DISTINCT FROM ${attachmentId}
        AND user_id = ${profileId} AND emoji = ${emoji}
      LIMIT 1
    `;

    const conversationId = rows[0].conversation_id?.toString?.() ?? null;
    if (existing.length) {
      await prisma.$executeRaw`DELETE FROM chat_message_reactions WHERE id = ${existing[0].id}`;
      await broadcastReaction(conversationId, messageId);
      return { added: false, emoji, attachmentId };
    }

    // No ON CONFLICT here (unlike a plain single-constraint table): the two
    // partial unique indexes from the migration would each need their own
    // differently-shaped ON CONFLICT target depending on whether
    // attachmentId is null, which raw SQL can't branch on inline. The
    // pre-check above already covers the common case; a genuine concurrent
    // double-click race is a pre-existing, documented, low-severity
    // possibility (spec Section 24 risk 2) that already existed for
    // message-level reactions before this change.
    await prisma.$queryRaw`
      INSERT INTO chat_message_reactions (message_id, attachment_id, user_id, emoji)
      VALUES (${messageId}, ${attachmentId}, ${profileId}, ${emoji})
      RETURNING id
    `;
    await broadcastReaction(conversationId, messageId);
    return { added: true, emoji, attachmentId };
  }

  return { toggleReaction };
}
