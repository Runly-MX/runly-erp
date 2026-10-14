-- runly.inventory custody revision 4: reason an automatic completion failed
-- (cleared on a successful completion or when signatures are cleared).
ALTER TABLE "inv_custody" ADD COLUMN "completion_error" VARCHAR(1000);
