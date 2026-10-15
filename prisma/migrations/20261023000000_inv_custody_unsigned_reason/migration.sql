-- Reason recorded when a custody record is completed without the receiver signature.
ALTER TABLE "inv_custody" ADD COLUMN "unsigned_reason" VARCHAR(500);
