-- Add before allowing mixed writers. No historical migration is modified.
CREATE OR REPLACE FUNCTION runly_studio.require_document_protocol()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE((OLD.document->>'schemaVersion')::integer,0)>=6
     OR COALESCE((NEW.document->>'schemaVersion')::integer,0)>=6 THEN
    IF current_setting('runly.studio.protocol',true) IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'STUDIO_UPGRADE_REQUIRED: document writer protocol is obsolete' USING ERRCODE='23514';
    END IF;
    IF (NEW.document->>'schemaVersion')::integer < (OLD.document->>'schemaVersion')::integer THEN
      RAISE EXCEPTION 'STUDIO_DOCUMENT_DOWNGRADE_DENIED' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER studio_document_protocol BEFORE UPDATE OF document,name,revision ON studio_design
FOR EACH ROW EXECUTE FUNCTION runly_studio.require_document_protocol();
