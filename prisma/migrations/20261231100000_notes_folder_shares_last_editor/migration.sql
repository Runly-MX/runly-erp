-- Last editor of a note, shown in the note footer.
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES "user_profile"(id) ON DELETE SET NULL;

-- Folder sharing. A folder share is the source of truth; the API materializes
-- it as note_shares rows (source_folder_id set) for every note in the folder so
-- access checks, realtime authorization and listings keep working unchanged.
CREATE TABLE IF NOT EXISTS note_folder_shares (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  folder_id UUID NOT NULL REFERENCES note_folders(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES "user_profile"(id) ON DELETE CASCADE,
  shared_by_user_id UUID NOT NULL REFERENCES "user_profile"(id),
  permission TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'edit')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (folder_id, shared_with_user_id)
);
CREATE INDEX IF NOT EXISTS note_folder_shares_user_idx ON note_folder_shares(shared_with_user_id);
ALTER TABLE note_folder_shares ENABLE ROW LEVEL SECURITY;

ALTER TABLE note_shares
  ADD COLUMN IF NOT EXISTS source_folder_id UUID REFERENCES note_folders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS note_shares_source_folder_idx ON note_shares(source_folder_id)
  WHERE source_folder_id IS NOT NULL;
