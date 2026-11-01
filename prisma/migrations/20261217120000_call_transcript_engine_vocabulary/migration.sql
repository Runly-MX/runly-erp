-- Per-transcript engine + vocabulary hint, resolved by the API when the
-- transcript is requested and read by runly-transcriber (table-level grants
-- already cover new columns). Segments keep their pre-correction text so an
-- automatic or manual fix can always be reverted.
ALTER TABLE "call_transcript"
  ADD COLUMN IF NOT EXISTS "requested_engine" VARCHAR(8) NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "vocabulary_prompt" TEXT;

ALTER TABLE "call_transcript_segment"
  ADD COLUMN IF NOT EXISTS "original_text" TEXT;

-- Company-level choice of transcription engine. GROQ sends meeting audio to an
-- external service, so it needs an explicit, recorded consent.
CREATE TABLE IF NOT EXISTS "call_transcription_settings" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "company_id" UUID NOT NULL,
  "engine" VARCHAR(8) NOT NULL DEFAULT 'LOCAL',
  "external_consent_at" TIMESTAMP(3),
  "external_consent_by" UUID,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "call_transcription_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "call_transcription_settings_company_id_key"
  ON "call_transcription_settings" ("company_id");

-- Glossary of company terms. heard_as = '' is a plain vocabulary hint; a
-- non-empty heard_as is also a replacement rule ("Baglet" -> "BACnet").
CREATE TABLE IF NOT EXISTS "call_transcription_term" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "company_id" UUID NOT NULL,
  "term" VARCHAR(80) NOT NULL,
  "heard_as" VARCHAR(80) NOT NULL DEFAULT '',
  "source" VARCHAR(8) NOT NULL DEFAULT 'MANUAL',
  "hits" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "call_transcription_term_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "call_transcription_term_company_id_term_heard_as_key"
  ON "call_transcription_term" ("company_id", "term", "heard_as");
CREATE INDEX IF NOT EXISTS "call_transcription_term_company_id_hits_idx"
  ON "call_transcription_term" ("company_id", "hits");
