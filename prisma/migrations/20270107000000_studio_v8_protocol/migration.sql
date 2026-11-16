-- Studio v8 (slide and motion fields): additive writer guard, protocol 4.
-- Same function and triggers as 20261208000000; only the accepted protocols change.
-- No document rewrite: static designs stay v7 and v8 is written only by protocol 4.
CREATE OR REPLACE FUNCTION runly_studio.require_document_protocol()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_version integer := COALESCE((OLD.document->>'schemaVersion')::integer,0);
  next_version integer := COALESCE((NEW.document->>'schemaVersion')::integer,0);
  protocol text := current_setting('runly.studio.protocol',true);
BEGIN
  IF greatest(previous_version,next_version)>=8 THEN
    IF protocol IS DISTINCT FROM '4' THEN
      RAISE EXCEPTION 'STUDIO_UPGRADE_REQUIRED: v8 document requires protocol 4' USING ERRCODE='23514';
    END IF;
  ELSIF greatest(previous_version,next_version)>=7 THEN
    IF protocol IS NULL OR protocol NOT IN ('3','4') THEN
      RAISE EXCEPTION 'STUDIO_UPGRADE_REQUIRED: multipage document requires protocol 3' USING ERRCODE='23514';
    END IF;
  ELSIF greatest(previous_version,next_version)>=6 THEN
    IF protocol IS NULL OR protocol NOT IN ('2','3','4') THEN
      RAISE EXCEPTION 'STUDIO_UPGRADE_REQUIRED: document writer protocol is obsolete' USING ERRCODE='23514';
    END IF;
  END IF;
  IF next_version<previous_version THEN
    RAISE EXCEPTION 'STUDIO_DOCUMENT_DOWNGRADE_DENIED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
