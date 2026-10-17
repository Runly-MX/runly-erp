-- runly.lms: lesson thumbnails, lesson resources, certificate templates from uploaded .docx (spec 15)

ALTER TABLE "lms_lesson" ADD COLUMN "cover_file_id" UUID;

CREATE TABLE "lms_lesson_resource" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_lesson_resource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lms_lesson_resource_lesson_id_position_idx" ON "lms_lesson_resource"("lesson_id", "position");

ALTER TABLE "lms_lesson_resource" ADD CONSTRAINT "lms_lesson_resource_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lms_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lms_certificate_template" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'design',
    ADD COLUMN "file_asset_id" UUID,
    ADD COLUMN "placeholders" JSONB NOT NULL DEFAULT '[]';
