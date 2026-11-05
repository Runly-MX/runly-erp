-- An item may carry several physical conditions at once (e.g. Nuevo + Sin usar): N:M replaces inv_item.condition_id.
CREATE TABLE "inv_item_condition" (
    "item_id" UUID NOT NULL,
    "condition_id" UUID NOT NULL,

    CONSTRAINT "inv_item_condition_pkey" PRIMARY KEY ("item_id","condition_id")
);

CREATE INDEX "inv_item_condition_condition_id_idx" ON "inv_item_condition"("condition_id");

ALTER TABLE "inv_item_condition" ADD CONSTRAINT "inv_item_condition_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inv_item_condition" ADD CONSTRAINT "inv_item_condition_condition_id_fkey" FOREIGN KEY ("condition_id") REFERENCES "inv_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "inv_item_condition" ("item_id", "condition_id")
SELECT "id", "condition_id" FROM "inv_item" WHERE "condition_id" IS NOT NULL;

ALTER TABLE "inv_item" DROP CONSTRAINT IF EXISTS "inv_item_condition_id_fkey";
DROP INDEX IF EXISTS "inv_item_condition_id_idx";
ALTER TABLE "inv_item" DROP COLUMN "condition_id";
