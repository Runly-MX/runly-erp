-- Optional GPS point of an inventory item (WGS84 degrees, ~0.1 m precision).
ALTER TABLE "inv_item" ADD COLUMN "latitude" DECIMAL(9, 6);
ALTER TABLE "inv_item" ADD COLUMN "longitude" DECIMAL(9, 6);
