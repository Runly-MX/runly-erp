-- =============================================================================
-- Runly — Calls: host can remove a member from a live call
-- Migration: 20261017030000_call_participant_removed
-- =============================================================================
-- REMOVED: taken out of the call by the host; joinCall refuses to let them back
-- into that same call (they can still be rung again explicitly).

ALTER TYPE "CallParticipantStatus" ADD VALUE IF NOT EXISTS 'REMOVED';
