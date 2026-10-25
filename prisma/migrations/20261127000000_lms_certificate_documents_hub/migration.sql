-- LMS certificates adopt the Documents hub (kind lms.certificate).
-- Each uploaded (docx/pptx/pdf) LmsCertificateTemplate is copied into
-- DocumentTemplate/DocumentTemplateVersion keeping the SAME id, file asset,
-- placeholders and PDF layout, so courses and issued certificates keep
-- resolving. The 'design' source stays in LMS. The old columns stay untouched
-- (they are mirrored from the hub). Idempotent.
ALTER TABLE "lms_certificate_template" ADD COLUMN IF NOT EXISTS "document_template_id" UUID;
CREATE INDEX IF NOT EXISTS "lms_certificate_template_document_template_id_idx" ON "lms_certificate_template"("document_template_id");
DO $$ BEGIN
  ALTER TABLE "lms_certificate_template" ADD CONSTRAINT "lms_certificate_template_document_template_id_fkey"
    FOREIGN KEY ("document_template_id") REFERENCES "document_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "document_template" ("id", "company_id", "key", "name", "source_type", "kind", "format", "is_default", "enabled", "created_at", "updated_at")
SELECT t."id", t."company_id", 'lms-certificate-' || t."id"::text, t."name", 'lms.certificate', 'lms.certificate', t."source", false, t."enabled", t."created_at", t."updated_at"
FROM "lms_certificate_template" t
WHERE t."source" IN ('docx', 'pptx', 'pdf') AND t."file_asset_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "document_template_version" ("id", "template_id", "version_number", "status", "blocks", "file_asset_id", "placeholders", "mapping", "layout", "published_at", "created_at", "updated_at")
SELECT uuidv7(), t."id", 1, 'published', '[]'::jsonb, t."file_asset_id",
  CASE WHEN t."source" = 'pdf'
    THEN COALESCE((SELECT jsonb_agg(f -> 'key') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t."layout" -> 'fields') = 'array' THEN t."layout" -> 'fields' ELSE '[]'::jsonb END) f), '[]'::jsonb)
    ELSE t."placeholders" END,
  '{}'::jsonb,
  CASE WHEN t."source" = 'pdf' THEN t."layout" ELSE NULL END,
  t."created_at", t."created_at", t."updated_at"
FROM "lms_certificate_template" t
WHERE t."source" IN ('docx', 'pptx', 'pdf') AND t."file_asset_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "document_template" d WHERE d."id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "document_template_version" v WHERE v."template_id" = t."id");

UPDATE "document_template" d
SET "published_version_id" = (SELECT v."id" FROM "document_template_version" v WHERE v."template_id" = d."id" ORDER BY v."version_number" DESC LIMIT 1)
WHERE d."kind" = 'lms.certificate' AND d."published_version_id" IS NULL
  AND EXISTS (SELECT 1 FROM "lms_certificate_template" t WHERE t."id" = d."id");

UPDATE "lms_certificate_template" t
SET "document_template_id" = t."id"
WHERE t."document_template_id" IS NULL AND t."source" IN ('docx', 'pptx', 'pdf')
  AND EXISTS (SELECT 1 FROM "document_template" d WHERE d."id" = t."id");
