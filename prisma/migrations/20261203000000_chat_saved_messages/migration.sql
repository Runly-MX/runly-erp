-- Messages a person saved for later, optionally with a reminder (spec
-- docs/superpowers/specs/2026-10-26-saved-and-reminders-design.md). Chat tables use raw SQL.
CREATE TABLE IF NOT EXISTS "chat_saved_messages" (
  "id"              UUID        NOT NULL DEFAULT uuidv7(),
  "user_id"         UUID        NOT NULL,
  "company_id"      UUID        NOT NULL,
  "message_id"      UUID        NOT NULL,
  "conversation_id" UUID        NOT NULL,
  "remind_at"       TIMESTAMPTZ,
  "reminded_at"     TIMESTAMPTZ,
  "completed_at"    TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "chat_saved_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_saved_messages_message_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_saved_messages_user_message_key" ON "chat_saved_messages" ("user_id", "message_id");
CREATE INDEX IF NOT EXISTS "chat_saved_messages_user_idx" ON "chat_saved_messages" ("user_id", "completed_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "chat_saved_messages_due_idx" ON "chat_saved_messages" ("remind_at") WHERE "reminded_at" IS NULL AND "remind_at" IS NOT NULL;
