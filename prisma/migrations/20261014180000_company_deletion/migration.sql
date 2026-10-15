-- Private operational state survives deleting a company. Never expose manifests
-- (which contain object keys) through PostgREST or the public API.
CREATE SCHEMA IF NOT EXISTS runly_lifecycle;
REVOKE ALL ON SCHEMA runly_lifecycle FROM PUBLIC;
CREATE TABLE runly_lifecycle.company_deletion (
  company_id uuid PRIMARY KEY,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  previous_enabled boolean NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','PURGING','FAILED','COMPLETED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0,
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE runly_lifecycle.deletion_row (
  company_id uuid NOT NULL REFERENCES runly_lifecycle.company_deletion(company_id) ON DELETE CASCADE,
  table_name text NOT NULL,
  row_key jsonb NOT NULL,
  PRIMARY KEY (company_id, table_name, row_key)
);
CREATE TABLE runly_lifecycle.deletion_object (
  company_id uuid NOT NULL REFERENCES runly_lifecycle.company_deletion(company_id) ON DELETE CASCADE,
  bucket text NOT NULL,
  object_key text NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (company_id, bucket, object_key)
);
CREATE TABLE runly_lifecycle.deletion_module (
  company_id uuid NOT NULL REFERENCES runly_lifecycle.company_deletion(company_id) ON DELETE CASCADE,
  module_key text NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (company_id, module_key)
);
REVOKE ALL ON ALL TABLES IN SCHEMA runly_lifecycle FROM PUBLIC;

-- Resolve ownership by following parent FKs, never by uploader/user identity.
-- Used for guards and for public capability checks, including child tables
-- which have no company_id themselves. Unscoped user accounts stay global.
CREATE FUNCTION runly_lifecycle.owners(rel oid, row_data jsonb, visited oid[] DEFAULT '{}')
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE fk record; parent_data jsonb; predicate text; owner_id uuid; candidate record;
BEGIN
  IF rel = ANY(visited) OR cardinality(visited) > 20 THEN RETURN; END IF;
  -- Minimal resource-key tombstones also fence late callbacks and restores
  -- after their live parent was removed. No business payload is retained.
  RETURN QUERY SELECT d.company_id FROM runly_lifecycle.deletion_row d
    JOIN pg_class c ON c.relname=d.table_name AND c.oid=rel WHERE row_data @> d.row_key;
  IF row_data->>'company_id' IS NOT NULL THEN
    RETURN NEXT (row_data->>'company_id')::uuid;
  END IF;
  IF rel = 'public.company'::regclass THEN RETURN NEXT (row_data->>'id')::uuid; RETURN; END IF;
  IF row_data->>'conversation_id' IS NOT NULL AND to_regclass('public.chat_conversations') IS NOT NULL THEN
    RETURN QUERY SELECT d.company_id FROM runly_lifecycle.deletion_row d WHERE d.table_name='chat_conversations' AND d.row_key->>'id'=row_data->>'conversation_id';
    FOR parent_data IN EXECUTE 'SELECT to_jsonb(p) FROM public.chat_conversations p WHERE p.id::text=$1' USING row_data->>'conversation_id'
    LOOP RETURN QUERY SELECT * FROM runly_lifecycle.owners('public.chat_conversations'::regclass, parent_data, visited || rel); END LOOP;
  END IF;
  IF rel = 'public.file_asset'::regclass AND row_data->>'entity_id' IS NOT NULL THEN
    RETURN QUERY SELECT d.company_id FROM runly_lifecycle.deletion_row d WHERE d.row_key->>'id'=row_data->>'entity_id';
    FOR owner_id IN SELECT id FROM public.company WHERE id::text = row_data->>'entity_id'
      UNION SELECT company_id FROM runly_lifecycle.company_deletion WHERE company_id::text = row_data->>'entity_id'
    LOOP RETURN NEXT owner_id; END LOOP;
    FOR candidate IN SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'company_id')
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id')
    LOOP
      FOR parent_data IN EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE p.id::text = $1', candidate.relname) USING row_data->>'entity_id'
      LOOP RETURN QUERY SELECT * FROM runly_lifecycle.owners(candidate.oid, parent_data, visited || rel); END LOOP;
    END LOOP;
  END IF;
  FOR fk IN
    SELECT c.confrelid, c.conkey, c.confkey FROM pg_constraint c
    JOIN pg_class p ON p.oid = c.confrelid JOIN pg_namespace n ON n.oid = p.relnamespace
    WHERE c.conrelid = rel AND c.contype = 'f' AND n.nspname = 'public'
  LOOP
    SELECT string_agg(format('to_jsonb(p)->>%L = $1->>%L', pa.attname, ca.attname), ' AND ')
      INTO predicate FROM unnest(fk.conkey, fk.confkey) AS k(child, parent)
      JOIN pg_attribute ca ON ca.attrelid = rel AND ca.attnum = k.child
      JOIN pg_attribute pa ON pa.attrelid = fk.confrelid AND pa.attnum = k.parent;
    RETURN QUERY EXECUTE format('SELECT d.company_id FROM runly_lifecycle.deletion_row d WHERE d.table_name=%L AND %s',
      (SELECT relname FROM pg_class WHERE oid=fk.confrelid), replace(predicate,'to_jsonb(p)','d.row_key')) USING row_data;
    FOR parent_data IN EXECUTE format('SELECT to_jsonb(p) FROM %s p WHERE %s', fk.confrelid::regclass, predicate) USING row_data
    LOOP RETURN QUERY SELECT * FROM runly_lifecycle.owners(fk.confrelid, parent_data, visited || rel); END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION runly_lifecycle.guard_company_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE owner_id uuid; payload jsonb;
BEGIN
  IF current_setting('runly.lifecycle_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  -- Check both sides: moving a row cannot escape its suspended owner.
  FOR payload IN SELECT x FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END]) x WHERE x IS NOT NULL
  LOOP
    FOR owner_id IN SELECT DISTINCT * FROM runly_lifecycle.owners(TG_RELID, payload)
    LOOP
      PERFORM pg_advisory_xact_lock_shared(hashtextextended(owner_id::text, 731));
      IF EXISTS (SELECT 1 FROM runly_lifecycle.company_deletion d WHERE d.company_id = owner_id AND d.state <> 'CANCELLED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'COMPANY_PENDING_DELETION';
      END IF;
    END LOOP;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Called on requesting deletion as well, to cover dynamically installed RME3
-- tables. Global module mutations are fenced while any purge is outstanding.
CREATE FUNCTION runly_lifecycle.install_guards() RETURNS void LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.oid, n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = t.oid AND tgname = 'runly_company_lifecycle_guard') THEN
      EXECUTE format('CREATE TRIGGER runly_company_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION runly_lifecycle.guard_company_write()', t.nspname, t.relname);
    END IF;
  END LOOP;
END $$;
SELECT runly_lifecycle.install_guards();
CREATE FUNCTION runly_lifecycle.blocked_capability(tokens text[]) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE col record; found boolean;
BEGIN
  FOR col IN SELECT c.oid, c.relname, a.attname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND
      (a.attname IN ('id','public_slug','public_key') OR a.attname LIKE '%token%' OR a.attname LIKE '%key_hash')
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE r.%I::text = ANY($1)
      AND EXISTS(SELECT 1 FROM runly_lifecycle.owners(%s, to_jsonb(r)) o
        JOIN runly_lifecycle.company_deletion d ON d.company_id = o WHERE d.state <> ''CANCELLED''))', col.relname, col.attname, col.oid)
      INTO found USING tokens;
    IF found THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA runly_lifecycle FROM PUBLIC;
