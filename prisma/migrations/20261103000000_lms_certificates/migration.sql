-- runly.lms phase 4: certificate templates and issued certificates (spec 2026-10-16-lms-design §13)
-- AlterTable
ALTER TABLE "lms_course" ADD COLUMN     "certificate_template_id" UUID;

-- CreateTable
CREATE TABLE "lms_certificate_template" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Certificado de finalización',
    "body" TEXT,
    "signer_name" TEXT,
    "signer_title" TEXT,
    "signature_file_id" UUID,
    "accent_color" TEXT,
    "show_logo" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_certificate_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_certificate" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "template_id" UUID,
    "folio" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "learner_name" TEXT NOT NULL,
    "course_title" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lms_certificate_template_company_id_enabled_idx" ON "lms_certificate_template"("company_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "lms_certificate_token_key" ON "lms_certificate"("token");

-- CreateIndex
CREATE INDEX "lms_certificate_course_id_idx" ON "lms_certificate"("course_id");

-- CreateIndex
CREATE INDEX "lms_certificate_learner_id_idx" ON "lms_certificate"("learner_id");

-- CreateIndex
CREATE INDEX "lms_certificate_enrollment_id_idx" ON "lms_certificate"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "lms_certificate_company_id_folio_key" ON "lms_certificate"("company_id", "folio");

-- AddForeignKey
ALTER TABLE "lms_course" ADD CONSTRAINT "lms_course_certificate_template_id_fkey" FOREIGN KEY ("certificate_template_id") REFERENCES "lms_certificate_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_certificate" ADD CONSTRAINT "lms_certificate_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "lms_enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lms_certificate" ADD CONSTRAINT "lms_certificate_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "lms_certificate_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written: one valid (not revoked) certificate per enrollment.
CREATE UNIQUE INDEX "lms_certificate_enrollment_valid_key" ON "lms_certificate"("enrollment_id") WHERE "revoked_at" IS NULL;
