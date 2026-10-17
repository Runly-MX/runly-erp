-- runly.lms foundation (spec 2026-10-16-lms-design)

-- CreateTable
CREATE TABLE "lms_course" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "cover_file_id" UUID,
    "category" TEXT,
    "level" TEXT NOT NULL DEFAULT 'basic',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "sequential" BOOLEAN NOT NULL DEFAULT false,
    "self_enroll" BOOLEAN NOT NULL DEFAULT false,
    "estimated_minutes" INTEGER,
    "created_by_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_section" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_lesson" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "file_id" UUID,
    "embed_url" TEXT,
    "duration_seconds" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "preview" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_learner" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "user_profile_id" UUID,
    "contact_id" UUID,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_learner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_enrollment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'self',
    "assigned_by_id" UUID,
    "due_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "last_lesson_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_lesson_progress" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "max_position_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lms_course_company_id_status_idx" ON "lms_course"("company_id", "status");

-- CreateIndex
CREATE INDEX "lms_section_course_id_position_idx" ON "lms_section"("course_id", "position");

-- CreateIndex
CREATE INDEX "lms_lesson_course_id_idx" ON "lms_lesson"("course_id");

-- CreateIndex
CREATE INDEX "lms_lesson_section_id_position_idx" ON "lms_lesson"("section_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lms_learner_company_id_user_profile_id_key" ON "lms_learner"("company_id", "user_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "lms_learner_company_id_contact_id_key" ON "lms_learner"("company_id", "contact_id");

-- CreateIndex
CREATE INDEX "lms_enrollment_learner_id_status_idx" ON "lms_enrollment"("learner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lms_enrollment_course_id_learner_id_key" ON "lms_enrollment"("course_id", "learner_id");

-- CreateIndex
CREATE UNIQUE INDEX "lms_lesson_progress_enrollment_id_lesson_id_key" ON "lms_lesson_progress"("enrollment_id", "lesson_id");

-- AddForeignKey
ALTER TABLE "lms_section" ADD CONSTRAINT "lms_section_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lms_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_lesson" ADD CONSTRAINT "lms_lesson_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "lms_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_enrollment" ADD CONSTRAINT "lms_enrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lms_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_enrollment" ADD CONSTRAINT "lms_enrollment_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "lms_learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_lesson_progress" ADD CONSTRAINT "lms_lesson_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "lms_enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_lesson_progress" ADD CONSTRAINT "lms_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lms_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A learner is exactly one subject: an internal user or a contact.
ALTER TABLE "lms_learner" ADD CONSTRAINT "lms_learner_subject_chk" CHECK ((user_profile_id IS NOT NULL) <> (contact_id IS NOT NULL));
