-- Align the DB with schema.prisma: deleting a file asset removes its item links.
ALTER TABLE "inv_item_file" DROP CONSTRAINT "inv_item_file_file_asset_id_fkey";
ALTER TABLE "inv_item_file" ADD CONSTRAINT "inv_item_file_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
