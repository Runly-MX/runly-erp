-- Simple returns (comments and photos, no signed document) are recorded with formal = false.
ALTER TABLE "inv_custody" ADD COLUMN "formal" BOOLEAN NOT NULL DEFAULT true;
