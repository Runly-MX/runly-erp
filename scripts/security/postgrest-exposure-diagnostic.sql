-- PostgREST / Supabase exposure diagnostic (F1A, P0-02). READ ONLY.
-- Run as a superuser or the postgres role on each instance, e.g.
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/security/postgrest-exposure-diagnostic.sql
-- Every statement is a SELECT inside a READ ONLY transaction; nothing is changed.
-- It prints no row data, only object names, privileges and counts.
-- Interpretation: docs/audits/RUNLY_PLATFORM_F1A_SECURITY_RESULTS.md (section C).
-- Exposed schemas default to the self-hosted compose PGRST_DB_SCHEMAS; edit the
-- array below if an instance sets a different value.

BEGIN TRANSACTION READ ONLY;

\echo '== 1. API roles and schemas they can USE'
SELECT r.rolname AS role, r.rolbypassrls AS bypass_rls, r.rolinherit AS inherits,
       array(SELECT n.nspname FROM pg_namespace n WHERE has_schema_privilege(r.oid, n.oid, 'USAGE')
             AND n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema' ORDER BY 1) AS usable_schemas
FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'authenticator') ORDER BY 1;

\echo '== 2. Roles anon/authenticated inherit (indirect privileges)'
SELECT m.rolname AS member, g.rolname AS granted_role
FROM pg_auth_members am JOIN pg_roles m ON m.oid = am.member JOIN pg_roles g ON g.oid = am.roleid
WHERE m.rolname IN ('anon', 'authenticated') ORDER BY 1, 2;

\echo '== 3. Summary per exposed schema and role'
WITH rels AS (
  SELECT c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = ANY (ARRAY['public', 'graphql_public']) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
), roles AS (SELECT unnest(ARRAY['anon', 'authenticated']) AS role)
SELECT r.nspname, roles.role,
  count(*) AS relations,
  count(*) FILTER (WHERE has_table_privilege(roles.role, r.oid, 'SELECT')) AS can_select,
  count(*) FILTER (WHERE has_table_privilege(roles.role, r.oid, 'INSERT') OR has_table_privilege(roles.role, r.oid, 'UPDATE') OR has_table_privilege(roles.role, r.oid, 'DELETE')) AS can_write,
  count(*) FILTER (WHERE has_table_privilege(roles.role, r.oid, 'SELECT') AND r.relkind IN ('r', 'p') AND NOT r.relrowsecurity) AS select_without_rls,
  count(*) FILTER (WHERE has_table_privilege(roles.role, r.oid, 'SELECT') AND r.relkind IN ('v', 'm', 'f')) AS select_on_views
