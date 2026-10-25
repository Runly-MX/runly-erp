-- Documents v2 template engine: file-based templates (docx/xlsx/pptx/pdf) per kind.
-- Additive columns plus three relaxed NOT NULLs so data-only generation with the
-- kind's built-in template can be recorded without a template row.
ALTER TABLE "document_template" ADD COLUMN "kind" TEXT;
ALTER TABLE "document_template" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'blocks';
ALTER TABLE "document_template" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "document_template" ADD COLUMN "scope_key" TEXT;
UPDATE "document_template" SET "kind" = 'growth.lead', "format" = 'blocks' WHERE "kind" IS NULL;
ALTER TABLE "document_template" ALTER COLUMN "kind" SET DEFAULT 'growth.lead';
ALTER TABLE "document_template" ALTER COLUMN "kind" SET NOT NULL;
CREATE INDEX "document_template_company_id_kind_scope_key_enabled_idx" ON "document_template"("company_id", "kind", "scope_key", "enabled");

ALTER TABLE "document_template_version" ALTER COLUMN "blocks" SET DEFAULT '[]';
ALTER TABLE "document_template_version" ADD COLUMN "file_asset_id" UUID;
ALTER TABLE "document_template_version" ADD COLUMN "placeholders" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "document_template_version" ADD COLUMN "mapping" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "document_template_version" ADD COLUMN "layout" JSONB;
CREATE INDEX "document_template_version_file_asset_id_idx" ON "document_template_version"("file_asset_id");

ALTER TABLE "generated_document" ADD COLUMN "kind" TEXT;
ALTER TABLE "generated_document" ADD COLUMN "output_format" TEXT NOT NULL DEFAULT 'pdf';
ALTER TABLE "generated_document" ALTER COLUMN "template_id" DROP NOT NULL;
ALTER TABLE "generated_document" ALTER COLUMN "version_id" DROP NOT NULL;
ALTER TABLE "generated_document" ALTER COLUMN "source_id" DROP NOT NULL;
UPDATE "generated_document" SET "kind" = "source_type" WHERE "kind" IS NULL;
