-- HEIC/HEIF photos are now readable by the worker (pillow-heif); same admission rules as every other image.
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
    OR NOT (NEW.mime_type ~ '^(image/(jpeg|png|webp|tiff|heic|heif|svg\+xml)|application/(pdf|json|xml|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text/[a-z.+-]+)$')
    OR (jsonb_array_length(coalesce(g->'allowedMimeTypes','[]'))>0 AND NOT (g->'allowedMimeTypes' ? NEW.mime_type))
    OR (jsonb_array_length(coalesce(c->'allowedMimeTypes','[]'))>0 AND NOT (c->'allowedMimeTypes' ? NEW.mime_type))
    OR NOT EXISTS(SELECT 1 FROM runly_content.worker WHERE heartbeat_at>now()-interval '90 seconds'
      AND capabilities->>'governor' IN ('ready','paused') AND coalesce((capabilities->>'protocol')::int,1)>=2)
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
