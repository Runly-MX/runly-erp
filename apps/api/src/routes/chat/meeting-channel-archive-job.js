// apps/api/src/routes/chat/meeting-channel-archive-job.js
//
// Channels created by a call (metadata.origin = 'meeting') are archived for their members
// after 14 days without messages or calls, so they stop piling up in the sidebar. Archiving
// is the existing per-member one: the channel stays searchable and can be restored from
// "Archivados". Channels made by people are never touched. Spec
// docs/superpowers/specs/2026-10-26-chat-organization-design.md, section 2.

export const MEETING_INACTIVE_DAYS = 14;

export async function archiveInactiveMeetingChannels({ prisma, inactiveDays = MEETING_INACTIVE_DAYS, limit = 200 }) {
  const rows = await prisma.$queryRaw`
    SELECT c.id
    FROM chat_conversations c
    WHERE c.type = 'channel'
      AND c.deleted_at IS NULL
      AND c.metadata->>'origin' = 'meeting'
      AND COALESCE(c.last_message_at, c.created_at) < NOW() - (${inactiveDays} * INTERVAL '1 day')
      AND NOT EXISTS (
        SELECT 1 FROM call k
        WHERE k.conversation_id = c.id AND (k.status <> 'ENDED' OR k.ended_at > NOW() - (${inactiveDays} * INTERVAL '1 day'))
      )
      AND EXISTS (SELECT 1 FROM chat_conversation_members m WHERE m.conversation_id = c.id AND m.left_at IS NULL AND m.archived_at IS NULL)
    ORDER BY c.created_at ASC
    LIMIT ${limit}
  `;
  if (!rows.length) return { archived: 0 };
  const ids = rows.map((row) => row.id.toString());
  await prisma.$executeRaw`
    UPDATE chat_conversation_members SET archived_at = NOW()
    WHERE conversation_id = ANY(${ids}::uuid[]) AND left_at IS NULL AND archived_at IS NULL
  `;
  return { archived: ids.length };
}
