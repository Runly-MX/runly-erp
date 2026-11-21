-- runly.lms standalone evaluations, phase 2 (spec 2026-11-21 section 6): the
-- session that owns the single clock of an evaluation attempt. Additive only.

CREATE TABLE "lms_assessment_session" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "graded_at" TIMESTAMPTZ(6),
    "closed_reason" TEXT,
    "time_limit_minutes" INTEGER,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "score_points" DOUBLE PRECISION,
    "max_points" DOUBLE PRECISION,
    "extended_minutes" INTEGER NOT NULL DEFAULT 0,
    "decision" TEXT,
    "decision_note" TEXT,
    "decision_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lms_assessment_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lms_assessment_session_status_chk" CHECK ("status" IN ('in_progress', 'submitted', 'expired', 'graded', 'voided'))
);

CREATE UNIQUE INDEX "lms_assessment_session_enrollment_id_number_key" ON "lms_assessment_session"("enrollment_id", "number");
-- One open session per enrollment: a second concurrent start fails here and gets the first one back.
CREATE UNIQUE INDEX "lms_assessment_session_one_open_key" ON "lms_assessment_session"("enrollment_id") WHERE "status" = 'in_progress';
CREATE INDEX "lms_assessment_session_course_id_idx" ON "lms_assessment_session"("course_id");
CREATE INDEX "lms_assessment_session_status_expires_at_idx" ON "lms_assessment_session"("status", "expires_at");

ALTER TABLE "lms_assessment_session" ADD CONSTRAINT "lms_assessment_session_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lms_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lms_assessment_session" ADD CONSTRAINT "lms_assessment_session_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "lms_enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lms_enrollment" ADD COLUMN "extra_sessions" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "lms_quiz_attempt" ADD COLUMN "session_id" UUID;
CREATE INDEX "lms_quiz_attempt_session_id_idx" ON "lms_quiz_attempt"("session_id");
ALTER TABLE "lms_quiz_attempt" ADD CONSTRAINT "lms_quiz_attempt_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lms_assessment_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lms_submission" ADD COLUMN "session_id" UUID,
  ADD COLUMN "points" DOUBLE PRECISION,
  ADD COLUMN "rubric_scores" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX "lms_submission_session_id_idx" ON "lms_submission"("session_id");
ALTER TABLE "lms_submission" ADD CONSTRAINT "lms_submission_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lms_assessment_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same hardening as the other lms_* tables (20270109100000_lms_rls_hardening).
ALTER TABLE "lms_assessment_session" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "lms_assessment_session" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "lms_assessment_session" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "lms_assessment_session" FROM authenticated; END IF;
END $$;
