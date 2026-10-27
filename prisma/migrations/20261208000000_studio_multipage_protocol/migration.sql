-- Additive writer guard. Existing v6 writers cannot modify a v7 document.
-- No document rewrite and no modification of historical migration checksums.
CREATE OR REPLACE FUNCTION runly_studio.require_document_protocol()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_version integer := COALESCE((OLD.document->>'schemaVersion')::integer,0);
  next_version integer := COALESCE((NEW.document->>'schemaVersion')::integer,0);
  protocol text := current_setting('runly.studio.protocol',true);
BEGIN
  IF greatest(previous_version,next_version)>=7 THEN
    IF protocol IS DISTINCT FROM '3' THEN
      RAISE EXCEPTION 'STUDIO_UPGRADE_REQUIRED: multipage document requires protocol 3' USING ERRCODE='23514';
    END IF;
  ELSIF greatest(previous_version,next_version)>=6 THEN
    IF protocol IS NULL OR protocol NOT IN ('2','3') THEN
      RAISE EXCEPTION 'STUDIO_UPGRADE_REQUIRED: document writer protocol is obsolete' USING ERRCODE='23514';
    END IF;
  END IF;
  IF next_version<previous_version THEN
    RAISE EXCEPTION 'STUDIO_DOCUMENT_DOWNGRADE_DENIED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER studio_template_protocol BEFORE UPDATE OF document,name,revision ON studio_template
FOR EACH ROW EXECUTE FUNCTION runly_studio.require_document_protocol();

ALTER TABLE studio_presence ADD COLUMN page_id text NOT NULL DEFAULT 'page-1'
  CHECK (page_id ~ '^[a-zA-Z0-9_-]{1,64}$');
