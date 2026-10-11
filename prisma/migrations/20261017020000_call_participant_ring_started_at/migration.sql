-- =============================================================================
-- Runly — Calls: per-participant ring start (meetings without ringing)
-- Migration: 20261017020000_call_participant_ring_started_at
-- =============================================================================
-- A meeting can start without ringing anyone; members are then rung one by
-- one from the call. Each ring expires on its own, so it needs its own start.

ALTER TABLE "call_participant"
  ADD COLUMN IF NOT EXISTS "ring_started_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "call_participant_ringing_idx"
  ON "call_participant" ("ring_started_at")
  WHERE "status" = 'RINGING';
