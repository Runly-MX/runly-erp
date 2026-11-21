-- runly.lms standalone evaluations, phase 1 (spec 2026-11-21-lms-standalone-evaluations-design).
-- An evaluation is an lms_course row with kind = 'assessment'; its activities are
-- lms_lesson rows without a section. Additive only: existing rows become kind = 'course'.

ALTER TABLE "lms_course"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'course',
  ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "lms_course_kind_chk" CHECK ("kind" IN ('course', 'assessment'));

CREATE INDEX "lms_course_company_id_kind_status_idx" ON "lms_course"("company_id", "kind", "status");

ALTER TABLE "lms_lesson" ALTER COLUMN "section_id" DROP NOT NULL;

CREATE INDEX "lms_lesson_activity_position_idx" ON "lms_lesson"("course_id", "position") WHERE "section_id" IS NULL;

-- Parent invariant: a lesson has a section iff its course is a course; an
-- evaluation's activities have none. Enforced here, not only in services.
CREATE FUNCTION lms_lesson_parent_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  course_kind TEXT;
  section_course UUID;
BEGIN
  SELECT "kind" INTO course_kind FROM "lms_course" WHERE "id" = NEW."course_id";
  IF course_kind IS NULL THEN
    RAISE EXCEPTION 'lms_lesson: course % does not exist', NEW."course_id" USING ERRCODE = '23503';
  END IF;
  IF course_kind = 'assessment' AND NEW."section_id" IS NOT NULL THEN
    RAISE EXCEPTION 'lms_lesson: assessment activities have no section' USING ERRCODE = '23514';
  END IF;
  IF course_kind = 'course' THEN
    IF NEW."section_id" IS NULL THEN
      RAISE EXCEPTION 'lms_lesson: course lessons need a section' USING ERRCODE = '23514';
    END IF;
    SELECT "course_id" INTO section_course FROM "lms_section" WHERE "id" = NEW."section_id";
    IF section_course IS DISTINCT FROM NEW."course_id" THEN
      RAISE EXCEPTION 'lms_lesson: section belongs to another course' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER lms_lesson_parent_check BEFORE INSERT OR UPDATE OF "course_id", "section_id" ON "lms_lesson"
  FOR EACH ROW EXECUTE FUNCTION lms_lesson_parent_check();

CREATE FUNCTION lms_section_parent_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "lms_course" WHERE "id" = NEW."course_id" AND "kind" = 'course') THEN
    RAISE EXCEPTION 'lms_section: sections belong to courses only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER lms_section_parent_check BEFORE INSERT OR UPDATE OF "course_id" ON "lms_section"
  FOR EACH ROW EXECUTE FUNCTION lms_section_parent_check();

CREATE FUNCTION lms_course_kind_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN
    RAISE EXCEPTION 'lms_course: kind cannot change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER lms_course_kind_immutable BEFORE UPDATE OF "kind" ON "lms_course"
  FOR EACH ROW EXECUTE FUNCTION lms_course_kind_immutable();
