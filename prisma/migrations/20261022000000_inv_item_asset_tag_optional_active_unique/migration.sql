-- Asset number is optional (legacy imports must not invent one) and only has to
-- be unique among active items: a logically deleted item (enabled = false)
-- no longer blocks its number. Prisma cannot express a partial unique index,
-- so it lives here only.
ALTER TABLE "inv_item" ALTER COLUMN "asset_tag" DROP NOT NULL;
DROP INDEX IF EXISTS "inv_item_company_id_asset_tag_key";
CREATE UNIQUE INDEX "inv_item_company_asset_tag_active_key" ON "inv_item"("company_id", "asset_tag") WHERE "enabled" = true AND "asset_tag" IS NOT NULL;
CREATE INDEX "inv_item_company_id_asset_tag_idx" ON "inv_item"("company_id", "asset_tag");
