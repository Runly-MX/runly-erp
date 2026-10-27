-- Owner-phase provisioning for NEW databases; also usable explicitly against
-- an existing self-hosted instance by its schema owner. Never broadens anon or
-- authenticated grants. Application migrations cannot grant schema USAGE here.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='runly_studio_socket') THEN
    CREATE ROLE runly_studio_socket NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='runly_studio_socket' AND
    (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='runly_studio_socket')) THEN
    RAISE EXCEPTION 'STUDIO_SOCKET_ROLE_MUST_BE_ISOLATED';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS realtime AUTHORIZATION supabase_admin;
GRANT USAGE ON SCHEMA realtime TO runly_studio_socket;
DO $$ BEGIN
  IF NOT has_schema_privilege('runly_studio_socket','realtime','USAGE') THEN
    RAISE EXCEPTION 'STUDIO_SOCKET_SCHEMA_OWNER_REQUIRED';
  END IF;
END $$;
