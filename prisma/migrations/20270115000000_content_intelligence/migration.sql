-- Optional platform capability. No processing or backfill is enabled by migration.
CREATE SCHEMA IF NOT EXISTS runly_content;
REVOKE ALL ON SCHEMA runly_content FROM PUBLIC;

CREATE TABLE runly_content.policy (
  scope text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE runly_content.worker (
  id text PRIMARY KEY,
  capabilities jsonb NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE runly_content.job (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES file_asset(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  object_key text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','done','partial','empty','failed','cancelled','unsupported')),
  priority integer NOT NULL DEFAULT 20,
  manual boolean NOT NULL DEFAULT false,
  quality text NOT NULL DEFAULT 'balanced',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_hash text,
  lease_until timestamptz,
  worker_id text,
  progress integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, revision)
);
CREATE INDEX content_job_claim ON runly_content.job (state, available_at, priority, created_at);
CREATE INDEX content_job_company ON runly_content.job (company_id, state);

CREATE TABLE runly_content.page (
  job_id uuid NOT NULL REFERENCES runly_content.job(id) ON DELETE CASCADE,
  unit integer NOT NULL,
  source text NOT NULL CHECK (source IN ('digital','ocr')),
  reference text NOT NULL,
  text text NOT NULL,
  normalized text NOT NULL,
  words jsonb NOT NULL DEFAULT '[]',
  confidence real,
  engine jsonb NOT NULL DEFAULT '{}',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, normalized)) STORED,
  PRIMARY KEY (job_id, unit)
);
CREATE INDEX content_page_search ON runly_content.page USING gin(search_vector);

CREATE TABLE runly_content.backfill (
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'historical' CHECK (kind IN ('historical','new')),
  state text NOT NULL DEFAULT 'paused' CHECK (state IN ('running','paused','cancelled','done')),
  cursor uuid,
  filters jsonb NOT NULL DEFAULT '{}',
  discovered integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, kind)
);

-- Private schema, no Data API exposure, defense in depth. The API's database
-- owner performs writes; no policies grant access to anon/authenticated.
ALTER TABLE runly_content.policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE runly_content.worker ENABLE ROW LEVEL SECURITY;
ALTER TABLE runly_content.job ENABLE ROW LEVEL SECURITY;
ALTER TABLE runly_content.page ENABLE ROW LEVEL SECURITY;
ALTER TABLE runly_content.backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA runly_content FROM PUBLIC;

CREATE FUNCTION runly_content.invalidate_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_revision IS DISTINCT FROM OLD.content_revision
    OR NEW.object_key IS DISTINCT FROM OLD.object_key
    OR NEW.bucket IS DISTINCT FROM OLD.bucket
    OR NEW.checksum IS DISTINCT FROM OLD.checksum
    OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
    OR NOT NEW.enabled THEN
    DELETE FROM runly_content.job WHERE file_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER content_file_invalidation AFTER UPDATE ON file_asset
  FOR EACH ROW EXECUTE FUNCTION runly_content.invalidate_file();

-- Transactional enqueue covers generic uploads, module attachments and Office writes.
-- No network or document processing occurs in the upload transaction.
CREATE FUNCTION runly_content.enqueue_file() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  g jsonb; c jsonb; pending_count integer; company_count integer;
BEGIN
  IF NOT NEW.enabled OR NEW.entity_id IS NULL THEN RETURN NEW; END IF;
  SELECT config INTO g FROM runly_content.policy WHERE scope='instance';
  SELECT config INTO c FROM runly_content.policy WHERE scope=NEW.entity_id::text;
  IF coalesce(g->>'profile','OFF')='OFF' OR coalesce(c->>'profile','OFF')='OFF'
    OR coalesce((g->>'paused')::boolean,false) OR coalesce((c->>'paused')::boolean,false)
    OR NEW.size_bytes > least(coalesce((g->>'maxFileBytes')::int,10485760),coalesce((c->>'maxFileBytes')::int,10485760))
    OR NOT (NEW.mime_type ~ '^(image/(jpeg|png|webp|tiff|svg\+xml)|application/(pdf|json|xml|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text/[a-z.+-]+)$')
    OR NOT EXISTS (SELECT 1 FROM runly_content.worker WHERE heartbeat_at>now()-interval '90 seconds' AND capabilities->>'governor'='ready')
    THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(71620381);
  SELECT count(*),count(*) FILTER (WHERE company_id=NEW.entity_id)
    INTO pending_count,company_count FROM runly_content.job WHERE state IN ('pending','processing');
  IF pending_count>=4000 OR company_count>=least(coalesce((g->>'maxPending')::int,100),coalesce((c->>'maxPending')::int,100)) THEN RETURN NEW; END IF;
  INSERT INTO runly_content.job(company_id,file_id,revision,object_key,quality,priority)
    VALUES (NEW.entity_id,NEW.id,NEW.content_revision,NEW.object_key,coalesce(c->>'quality','balanced'),10)
    ON CONFLICT (file_id,revision) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER content_file_queue AFTER INSERT OR UPDATE OF content_revision,object_key,bucket,checksum,enabled,entity_id
  ON file_asset FOR EACH ROW EXECUTE FUNCTION runly_content.enqueue_file();
