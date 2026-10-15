-- Item folio (TYPE-BRAND-MODEL-N). Optional at the column level so existing rows
-- can be backfilled by scripts/migrations/inventory-folio-backfill.mjs; unique per
-- company only among active items, like asset_tag. Prisma cannot express a
-- partial unique index, so it lives here only.
ALTER TABLE "inv_item" ADD COLUMN "folio" VARCHAR(100);
CREATE UNIQUE INDEX "inv_item_company_folio_active_key" ON "inv_item"("company_id", "folio") WHERE "enabled" = true AND "folio" IS NOT NULL;
CREATE INDEX "inv_item_company_id_folio_idx" ON "inv_item"("company_id", "folio");

ALTER TABLE "inv_category" ADD COLUMN "code" VARCHAR(6);
ALTER TABLE "inv_brand" ADD COLUMN "code" VARCHAR(6);
ALTER TABLE "inv_model" ADD COLUMN "code" VARCHAR(6);

CREATE TABLE "inv_folio_counter" (
  "company_id" UUID NOT NULL,
  "prefix" VARCHAR(100) NOT NULL,
  "last_value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "inv_folio_counter_pkey" PRIMARY KEY ("company_id", "prefix"),
  CONSTRAINT "inv_folio_counter_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
