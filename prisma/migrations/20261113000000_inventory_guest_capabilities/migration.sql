-- runly.inventory: per-membership capabilities of supplier guests. Additive; existing rows default to false.
ALTER TABLE "inv_area_member" ADD COLUMN "can_create_models" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inv_area_member" ADD COLUMN "can_import" BOOLEAN NOT NULL DEFAULT false;
