-- Attendance: company policy (evidence retention, photo for QR), kiosk QR secret, evidence purge marker.
-- AlterTable
ALTER TABLE "att_kiosk" ADD COLUMN     "qr_secret" TEXT;

-- AlterTable
ALTER TABLE "att_punch" ADD COLUMN     "evidence_purged_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "att_settings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "evidence_retention_days" INTEGER NOT NULL DEFAULT 30,
    "require_photo_for_qr" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "att_settings_company_id_key" ON "att_settings"("company_id");

