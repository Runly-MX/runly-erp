-- Address an integration receives the button presses of its own messages on (spec
-- docs/superpowers/specs/2026-10-26-interactive-messages-design.md, custom buttons).
-- Sent through the guarded automation HTTP service (https, allowed destinations, signed).
ALTER TABLE "chat_integrations" ADD COLUMN IF NOT EXISTS "callback_url" TEXT;
