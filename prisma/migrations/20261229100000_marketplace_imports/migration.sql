-- ERP E3a: imports from the Marketplace resource feed (E2). Raw tables, no Prisma models.
-- 1. Studio templates reuse studio_interchange_job; `source` keeps the verified provenance
--    (resourceKey, version, releaseId, sha256, publisher, catalog sequence, importer, company).
ALTER TABLE studio_interchange_job ADD COLUMN source jsonb;

-- 2. Automations: inspect -> prepare (this row) -> consent + confirm -> paused SystemAutomation.
--    The row keeps the CLEANED definition and the digest the consent is bound to. Nothing here
--    grants services or creates an automation until the confirm transaction.
CREATE TABLE marketplace_automation_import (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','committed','cancelled')),
  source jsonb NOT NULL,
  definition jsonb NOT NULL,
  definition_digest text NOT NULL CHECK (definition_digest ~ '^[a-f0-9]{64}$'),
  services text[] NOT NULL DEFAULT '{}',
  report jsonb NOT NULL,
  consent jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  confirmed_at timestamptz,
  CHECK ((state = 'committed') = (result IS NOT NULL AND consent IS NOT NULL AND confirmed_at IS NOT NULL))
);
CREATE INDEX marketplace_automation_import_owner_idx ON marketplace_automation_import (company_id, actor_id, created_at DESC);
ALTER TABLE marketplace_automation_import ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketplace_automation_import FROM PUBLIC, anon, authenticated;
