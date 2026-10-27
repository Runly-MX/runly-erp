-- Generated with Supabase CLI migration new, sequenced after the repository's
-- existing migrations. No existing role, policy or certified snapshot changes.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='runly_studio_socket') THEN
    CREATE ROLE runly_studio_socket NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
-- USAGE must have been provisioned by the schema owner, not silently ignored
-- with "no privileges were granted" by the non-owner Prisma migration role.
DO $$ BEGIN
  IF NOT has_schema_privilege('runly_studio_socket','realtime','USAGE') THEN
    RAISE EXCEPTION 'STUDIO_SOCKET_SCHEMA_OWNER_REQUIRED: run owner-phase provisioning first';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='runly_studio_socket' AND
    (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='runly_studio_socket')) THEN
    RAISE EXCEPTION 'STUDIO_SOCKET_ROLE_MUST_BE_ISOLATED';
  END IF;
END $$;
GRANT SELECT,INSERT ON realtime.messages TO runly_studio_socket;
GRANT USAGE ON SCHEMA runly_studio TO runly_studio_socket;
GRANT EXECUTE ON FUNCTION realtime.topic() TO runly_studio_socket;

CREATE FUNCTION runly_studio.socket_allowed(p_topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(
    c->>'role'='runly_studio_socket'
    AND c->>'studio_version'='1'
    AND (c->>'exp')::double precision > extract(epoch FROM now())
    AND (c->>'exp')::double precision <= (c->>'iat')::double precision+30
    AND (c->>'iat')::double precision <= extract(epoch FROM now())+2
    AND p_topic='studio:ephemeral:'||(c->>'studio_design_id')||'@'||(c->>'studio_epoch')
    AND c->>'studio_epoch'=public.runly_realtime_revision()
    AND EXISTS (
      SELECT 1 FROM public.user_profile u JOIN public.studio_design d ON d.id=(c->>'studio_design_id')::uuid
      JOIN auth.sessions s ON s.id=(c->>'studio_auth_session_id')::uuid AND s.user_id=u.auth_user_id
      WHERE u.id=(c->>'studio_profile_id')::uuid AND u.auth_user_id=(c->>'studio_auth_id')::uuid AND u.enabled
      AND (s.not_after IS NULL OR s.not_after>now())
      AND d.company_id=(c->>'studio_company_id')::uuid AND runly_studio.can_access(d.id,u.id,false)
    ),false)
  FROM (SELECT current_setting('request.jwt.claims',true)::jsonb c) claims;
$$;
REVOKE ALL ON FUNCTION runly_studio.socket_allowed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION runly_studio.socket_allowed(text) TO runly_studio_socket;
CREATE POLICY studio_socket_read ON realtime.messages FOR SELECT TO runly_studio_socket
  USING (extension IN ('broadcast','presence') AND (SELECT runly_studio.socket_allowed(realtime.topic())));
CREATE POLICY studio_socket_write ON realtime.messages FOR INSERT TO runly_studio_socket
  WITH CHECK (extension IN ('broadcast','presence') AND (SELECT runly_studio.socket_allowed(realtime.topic())));
-- runly_realtime_server_writes stays restrictive/false for authenticated + anon.
-- This NOLOGIN role has no membership of either and no grants to authenticator.
COMMIT;
