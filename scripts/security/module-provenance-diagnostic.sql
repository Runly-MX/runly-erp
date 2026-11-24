-- Installed custom module provenance (F1A, P0-01). READ ONLY.
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/security/module-provenance-diagnostic.sql
-- Lists every custom.* module with how its code arrived, so packages uploaded
-- by a company admin before the code-authority gate can be reviewed. It prints
-- module keys, flags, dates and actor ids only (no record data, no secrets).
-- Review rule: anything not "builder-compiler" / "runly-official-signature" /
-- "platform-owner", or a detached Builder project, needs a manual code review
-- of modules/custom/<key>/ (api/, module.manifest.js, models/, views/).

BEGIN TRANSACTION READ ONLY;

WITH audit AS (
  SELECT module_key, action, actor_id, created_at,
         CASE jsonb_typeof(after) WHEN 'string' THEN (after #>> '{}')::jsonb ELSE after END AS after
  FROM audit_log
  WHERE module_key LIKE 'custom.%' AND action IN ('core.module.package.upload', 'core.module.package.publish', 'core.module.package.update')
), last_upload AS (
  SELECT DISTINCT ON (module_key) module_key, actor_id, created_at, after ->> 'codeAuthority' AS code_authority
  FROM audit WHERE action = 'core.module.package.upload' ORDER BY module_key, created_at DESC
), uploads AS (
  SELECT module_key, count(*) AS uploads, count(*) FILTER (WHERE after ->> 'codeAuthority' IS NULL) AS uploads_before_gate
  FROM audit WHERE action = 'core.module.package.upload' GROUP BY module_key
)
SELECT m.key, m.status, m.enabled, m.has_bundle,
  (p.module_key IS NOT NULL) AS builder_project, (p.detached_at IS NOT NULL) AS builder_detached,
  (c.key IS NOT NULL) AS catalog_install,
  coalesce(c.value::jsonb ->> 'official', 'n/a') AS catalog_official,
  coalesce(u.uploads, 0) AS uploads, coalesce(u.uploads_before_gate, 0) AS uploads_before_gate,
  l.code_authority AS last_code_authority, l.actor_id AS last_upload_actor, l.created_at AS last_upload_at,
  CASE
    WHEN l.code_authority IN ('builder-compiler', 'runly-official-signature', 'platform-owner') AND p.detached_at IS NULL THEN 'OK_AFTER_GATE'
    WHEN p.module_key IS NOT NULL AND p.detached_at IS NULL AND coalesce(u.uploads_before_gate, 0) = 0 THEN 'BUILDER_ONLY'
    WHEN c.key IS NOT NULL AND c.value::jsonb ->> 'official' = 'true' THEN 'OFFICIAL_CATALOG'
    ELSE 'REVIEW_CODE'
  END AS verdict
FROM runly_module m
LEFT JOIN module_builder_project p ON p.module_key = m.key
LEFT JOIN instance_config c ON c.key = 'catalog.installed.' || m.key
LEFT JOIN uploads u ON u.module_key = m.key
LEFT JOIN last_upload l ON l.module_key = m.key
WHERE m.key LIKE 'custom.%'
ORDER BY verdict DESC, m.key;

ROLLBACK;
