-- Additive application-owned tables. No changes to storage/realtime ownership.
CREATE TABLE note_image_binding (
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('runly-notes', 'atlas-notes')),
  object_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, bucket, object_key)
);
CREATE INDEX note_image_binding_object_idx ON note_image_binding(bucket, object_key);
ALTER TABLE note_image_binding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON note_image_binding FROM anon, authenticated;

CREATE TABLE note_image_storage_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  inventory jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE note_image_storage_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON note_image_storage_state FROM anon, authenticated;
