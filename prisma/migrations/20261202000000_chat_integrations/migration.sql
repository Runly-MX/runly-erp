-- Integrations that post into one chat channel through a secret webhook URL
-- (spec docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 1).
-- Chat tables are written with raw SQL, so this table has no Prisma model.
CREATE TABLE IF NOT EXISTS "chat_integrations" (
  "id"              UUID        NOT NULL DEFAULT uuidv7(),
  "company_id"      UUID        NOT NULL,
  "conversation_id" UUID        NOT NULL,
  "name"            TEXT        NOT NULL,
  "icon"            TEXT,
  "token_hash"      TEXT        NOT NULL,
  "token_hint"      TEXT        NOT NULL,
  "enabled"         BOOLEAN     NOT NULL DEFAULT TRUE,
  "created_by"      UUID,
  "last_used_at"    TIMESTAMPTZ,
  "message_count"   INT         NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "chat_integrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_integrations_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_integrations_token_hash_key" ON "chat_integrations" ("token_hash");
CREATE INDEX IF NOT EXISTS "chat_integrations_conversation_idx" ON "chat_integrations" ("conversation_id");
