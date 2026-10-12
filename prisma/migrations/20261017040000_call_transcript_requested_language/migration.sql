-- =============================================================================
-- Runly — Calls: speech language requested for a transcript
-- Migration: 20261017040000_call_transcript_requested_language
-- =============================================================================
-- null = Whisper auto-detects (unreliable on short Spanish clips); new
-- transcripts get the instance default (CALL_TRANSCRIPT_LANGUAGE, "es").

ALTER TABLE "call_transcript"
  ADD COLUMN IF NOT EXISTS "requested_language" VARCHAR(8);
