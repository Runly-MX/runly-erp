-- Attendance: flexible shifts, overtime policy, day reviews, forgotten-punch corrections.
-- AlterTable
ALTER TABLE "att_shift" ADD COLUMN     "break_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "day_hours" JSONB;

-- AlterTable
ALTER TABLE "att_settings" ADD COLUMN     "allow_corrections" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "daily_threshold_minutes" INTEGER NOT NULL DEFAULT 480,
ADD COLUMN     "overtime_rounding_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "require_overtime_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City';

-- CreateTable
CREATE TABLE "att_day_review" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approved_minutes" INTEGER,
    "note" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_day_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_correction" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_id" UUID,
    "resolution_note" TEXT,
    "punch_id" UUID,

    CONSTRAINT "att_correction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "att_day_review_company_id_day_idx" ON "att_day_review"("company_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "att_day_review_person_id_day_key" ON "att_day_review"("person_id", "day");

-- CreateIndex
CREATE INDEX "att_correction_company_id_status_requested_at_idx" ON "att_correction"("company_id", "status", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "att_correction_person_id_requested_at_idx" ON "att_correction"("person_id", "requested_at" DESC);

