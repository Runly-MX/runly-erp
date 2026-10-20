-- runly.inventory: areas (nested folders) and per-user area membership

CREATE TABLE "inv_area" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_area_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inv_area_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_area_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "inv_area"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "inv_area_company_id_parent_id_idx" ON "inv_area"("company_id", "parent_id");
CREATE UNIQUE INDEX "inv_area_company_parent_name_key" ON "inv_area"("company_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("name")) WHERE "enabled";

CREATE TABLE "inv_area_member" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "area_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'viewer',
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_area_member_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inv_area_member_role_check" CHECK ("role" IN ('viewer','editor','manager')),
    CONSTRAINT "inv_area_member_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "inv_area"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_area_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inv_area_member_area_id_user_id_key" ON "inv_area_member"("area_id", "user_id");
CREATE INDEX "inv_area_member_user_id_idx" ON "inv_area_member"("user_id");

ALTER TABLE "inv_item" ADD COLUMN "area_id" UUID;
ALTER TABLE "inv_item" ADD CONSTRAINT "inv_item_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "inv_area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "inv_item_company_id_area_id_idx" ON "inv_item"("company_id", "area_id");
