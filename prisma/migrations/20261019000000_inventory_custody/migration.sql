-- runly.inventory custody records (resguardos) and document templates (spec 2026-10-13-inventory-custody-design)
-- CreateTable
CREATE TABLE "inv_custody" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "folio" VARCHAR(40) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'DELIVERY',
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "employee_id" UUID NOT NULL,
    "deliverer_id" UUID,
    "deliverer_name" VARCHAR(200),
    "date" DATE NOT NULL,
    "comments" VARCHAR(2000),
    "public_token_hash" CHAR(64),
    "token_expires_at" TIMESTAMP(3),
    "receiver_signature_file_id" UUID,
    "deliverer_signature_file_id" UUID,
    "receiver_signed_at" TIMESTAMP(3),
    "deliverer_signed_at" TIMESTAMP(3),
    "document_file_id" UUID,
    "template_id" UUID,
    "source" VARCHAR(20) NOT NULL DEFAULT 'runly',
    "legacy_id" VARCHAR(64),
    "created_by_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_custody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_custody_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "custody_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "assignment_id" UUID,
    "type_brand" VARCHAR(255),
    "model" VARCHAR(255),
    "serial_number" VARCHAR(255),
    "asset_tag" VARCHAR(100),
    "invoice_number" VARCHAR(100),
    "features" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inv_custody_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_document_template" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL DEFAULT 'custody',
    "format" VARCHAR(10) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "placeholders" JSONB NOT NULL DEFAULT '[]',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_document_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inv_custody_public_token_hash_key" ON "inv_custody"("public_token_hash");

-- CreateIndex
CREATE INDEX "inv_custody_company_id_status_idx" ON "inv_custody"("company_id", "status");

-- CreateIndex
CREATE INDEX "inv_custody_employee_id_idx" ON "inv_custody"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_custody_company_id_folio_key" ON "inv_custody"("company_id", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "inv_custody_company_id_legacy_id_key" ON "inv_custody"("company_id", "legacy_id");

-- CreateIndex
CREATE INDEX "inv_custody_item_item_id_idx" ON "inv_custody_item"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_custody_item_custody_id_item_id_key" ON "inv_custody_item"("custody_id", "item_id");

-- CreateIndex
CREATE INDEX "inv_document_template_company_id_kind_enabled_idx" ON "inv_document_template"("company_id", "kind", "enabled");

-- AddForeignKey
ALTER TABLE "inv_custody" ADD CONSTRAINT "inv_custody_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_custody" ADD CONSTRAINT "inv_custody_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hr_employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_custody" ADD CONSTRAINT "inv_custody_deliverer_id_fkey" FOREIGN KEY ("deliverer_id") REFERENCES "user_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_custody" ADD CONSTRAINT "inv_custody_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_custody" ADD CONSTRAINT "inv_custody_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "inv_document_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_custody_item" ADD CONSTRAINT "inv_custody_item_custody_id_fkey" FOREIGN KEY ("custody_id") REFERENCES "inv_custody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_custody_item" ADD CONSTRAINT "inv_custody_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_custody_item" ADD CONSTRAINT "inv_custody_item_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "inv_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_document_template" ADD CONSTRAINT "inv_document_template_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_document_template" ADD CONSTRAINT "inv_document_template_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "inv_custody" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "inv_custody" FROM PUBLIC, anon, authenticated;

ALTER TABLE "inv_custody_item" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "inv_custody_item" FROM PUBLIC, anon, authenticated;

ALTER TABLE "inv_document_template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "inv_document_template" FROM PUBLIC, anon, authenticated;
