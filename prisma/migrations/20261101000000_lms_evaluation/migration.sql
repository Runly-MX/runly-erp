-- runly.lms phase 2: quizzes and assignments (spec 2026-10-16-lms-design §11)
-- No CHECK constraints exist on lms_lesson.kind or lms_lesson_progress.status, so the new values need none.
-- AlterTable
ALTER TABLE "lms_lesson" ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "lms_lesson_progress" ADD COLUMN     "extra_attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "lms_quiz_question" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'single',
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_quiz_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_quiz_attempt" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "question_ids" UUID[],
    "option_order" JSONB NOT NULL DEFAULT '{}',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "auto_points" DOUBLE PRECISION,
    "manual_points" JSONB NOT NULL DEFAULT '{}',
    "score_points" DOUBLE PRECISION,
    "max_points" DOUBLE PRECISION,
    "score_pct" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "graded_by_id" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "feedback" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_quiz_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_submission" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "text" TEXT,
    "file_ids" UUID[],
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "graded_by_id" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lms_quiz_question_lesson_id_position_idx" ON "lms_quiz_question"("lesson_id", "position");

-- CreateIndex
CREATE INDEX "lms_quiz_attempt_company_id_status_idx" ON "lms_quiz_attempt"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lms_quiz_attempt_enrollment_id_lesson_id_number_key" ON "lms_quiz_attempt"("enrollment_id", "lesson_id", "number");

-- CreateIndex
CREATE INDEX "lms_submission_company_id_status_idx" ON "lms_submission"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lms_submission_enrollment_id_lesson_id_number_key" ON "lms_submission"("enrollment_id", "lesson_id", "number");

-- AddForeignKey
ALTER TABLE "lms_quiz_question" ADD CONSTRAINT "lms_quiz_question_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lms_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_quiz_attempt" ADD CONSTRAINT "lms_quiz_attempt_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "lms_enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_quiz_attempt" ADD CONSTRAINT "lms_quiz_attempt_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lms_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_submission" ADD CONSTRAINT "lms_submission_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "lms_enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_submission" ADD CONSTRAINT "lms_submission_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lms_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

