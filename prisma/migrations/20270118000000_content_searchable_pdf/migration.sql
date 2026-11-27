-- Searchable PDF derivatives: one optional, independent copy per (file, revision). The original is never touched.
-- The derivative lives in the same private bucket under a content-owned key and is served only through signed URLs
-- issued after the same file authorization as the original. Rows cascade with the file; stale revisions are never served.
CREATE TABLE runly_content.derivative (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES file_asset(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  object_key text NOT NULL,
  kind text NOT NULL DEFAULT 'searchable-pdf' CHECK (kind IN ('searchable-pdf')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','done','failed','cancelled')),
  error_code text,
  attempts integer NOT NULL DEFAULT 0,
  requested_by uuid,
  worker_id text,
  lease_hash text,
  lease_until timestamptz,
  storage_key text,
  size_bytes bigint,
  pages integer,
  ocr_pages integer,
  signed boolean NOT NULL DEFAULT false,
  engine jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (file_id, revision, kind)
);
CREATE INDEX content_derivative_claim ON runly_content.derivative (state, created_at) WHERE state IN ('pending','processing');
CREATE INDEX content_derivative_company ON runly_content.derivative (company_id, state);
ALTER TABLE runly_content.derivative ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON runly_content.derivative FROM PUBLIC;
