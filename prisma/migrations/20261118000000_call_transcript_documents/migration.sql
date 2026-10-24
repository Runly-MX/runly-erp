-- Long-transcript documents (minuta / resumen ejecutivo). Additive: new table only.
CREATE TABLE "call_transcript_document" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "transcript_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "progress_done" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "notes" JSONB,
    "content" JSONB,
    "model" TEXT,
    "failure_reason" TEXT,
    "generated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_transcript_document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_transcript_document_transcript_id_kind_key" ON "call_transcript_document"("transcript_id", "kind");

CREATE INDEX "call_transcript_document_company_id_idx" ON "call_transcript_document"("company_id");

ALTER TABLE "call_transcript_document" ADD CONSTRAINT "call_transcript_document_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "call_transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
