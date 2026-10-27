-- Durable import saga. Raw SQL service, no client/Data API surface.
-- Keep cleanup intents after an actor/company is removed: deliberately no
-- cascading identity FK that could forget a blob before Storage compensation.
CREATE TABLE studio_interchange_job (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'preparing' CHECK (state IN ('preparing','ready','committed','cleanup','cancelled')),
  target text NOT NULL CHECK (target IN ('design','personal','company')),
  name varchar(160) NOT NULL,
  digest varchar(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes BETWEEN 0 AND 67108864),
  document jsonb,
  manifest jsonb NOT NULL,
  staged jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(staged)='array'),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  lease_until timestamptz NOT NULL DEFAULT now() + interval '2 minutes',
  next_cleanup_at timestamptz DEFAULT now() + interval '30 minutes',
  CHECK (document IS NULL OR octet_length(document::text) <= 4100000),
  CHECK (octet_length(manifest::text) <= 11000000),
  CHECK (octet_length(staged::text) <= 4100000),
  CHECK ((state='committed') = (result IS NOT NULL))
);
CREATE INDEX studio_interchange_active ON studio_interchange_job(company_id,actor_id)
  WHERE state IN ('preparing','ready','cleanup');
CREATE INDEX studio_interchange_cleanup ON studio_interchange_job(next_cleanup_at)
  WHERE state IN ('preparing','ready','cleanup','cancelled');
CREATE INDEX studio_interchange_rate ON studio_interchange_job(company_id,actor_id,created_at);
CREATE INDEX studio_interchange_result ON studio_interchange_job(company_id,(result->>'id')) WHERE state='committed';
ALTER TABLE studio_interchange_job ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON studio_interchange_job FROM PUBLIC, anon, authenticated;
