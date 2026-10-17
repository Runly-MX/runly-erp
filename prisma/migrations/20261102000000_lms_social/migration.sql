-- runly.lms phase 3: discussion, reviews and announcements (spec 2026-10-16-lms-design §12)
-- AlterTable
ALTER TABLE "lms_course" ADD COLUMN     "rating_avg" DECIMAL(3,2),
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "lms_comment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "parent_id" UUID,
    "author_learner_id" UUID,
    "author_profile_id" UUID,
    "body" TEXT NOT NULL,
    "is_instructor" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_review" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "reply_body" TEXT,
    "replied_by_id" UUID,
    "replied_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_announcement" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "lms_announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lms_comment_parent_id_created_at_idx" ON "lms_comment"("parent_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lms_review_course_id_learner_id_key" ON "lms_review"("course_id", "learner_id");

-- CreateIndex
CREATE INDEX "lms_announcement_course_id_created_at_idx" ON "lms_announcement"("course_id", "created_at");

-- AddForeignKey
ALTER TABLE "lms_comment" ADD CONSTRAINT "lms_comment_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lms_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_comment" ADD CONSTRAINT "lms_comment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "lms_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_comment" ADD CONSTRAINT "lms_comment_author_learner_id_fkey" FOREIGN KEY ("author_learner_id") REFERENCES "lms_learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_review" ADD CONSTRAINT "lms_review_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lms_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_review" ADD CONSTRAINT "lms_review_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "lms_learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_announcement" ADD CONSTRAINT "lms_announcement_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lms_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: author is exactly one of learner or staff profile.
ALTER TABLE "lms_comment" ADD CONSTRAINT "lms_comment_author_chk" CHECK ((author_learner_id IS NOT NULL) <> (author_profile_id IS NOT NULL));

-- Hand-written: root questions of a lesson, newest first.
CREATE INDEX "lms_comment_lesson_root_idx" ON "lms_comment"("lesson_id", "created_at") WHERE "parent_id" IS NULL;

-- Hand-written: ratings are 1..5.
ALTER TABLE "lms_review" ADD CONSTRAINT "lms_review_rating_chk" CHECK (rating BETWEEN 1 AND 5);
