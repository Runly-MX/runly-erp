-- runly.inventory: events of a bulk alta/baja action share a batch id and size. Additive and nullable.
ALTER TABLE "inv_item_admin_event" ADD COLUMN "batch_id" UUID;
ALTER TABLE "inv_item_admin_event" ADD COLUMN "batch_size" INTEGER;
CREATE INDEX "inv_item_admin_event_batch_id_idx" ON "inv_item_admin_event"("batch_id");
