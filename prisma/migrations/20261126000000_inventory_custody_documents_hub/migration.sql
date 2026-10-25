-- Inventory custody (resguardos) adopts the Documents hub (kind inventory.custody).
-- Each InvDocumentTemplate is copied into DocumentTemplate/DocumentTemplateVersion
-- keeping the SAME id, file asset, placeholders and default flag, so existing
-- references keep resolving. The old tables stay untouched. Idempotent.
ALTER TABLE "inv_custody" ADD COLUMN IF NOT EXISTS "document_template_id" UUID;
CREATE INDEX IF NOT EXISTS "inv_custody_document_template_id_idx" ON "inv_custody"("document_template_id");
DO $$ BEGIN
  ALTER TABLE "inv_custody" ADD CONSTRAINT "inv_custody_document_template_id_fkey"
    FOREIGN KEY ("document_template_id") REFERENCES "document_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "document_template" ("id", "company_id", "key", "name", "source_type", "kind", "format", "is_default", "enabled", "created_at", "updated_at")
SELECT t."id", t."company_id", 'inventory-custody-' || t."id"::text, t."name", 'inventory.custody', 'inventory.custody', t."format", t."is_default", t."enabled", t."created_at", t."updated_at"
FROM "inv_document_template" t
WHERE t."kind" = 'custody'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "document_template_version" ("id", "template_id", "version_number", "status", "blocks", "file_asset_id", "placeholders", "mapping", "published_at", "created_at", "updated_at")
SELECT uuidv7(), t."id", 1, 'published', '[]'::jsonb, t."file_asset_id", t."placeholders", '{}'::jsonb, t."created_at", t."created_at", t."updated_at"
FROM "inv_document_template" t
WHERE t."kind" = 'custody'
  AND EXISTS (SELECT 1 FROM "document_template" d WHERE d."id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "document_template_version" v WHERE v."template_id" = t."id");

UPDATE "document_template" d
SET "published_version_id" = (SELECT v."id" FROM "document_template_version" v WHERE v."template_id" = d."id" ORDER BY v."version_number" DESC LIMIT 1)
WHERE d."kind" = 'inventory.custody' AND d."published_version_id" IS NULL
  AND EXISTS (SELECT 1 FROM "inv_document_template" t WHERE t."id" = d."id");

UPDATE "inv_custody" c
SET "document_template_id" = c."template_id"
WHERE c."template_id" IS NOT NULL AND c."document_template_id" IS NULL
  AND EXISTS (SELECT 1 FROM "document_template" d WHERE d."id" = c."template_id");
