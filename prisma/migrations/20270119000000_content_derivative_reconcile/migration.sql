-- Derivative objects live in Storage; rows live in PostgreSQL. Any removal of a derivative row (explicit, stale revision, purge or
-- ON DELETE CASCADE from the file/company) records its Storage object in a small drain table, so the object is deleted afterwards
-- even when the row disappeared through a cascade. Only objects named here are ever removed: no bucket scans, no bulk deletes.
ALTER TABLE runly_content.derivative ADD COLUMN bucket text;
CREATE TABLE runly_content.derivative_orphan (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  bucket text NOT NULL,
  storage_key text NOT NULL CHECK (storage_key LIKE 'content-derivatives/%'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_derivative_orphan_age ON runly_content.derivative_orphan (created_at);
ALTER TABLE runly_content.derivative_orphan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON runly_content.derivative_orphan FROM PUBLIC;

CREATE FUNCTION runly_content.record_derivative_object() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.storage_key IS NOT NULL AND OLD.bucket IS NOT NULL THEN
    INSERT INTO runly_content.derivative_orphan(bucket, storage_key) VALUES (OLD.bucket, OLD.storage_key);
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER content_derivative_object BEFORE DELETE ON runly_content.derivative
  FOR EACH ROW EXECUTE FUNCTION runly_content.record_derivative_object();

-- Historical discovery pages through a company's files by id (keyset cursor). Without this index PostgreSQL walks the primary key
-- across every company's rows between two of the company's files. IF NOT EXISTS: very large installs may create it CONCURRENTLY first.
CREATE INDEX IF NOT EXISTS file_asset_entity_enabled_id_idx ON file_asset (entity_id, id) WHERE enabled;
