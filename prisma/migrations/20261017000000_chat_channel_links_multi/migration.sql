-- =============================================================================
-- Runly — Chat: several channels per linked record (e.g. per project)
-- Migration: 20261017000000_chat_channel_links_multi
-- =============================================================================
-- A record (runly.projects project, etc.) can now own any number of channels.
-- The primary one is flagged in metadata.linkPrimary (fallback: the oldest).

DROP INDEX IF EXISTS "chat_conversations_linked_entity_unique";

CREATE INDEX IF NOT EXISTS "chat_conversations_linked_entity_idx"
  ON "chat_conversations" ("company_id", "linked_module", "linked_entity_id")
  WHERE "linked_module" IS NOT NULL AND "deleted_at" IS NULL;

-- Module key drift: early links were written with the legacy atlas.* key,
-- while the frontend now looks them up as runly.projects.
UPDATE "chat_conversations"
  SET "linked_module" = 'runly.projects'
  WHERE "linked_module" = 'atlas.projects';
