-- Internal official module storage. Applied only by the normal deployment flow.
CREATE TABLE studio_design (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  document jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(document::text) <= 1100000)
);
CREATE INDEX studio_design_owner_updated ON studio_design(company_id, owner_id, updated_at DESC) WHERE enabled;
ALTER TABLE studio_design ENABLE ROW LEVEL SECURITY;
-- The API owns access enforcement. No direct client/Data API access is granted.
REVOKE ALL ON studio_design FROM anon, authenticated;
