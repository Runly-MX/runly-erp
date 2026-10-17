-- Additive core migration. Moves MCP quota counters and activity out of
-- mcp_state, which keeps only OAuth clients, grants, tokens and proposals.
CREATE UNLOGGED TABLE public.mcp_rate (
    key text PRIMARY KEY,
    counter integer NOT NULL DEFAULT 0,
    expires_at timestamp(3) NOT NULL
);
CREATE INDEX mcp_rate_expires_at_idx ON public.mcp_rate(expires_at);

CREATE TABLE public.mcp_activity (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    auth_user_id uuid NOT NULL,
    grant_id text,
    type text NOT NULL,
    client_name text,
    tool text,
    module_key text,
    mode text,
    operation text,
    company_id text,
    status text NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX mcp_activity_auth_user_id_created_at_idx ON public.mcp_activity(auth_user_id, created_at DESC);
CREATE INDEX mcp_activity_created_at_idx ON public.mcp_activity(created_at);

ALTER TABLE public.mcp_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_rate FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mcp_activity FROM PUBLIC, anon, authenticated;

INSERT INTO public.mcp_activity (auth_user_id, grant_id, type, client_name, tool, module_key, mode, operation, company_id, status, created_at)
SELECT (payload->>'authUserId')::uuid, payload->>'grantId', COALESCE(payload->>'type', 'tool'), payload->>'clientName', payload->>'tool',
       payload->>'moduleKey', payload->>'mode', payload->>'operation', payload->>'companyId', COALESCE(payload->>'status', 'unknown'), created_at
FROM public.mcp_state
WHERE kind = 'activity' AND expires_at > CURRENT_TIMESTAMP
  AND payload->>'authUserId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

DELETE FROM public.mcp_state WHERE kind IN ('activity', 'rate');
