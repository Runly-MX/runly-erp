-- Progress of a transcript while the worker processes it, written by
-- runly-transcriber (table-level UPDATE grant already covers new columns).
ALTER TABLE "call_transcript"
  ADD COLUMN IF NOT EXISTS "progress_stage" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "progress_percent" SMALLINT;
