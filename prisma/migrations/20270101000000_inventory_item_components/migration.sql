-- Inventory items can be components of a main item (one level; enforced by the API).
ALTER TABLE "inv_item" ADD COLUMN IF NOT EXISTS "parent_item_id" UUID;
CREATE INDEX IF NOT EXISTS "inv_item_parent_item_id_idx" ON "inv_item"("parent_item_id");
DO $$ BEGIN
  ALTER TABLE "inv_item" ADD CONSTRAINT "inv_item_parent_item_id_fkey"
    FOREIGN KEY ("parent_item_id") REFERENCES "inv_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
