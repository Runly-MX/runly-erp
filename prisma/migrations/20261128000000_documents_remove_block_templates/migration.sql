-- Documents v2: the legacy block templates (format = 'blocks') are retired; every
-- template is now a Word/Excel/PowerPoint/PDF file owned by a document kind.
-- Generated documents keep their history and files: they are detached from the
-- block template (template/version null, name kept in metadata) before the
-- block templates and their versions are deleted. File assets are never touched.
-- Idempotent.
UPDATE "generated_document" g
SET "metadata" = COALESCE(g."metadata", '{}'::jsonb) || jsonb_build_object('templateName', t."name", 'legacyBlockTemplate', true),
    "template_id" = NULL,
    "version_id" = NULL
FROM "document_template" t
WHERE g."template_id" = t."id" AND t."format" = 'blocks';

DELETE FROM "document_template_version" v
USING "document_template" t
WHERE v."template_id" = t."id" AND t."format" = 'blocks';

DELETE FROM "document_template" WHERE "format" = 'blocks';
