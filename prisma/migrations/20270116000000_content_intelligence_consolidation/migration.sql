-- Additive consolidation; leaves all policies OFF and does not start any backfill.
ALTER TABLE runly_content.job ADD COLUMN policy_snapshot jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN pipeline_key text,
  ADD COLUMN completed_units integer NOT NULL DEFAULT 0,
  ADD COLUMN total_units integer,
  ADD COLUMN derived_bytes bigint NOT NULL DEFAULT 0,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN finished_at timestamptz,
  ADD COLUMN elapsed_ms integer NOT NULL DEFAULT 0;
CREATE INDEX content_job_recent ON runly_content.job(company_id,updated_at DESC);
CREATE INDEX content_job_recent_global ON runly_content.job(updated_at DESC);
ALTER TABLE runly_content.backfill ADD COLUMN enqueued integer NOT NULL DEFAULT 0,
  ADD COLUMN omitted integer NOT NULL DEFAULT 0;
UPDATE runly_content.job j SET completed_units=p.units,derived_bytes=p.bytes FROM (
  SELECT job_id,count(*)::int AS units,sum(octet_length(text)+octet_length(normalized)+pg_column_size(words)+pg_column_size(engine)) AS bytes
  FROM runly_content.page GROUP BY job_id) p WHERE j.id=p.job_id;
CREATE TABLE runly_content.attempt (
  job_id uuid NOT NULL REFERENCES runly_content.job(id) ON DELETE CASCADE,
  number integer NOT NULL,
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  elapsed_ms integer NOT NULL DEFAULT 0,
  cpu_ms integer NOT NULL DEFAULT 0,
  peak_rss_bytes bigint,
  second_passes integer NOT NULL DEFAULT 0,
  error_code text,
  engine jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY(job_id,number)
);
CREATE INDEX content_attempt_daily ON runly_content.attempt(company_id,started_at);
CREATE INDEX content_attempt_finished ON runly_content.attempt(finished_at DESC) WHERE finished_at IS NOT NULL;
CREATE TABLE runly_content.maintenance(key text PRIMARY KEY,last_run timestamptz NOT NULL DEFAULT now());
ALTER TABLE runly_content.maintenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON runly_content.maintenance FROM PUBLIC;
CREATE TABLE runly_content.totals (
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  state text NOT NULL,
  jobs bigint NOT NULL DEFAULT 0,
  derived_bytes bigint NOT NULL DEFAULT 0,
  units bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(company_id,state)
);
INSERT INTO runly_content.totals(company_id,state,jobs,derived_bytes,units)
  SELECT company_id,state,count(*),sum(derived_bytes),sum(completed_units) FROM runly_content.job GROUP BY company_id,state;
ALTER TABLE runly_content.attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE runly_content.totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON runly_content.attempt,runly_content.totals FROM PUBLIC;
CREATE FUNCTION runly_content.update_totals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    UPDATE runly_content.totals SET jobs=jobs-1,derived_bytes=derived_bytes-OLD.derived_bytes,units=units-OLD.completed_units
      WHERE company_id=OLD.company_id AND state=OLD.state;
  END IF;
  IF TG_OP<>'DELETE' THEN
    INSERT INTO runly_content.totals(company_id,state,jobs,derived_bytes,units)
      VALUES (NEW.company_id,NEW.state,1,NEW.derived_bytes,NEW.completed_units)
      ON CONFLICT(company_id,state) DO UPDATE SET jobs=runly_content.totals.jobs+1,
        derived_bytes=runly_content.totals.derived_bytes+EXCLUDED.derived_bytes,units=runly_content.totals.units+EXCLUDED.units;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER content_job_totals AFTER INSERT OR UPDATE OF state,derived_bytes,completed_units OR DELETE ON runly_content.job
  FOR EACH ROW EXECUTE FUNCTION runly_content.update_totals();

-- Queue admission must respect the same explicit switches as the runtime.
CREATE OR REPLACE FUNCTION runly_content.enqueue_file() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g jsonb; c jsonb; pending_count integer; company_count integer; is_image boolean;
BEGIN
  IF NOT NEW.enabled OR NEW.entity_id IS NULL THEN RETURN NEW; END IF;
  SELECT config INTO g FROM runly_content.policy WHERE scope='instance';
  SELECT config INTO c FROM runly_content.policy WHERE scope=NEW.entity_id::text;
  IF coalesce(g->>'profile','OFF')='OFF' OR coalesce(c->>'profile','OFF')='OFF'
    OR coalesce((g->>'paused')::boolean,false) OR coalesce((c->>'paused')::boolean,false)
    OR NOT coalesce((g->>'automaticProcessing')::boolean,true) OR NOT coalesce((c->>'automaticProcessing')::boolean,true)
    OR NEW.size_bytes>least(coalesce((g->>'maxFileBytes')::int,10485760),coalesce((c->>'maxFileBytes')::int,10485760))
    OR NOT (NEW.mime_type ~ '^(image/(jpeg|png|webp|tiff|svg\+xml)|application/(pdf|json|xml|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text/[a-z.+-]+)$')
    OR (jsonb_array_length(coalesce(g->'allowedMimeTypes','[]'))>0 AND NOT (g->'allowedMimeTypes' ? NEW.mime_type))
    OR (jsonb_array_length(coalesce(c->'allowedMimeTypes','[]'))>0 AND NOT (c->'allowedMimeTypes' ? NEW.mime_type))
    OR NOT EXISTS(SELECT 1 FROM runly_content.worker WHERE heartbeat_at>now()-interval '90 seconds'
      AND capabilities->>'governor'='ready' AND coalesce((capabilities->>'protocol')::int,1)>=2)
    THEN RETURN NEW; END IF;
  is_image := NEW.mime_type LIKE 'image/%' AND NEW.mime_type<>'image/svg+xml';
  IF is_image AND (g->>'profile'='LIGHT' OR c->>'profile'='LIGHT'
    OR NOT coalesce((g->>'autoOcr')::boolean,true) OR NOT coalesce((c->>'autoOcr')::boolean,true)
    OR NOT coalesce((g->>'imageOcr')::boolean,true) OR NOT coalesce((c->>'imageOcr')::boolean,true)) THEN RETURN NEW; END IF;
  IF NOT is_image AND NOT coalesce((g->>'digitalExtraction')::boolean,true) OR NOT is_image AND NOT coalesce((c->>'digitalExtraction')::boolean,true) THEN
    IF NEW.mime_type<>'application/pdf' OR g->>'profile'='LIGHT' OR c->>'profile'='LIGHT'
      OR NOT coalesce((g->>'autoOcr')::boolean,true) OR NOT coalesce((c->>'autoOcr')::boolean,true)
      OR NOT coalesce((g->>'pdfOcr')::boolean,true) OR NOT coalesce((c->>'pdfOcr')::boolean,true) THEN RETURN NEW; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(71620381);
  SELECT coalesce(sum(jobs),0),coalesce(sum(jobs) FILTER(WHERE company_id=NEW.entity_id),0)
    INTO pending_count,company_count FROM runly_content.totals WHERE state IN ('pending','processing');
  IF pending_count>=4000 OR company_count>=least(coalesce((g->>'maxPending')::int,100),coalesce((c->>'maxPending')::int,100)) THEN RETURN NEW; END IF;
  INSERT INTO runly_content.job(company_id,file_id,revision,object_key,quality,priority)
    VALUES(NEW.entity_id,NEW.id,NEW.content_revision,NEW.object_key,coalesce(c->>'quality','balanced'),10) ON CONFLICT(file_id,revision) DO NOTHING;
  RETURN NEW;
END;
$$;
