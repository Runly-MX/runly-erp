-- A custom field can apply to several types: category_id becomes the category_ids list.
ALTER TABLE "inv_custom_field" ADD COLUMN "category_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
UPDATE "inv_custom_field" SET "category_ids" = ARRAY["category_id"] WHERE "category_id" IS NOT NULL;
ALTER TABLE "inv_custom_field" DROP CONSTRAINT IF EXISTS "inv_custom_field_category_id_fkey";
DROP INDEX IF EXISTS "inv_custom_field_category_id_idx";
ALTER TABLE "inv_custom_field" DROP COLUMN "category_id";
CREATE INDEX "inv_custom_field_category_ids_idx" ON "inv_custom_field" USING GIN ("category_ids");
