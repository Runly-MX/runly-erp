-- Documents: personal vs shared templates. Existing templates stay shared with
-- the company (visibility = 'company') so inventory, LMS and Growth keep working;
-- the owner is backfilled from the user that uploaded the first version.
-- Idempotent.
ALTER TABLE "document_template" ADD COLUMN IF NOT EXISTS "owner_user_id" UUID;
ALTER TABLE "document_template" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'company';

UPDATE "document_template" t
SET "owner_user_id" = v."created_by_id"
FROM "document_template_version" v
WHERE v."template_id" = t."id" AND v."version_number" = 1
  AND t."owner_user_id" IS NULL AND v."created_by_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "document_template_company_id_kind_visibility_owner_user_id_idx"
  ON "document_template" ("company_id", "kind", "visibility", "owner_user_id");
