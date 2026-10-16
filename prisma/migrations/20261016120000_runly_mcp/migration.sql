-- Additive core migration. Does not change existing ERP records.
CREATE TABLE public.mcp_state (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    key text NOT NULL UNIQUE,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    counter integer NOT NULL DEFAULT 0,
    expires_at timestamp(3) NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX mcp_state_expires_at_idx ON public.mcp_state(expires_at);
CREATE INDEX mcp_state_kind_idx ON public.mcp_state(kind);
ALTER TABLE public.mcp_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_state FROM PUBLIC, anon, authenticated;
