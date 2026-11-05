-- Date the asset was physically received (independent of purchase and registration dates).
ALTER TABLE "inv_item" ADD COLUMN "received_at" DATE;
