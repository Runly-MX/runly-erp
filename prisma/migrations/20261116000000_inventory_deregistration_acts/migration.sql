-- runly.inventory: acta de baja (signed record of an authorized deregistration).
-- See docs/superpowers/specs/2026-10-21-inventory-deregistration-act-design.md.

-- AlterTable
ALTER TABLE "inv_item_admin_event" ADD COLUMN "act_id" UUID;

-- CreateTable
CREATE TABLE "inv_deregistration_act" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "folio" VARCHAR(40) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "batch_id" UUID,
    "effective_date" DATE NOT NULL,
    "reason" VARCHAR(40),
    "comments" VARCHAR(2000),
    "approver_id" UUID,
    "approver_name" VARCHAR(200) NOT NULL,
    "approver_title" VARCHAR(200),
    "signature_file_id" UUID,
    "document_file_id" UUID,
    "item_count" INTEGER NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_deregistration_act_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inv_deregistration_act_company_id_folio_key" ON "inv_deregistration_act"("company_id", "folio");
CREATE INDEX "inv_deregistration_act_company_id_effective_date_idx" ON "inv_deregistration_act"("company_id", "effective_date");
CREATE INDEX "inv_deregistration_act_batch_id_idx" ON "inv_deregistration_act"("batch_id");
CREATE INDEX "inv_item_admin_event_act_id_idx" ON "inv_item_admin_event"("act_id");
