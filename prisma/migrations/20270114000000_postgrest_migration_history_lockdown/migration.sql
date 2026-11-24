-- F1A (P0-02 follow-up). 20260919140000_user_resource_isolation revoked
-- PostgREST access from every public table except _prisma_migrations, which
-- kept the Supabase default grants: with only the public anon key anyone could
-- read the migration history and INSERT/UPDATE rows in it (verified on a
-- disposable stack), e.g. pre-mark a future migration as applied so
-- `prisma migrate deploy` skips it. Prisma migrates as the table owner, which
-- needs none of these grants.
REVOKE ALL ON TABLE public._prisma_migrations FROM PUBLIC, anon, authenticated;

-- runly_canvas_user_access takes an arbitrary user id and is only used by
-- policies for authenticated (canvas_board_receive). anon kept EXECUTE through
-- the schema's default privileges; authenticated keeps its explicit grant.
REVOKE EXECUTE ON FUNCTION public.runly_canvas_user_access(uuid, uuid, boolean) FROM anon;