FROM rels r CROSS JOIN roles GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 4. Relations readable or writable by anon/authenticated (classification per relation)'
WITH rels AS (
  SELECT c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
    (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
    (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid AND pg_get_expr(p.polqual, p.polrelid) = 'true'
       AND (p.polroles = '{0}' OR p.polroles && ARRAY(SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')))) AS permissive_true_policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = ANY (ARRAY['public', 'graphql_public']) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
)
SELECT nspname, relname, relkind,
  has_table_privilege('anon', oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', oid, 'INSERT') OR has_table_privilege('anon', oid, 'UPDATE') OR has_table_privilege('anon', oid, 'DELETE') AS anon_write,
  has_table_privilege('authenticated', oid, 'SELECT') AS auth_select,
  has_table_privilege('authenticated', oid, 'INSERT') OR has_table_privilege('authenticated', oid, 'UPDATE') OR has_table_privilege('authenticated', oid, 'DELETE') AS auth_write,
  relrowsecurity AS rls, relforcerowsecurity AS force_rls, policies, permissive_true_policies,
  CASE
    WHEN NOT (has_table_privilege('anon', oid, 'SELECT') OR has_table_privilege('authenticated', oid, 'SELECT')
              OR has_table_privilege('anon', oid, 'INSERT') OR has_table_privilege('authenticated', oid, 'INSERT')
              OR has_table_privilege('anon', oid, 'UPDATE') OR has_table_privilege('authenticated', oid, 'UPDATE')
              OR has_table_privilege('anon', oid, 'DELETE') OR has_table_privilege('authenticated', oid, 'DELETE')) THEN 'NOT_GRANTED'
    WHEN relkind IN ('v', 'm', 'f') THEN 'EXPOSED_VIEW_REVIEW'
    WHEN NOT relrowsecurity THEN 'EXPOSED_NO_RLS'
    WHEN permissive_true_policies > 0 THEN 'RLS_PERMISSIVE_TRUE'
    WHEN policies = 0 THEN 'RLS_DENY_ALL'
    ELSE 'RLS_POLICIES_REVIEW'
  END AS classification
FROM rels
WHERE has_table_privilege('anon', oid, 'SELECT') OR has_table_privilege('authenticated', oid, 'SELECT')
   OR has_table_privilege('anon', oid, 'INSERT') OR has_table_privilege('authenticated', oid, 'INSERT')
   OR has_table_privilege('anon', oid, 'UPDATE') OR has_table_privilege('authenticated', oid, 'UPDATE')
   OR has_table_privilege('anon', oid, 'DELETE') OR has_table_privilege('authenticated', oid, 'DELETE')
ORDER BY classification, nspname, relname;

\echo '== 5. Column-level grants to anon/authenticated'
SELECT table_schema, table_name, grantee, privilege_type, count(*) AS columns
FROM information_schema.column_privileges
WHERE grantee IN ('anon', 'authenticated') AND table_schema = ANY (ARRAY['public', 'graphql_public'])
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4;

\echo '== 6. Default privileges that grant to anon/authenticated (future objects)'
SELECT pg_get_userbyid(d.defaclrole) AS owner, n.nspname AS schema, d.defaclobjtype AS object_type, d.defaclacl::text AS acl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE d.defaclacl::text ~ '(^|[{,])(anon|authenticated)=' ORDER BY 1, 2, 3;

\echo '== 7. Functions in exposed schemas executable by anon/authenticated (RPC surface)'
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  coalesce(array_to_string(p.proconfig, ','), '') AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = ANY (ARRAY['public', 'graphql_public'])
  AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
ORDER BY p.prosecdef DESC, 1, 2;

\echo '== 8. SECURITY DEFINER functions anywhere outside system schemas (indirect access)'
SELECT n.nspname, p.proname, pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  coalesce(array_to_string(p.proconfig, ','), '') AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'graphql', 'pgsodium', 'vault', 'supabase_functions', 'net', 'pgbouncer', '_realtime', 'supabase_migrations', 'cron')
ORDER BY 1, 2;

\echo '== 9. Storage buckets (public flag) and storage.objects policies'
SELECT id, public, file_size_limit IS NOT NULL AS has_size_limit FROM storage.buckets ORDER BY id;
SELECT polname, polcmd, array(SELECT rolname FROM pg_roles WHERE oid = ANY (polroles)) AS roles, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy WHERE polrelid = 'storage.objects'::regclass ORDER BY 1;

\echo '== 10. Realtime: published tables and realtime.messages policies'
SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE pubname LIKE 'supabase_realtime%' ORDER BY 1, 2, 3;
SELECT polname, polcmd, array(SELECT rolname FROM pg_roles WHERE oid = ANY (polroles)) AS roles
FROM pg_policy WHERE polrelid = to_regclass('realtime.messages') ORDER BY 1;

\echo '== 11. Migration history integrity (rows writable through PostgREST before 20270114000000)'
SELECT has_table_privilege('anon', 'public._prisma_migrations', 'INSERT') AS anon_can_insert,
       has_table_privilege('authenticated', 'public._prisma_migrations', 'INSERT') AS auth_can_insert,
       count(*) AS rows,
       count(*) FILTER (WHERE checksum !~ '^[0-9a-f]{64}$') AS non_prisma_checksum,
       count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unfinished,
       count(*) FILTER (WHERE migration_name !~ '^[0-9]{14}_[a-z0-9_]+$') AS unusual_name
FROM public._prisma_migrations;
-- Compare names with prisma/migrations of the deployed release (any extra row is suspect):
SELECT migration_name, checksum ~ '^[0-9a-f]{64}$' AS prisma_checksum, finished_at IS NOT NULL AS finished
FROM public._prisma_migrations ORDER BY migration_name DESC LIMIT 15;

ROLLBACK;
