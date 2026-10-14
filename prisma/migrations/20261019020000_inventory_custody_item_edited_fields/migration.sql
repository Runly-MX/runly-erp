-- runly.inventory custody revision 3: snapshot fields typed by hand on a
-- custody item row survive snapshot refreshes.
ALTER TABLE "inv_custody_item" ADD COLUMN "edited_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
