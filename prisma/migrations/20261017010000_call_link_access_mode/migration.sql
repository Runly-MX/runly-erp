-- =============================================================================
-- Runly — Calls: guest access mode + PIN on call links
-- Migration: 20261017010000_call_link_access_mode
-- =============================================================================
-- LOBBY: the host admits every guest.
-- PIN:   the right PIN (or a personal email invite) enters directly; anyone
--        else waits in the lobby.
-- OPEN:  anyone with the link or meeting ID enters.
-- require_lobby stays as a derived flag (OPEN => false) for older clients.

ALTER TABLE "call_link"
  ADD COLUMN IF NOT EXISTS "access_mode" VARCHAR(8) NOT NULL DEFAULT 'LOBBY',
  ADD COLUMN IF NOT EXISTS "pin" VARCHAR(6);

UPDATE "call_link" SET "access_mode" = 'OPEN' WHERE "require_lobby" = false;

ALTER TABLE "call_link"
  ADD CONSTRAINT "call_link_access_mode_check" CHECK ("access_mode" IN ('LOBBY', 'PIN', 'OPEN'));
