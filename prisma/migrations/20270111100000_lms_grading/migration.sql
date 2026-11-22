-- runly.lms standalone evaluations, phase 5 (spec 2026-11-21 section 9):
-- per-evaluation graders and readers, the append-only grading history, and the
-- grader's comment per question of a session attempt.

CREATE TABLE "lms_course_grader" (
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_profile_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'grader',
    "added_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lms_course_grader_pkey" PRIMARY KEY ("course_id", "user_profile_id"),
    CONSTRAINT "lms_course_grader_role_chk" CHECK ("role" IN ('grader', 'reader'))
);
CREATE INDEX "lms_course_grader_company_id_user_profile_id_idx" ON "lms_course_grader"("company_id", "user_profile_id");
ALTER TABLE "lms_course_grader" ADD CONSTRAINT "lms_course_grader_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lms_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only: every grade, regrade, comment, decision and incident with the
-- values before and after, who did it and why.
CREATE TABLE "lms_grade_event" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "session_id" UUID,
    "enrollment_id" UUID,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lms_grade_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lms_grade_event_source_type_chk" CHECK ("source_type" IN ('attempt', 'submission', 'session', 'enrollment'))
);
CREATE INDEX "lms_grade_event_session_id_created_at_idx" ON "lms_grade_event"("session_id", "created_at");
CREATE INDEX "lms_grade_event_course_id_created_at_idx" ON "lms_grade_event"("course_id", "created_at");
ALTER TABLE "lms_grade_event" ADD CONSTRAINT "lms_grade_event_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lms_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lms_grade_event" ADD CONSTRAINT "lms_grade_event_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lms_assessment_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "lms_grade_event_append_only"() RETURNS trigger AS $$
BEGIN
  -- The ON DELETE SET NULL of session_id is the only allowed change.
  IF TG_OP = 'UPDATE' AND NEW."session_id" IS NULL AND OLD."session_id" IS NOT NULL
     AND NEW."action" = OLD."action" AND NEW."before" IS NOT DISTINCT FROM OLD."before" AND NEW."after" IS NOT DISTINCT FROM OLD."after" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'lms_grade_event is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "lms_grade_event_no_update" BEFORE UPDATE ON "lms_grade_event" FOR EACH ROW EXECUTE FUNCTION "lms_grade_event_append_only"();

ALTER TABLE "lms_quiz_attempt" ADD COLUMN "question_feedback" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "lms_course_grader" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lms_grade_event" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "lms_course_grader" FROM PUBLIC;
REVOKE ALL ON "lms_grade_event" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "lms_course_grader" FROM anon; REVOKE ALL ON "lms_grade_event" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "lms_course_grader" FROM authenticated; REVOKE ALL ON "lms_grade_event" FROM authenticated;
  END IF;
END $$;
