import { Prisma } from "@prisma/client";
import { ChatServiceError } from "./chat-service.js";

// Channel <-> module-record links (linked_module/linked_entity_id). A record
// (e.g. a runly.projects project) can have any number of linked channels;
// one of them is the "primary" (metadata.linkPrimary = true, else the oldest)
// and is what the source module opens by default. The pair of columns is
// generic so future connectors beyond runly.projects need no migration.
export function createChatChannelLinksService({ prisma }) {
  // linkedModule/linkedEntityId must travel together — a row with one set and
  // the other null is a "half-linked" state nothing can resolve. Synchronous
  // (pure validation, no I/O) so callers can call it before touching prisma.
  function assertBothOrNeither(linkedModule, linkedEntityId) {
    const hasModule = linkedModule !== null && linkedModule !== undefined;
    const hasEntityId = linkedEntityId !== null && linkedEntityId !== undefined;
    if (hasModule !== hasEntityId) {
      throw new ChatServiceError("linkedModule y linkedEntityId deben enviarse juntos.", 422);
    }
  }

  // Channels linked to a record that the caller may know about: same company,
  // and either public or one the caller is an active member of. Private
  // channels the caller is not in stay invisible (no metadata leak).
  async function listByLink({ linkedModule, linkedEntityId, companyId, profileId }) {
    const rows = await prisma.$queryRaw`
      SELECT c.id, c.title, c.slug, c.is_public, c.avatar_emoji, c.avatar_file_id,
             c.created_at, COALESCE((c.metadata->>'linkPrimary')::boolean, false) AS link_primary,
             EXISTS (
               SELECT 1 FROM chat_conversation_members m
               WHERE m.conversation_id = c.id AND m.user_id = ${profileId} AND m.left_at IS NULL
             ) AS is_member
      FROM chat_conversations c
      WHERE c.linked_module = ${linkedModule}
        AND c.linked_entity_id = ${linkedEntityId}
        AND c.deleted_at IS NULL
        AND c.company_id = ${companyId}
      ORDER BY c.created_at ASC
    `;
    const channels = rows.filter((row) => row.is_public || row.is_member);
    const primary = channels.find((row) => row.link_primary) ?? channels[0] ?? null;
    return { channels, primaryId: primary?.id ?? null };
  }

  // Marks one channel as the record's primary and clears the flag on its
  // siblings. Clearing (value=false) only touches this channel; the oldest
  // sibling then becomes the implicit primary.
  async function setPrimary(conversationId, value) {
    if (!value) {
      await prisma.$executeRaw`
        UPDATE chat_conversations SET metadata = metadata - 'linkPrimary' WHERE id = ${conversationId}
      `;
      return;
    }
    const [conv] = await prisma.$queryRaw`
      SELECT linked_module, linked_entity_id FROM chat_conversations WHERE id = ${conversationId} LIMIT 1
    `;
    if (!conv?.linked_module) {
      throw new ChatServiceError("El canal no está vinculado a ningún registro.", 422);
    }
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE chat_conversations SET metadata = metadata - 'linkPrimary'
        WHERE linked_module = ${conv.linked_module} AND linked_entity_id = ${conv.linked_entity_id}
          AND id != ${conversationId}
      `,
      prisma.$executeRaw`
        UPDATE chat_conversations SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"linkPrimary": true}'::jsonb
        WHERE id = ${conversationId}
      `,
    ]);
  }

  // SET-clause fragments for updateConversation. Returns [] when `updates`
  // doesn't touch the link, so the caller can spread it unconditionally.
  // Unlinking also drops the primary flag so a later relink starts clean.
  function applyLinkUpdate(updates) {
    if (updates.linkedModule === undefined) return [];
    const sets = [
      Prisma.sql`linked_module = ${updates.linkedModule}`,
      Prisma.sql`linked_entity_id = ${updates.linkedEntityId ?? null}`,
    ];
    if (updates.linkedModule === null) sets.push(Prisma.sql`metadata = metadata - 'linkPrimary'`);
    return sets;
  }

  return { listByLink, setPrimary, assertBothOrNeither, applyLinkUpdate };
}
