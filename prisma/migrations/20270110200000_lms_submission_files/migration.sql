-- runly.lms standalone evaluations, phase 3 (spec 2026-11-21 section 5): every
-- file delivered in an evaluation session, with its version history and the
-- integrity data checked by the server. lms_submission.file_ids keeps the
-- current files (what graders see); replaced and removed versions stay here.

CREATE TABLE "lms_submission_file" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "presigned_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_at" TIMESTAMPTZ(6),
    "after_close" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lms_submission_file_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lms_submission_file_status_chk" CHECK ("status" IN ('active', 'replaced', 'removed')),
    CONSTRAINT "lms_submission_file_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

-- A confirmed upload is recorded once (a repeated confirm returns this row).
CREATE UNIQUE INDEX "lms_submission_file_file_id_key" ON "lms_submission_file"("file_id");
-- One current version per file slot: two concurrent replacements cannot both win.
CREATE UNIQUE INDEX "lms_submission_file_one_active_key" ON "lms_submission_file"("submission_id", "slot") WHERE "status" = 'active';
CREATE UNIQUE INDEX "lms_submission_file_submission_slot_version_key" ON "lms_submission_file"("submission_id", "slot", "version");
CREATE INDEX "lms_submission_file_company_id_idx" ON "lms_submission_file"("company_id");

ALTER TABLE "lms_submission_file" ADD CONSTRAINT "lms_submission_file_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "lms_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lms_submission_file" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "lms_submission_file" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "lms_submission_file" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "lms_submission_file" FROM authenticated; END IF;
END $$;
