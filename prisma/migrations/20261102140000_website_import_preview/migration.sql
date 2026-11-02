BEGIN;
CREATE TABLE website_import (
 id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL,site_id uuid NOT NULL,
 actor_id uuid NOT NULL,archive_hash text NOT NULL,archive_key text NOT NULL,
 phase text NOT NULL CHECK(phase IN('validating','ready','failed')),
 manifest jsonb,error_code text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,site_id,id),FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id)
);
CREATE INDEX website_import_owner_idx ON website_import(company_id,site_id,created_at);
CREATE UNIQUE INDEX website_import_running_site ON website_import(site_id) WHERE phase='validating';
CREATE TABLE website_public_asset_binding (
 company_id uuid NOT NULL,site_id uuid NOT NULL,path text NOT NULL,hash text NOT NULL,
 release_id uuid NOT NULL,PRIMARY KEY(site_id,path),
 FOREIGN KEY(company_id,site_id,release_id) REFERENCES website_release(company_id,site_id,id)
);
CREATE TABLE website_preview_session (
 id uuid PRIMARY KEY DEFAULT uuidv7(),company_id uuid NOT NULL,site_id uuid NOT NULL,release_id uuid NOT NULL,
 actor_id uuid NOT NULL,hostname text NOT NULL UNIQUE,token_hash text NOT NULL,
 cookie_hash text,expires_at timestamptz NOT NULL,consumed_at timestamptz,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,site_id,release_id) REFERENCES website_release(company_id,site_id,id)
);
CREATE INDEX website_preview_owner_idx ON website_preview_session(company_id,site_id,id);
CREATE TRIGGER website_asset_binding_immutable BEFORE UPDATE OR DELETE ON website_public_asset_binding FOR EACH ROW EXECUTE FUNCTION website_history_append_only();
CREATE FUNCTION website_import_seal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.phase IN('ready','failed') OR NEW.company_id<>OLD.company_id OR NEW.site_id<>OLD.site_id OR NEW.archive_hash<>OLD.archive_hash OR NEW.archive_key<>OLD.archive_key THEN
 RAISE EXCEPTION 'website import is immutable' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER website_import_seal BEFORE UPDATE OR DELETE ON website_import FOR EACH ROW EXECUTE FUNCTION website_import_seal();
CREATE FUNCTION website_preview_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['cookie_hash','consumed_at','revoked_at','expires_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['cookie_hash','consumed_at','revoked_at','expires_at']) OR
 (OLD.consumed_at IS NOT NULL AND (NEW.consumed_at IS DISTINCT FROM OLD.consumed_at OR NEW.cookie_hash IS DISTINCT FROM OLD.cookie_hash)) OR
 (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
 RAISE EXCEPTION 'website preview identity is immutable' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER website_preview_identity BEFORE UPDATE ON website_preview_session FOR EACH ROW EXECUTE FUNCTION website_preview_identity();
REVOKE ALL ON FUNCTION website_preview_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION website_import_seal() FROM PUBLIC;
DO $$ DECLARE t text;r text; BEGIN
 FOREACH t IN ARRAY ARRAY['website_import','website_public_asset_binding','website_preview_session'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY website_backend_only ON %I AS RESTRICTIVE FOR ALL TO PUBLIC USING(false) WITH CHECK(false)',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON %I FROM %I',t,r);END IF;END LOOP;
 END LOOP;
END $$;
COMMIT;
