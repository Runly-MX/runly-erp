-- Free-amount POS lines (no catalog product, no stock) and the appointments switch.
ALTER TABLE "pos_order_line" ADD COLUMN "custom_item" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pos_settings" ADD COLUMN "appointments_enabled" BOOLEAN NOT NULL DEFAULT false;
