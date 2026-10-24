-- Notes: sub-pages (parent_note_id) and entity references (backlinks index).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE notes
  ADD COLUMN parent_note_id UUID REFERENCES notes(id) ON DELETE CASCADE;

CREATE INDEX idx_notes_parent_note_id ON notes (parent_note_id) WHERE parent_note_id IS NOT NULL;

CREATE TABLE note_references (
  note_id     UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES "company"(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  record_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, entity_type, record_id)
);

CREATE INDEX idx_note_references_record ON note_references (entity_type, record_id);

-- Backend-owned table: same second boundary as every other public table
-- (see 20260919140000_user_resource_isolation). Access goes through Hono only.
ALTER TABLE public.note_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.note_references FROM PUBLIC, anon, authenticated;

COMMIT;
