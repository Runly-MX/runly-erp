-- Registry-managed hostnames. Ownership of a hostname (hostname, company, site, kind) stays immutable and
-- rows are never deleted; only rows created through the global registry may advance their liveness
-- (state, ready) when the registry says so. Rows that already exist keep serving exactly as before
-- (registry_managed=false stays append-only), and every reader that filters state='assigned' AND ready
-- keeps working unchanged.
ALTER TABLE website_domain ADD COLUMN registry_managed boolean NOT NULL DEFAULT false;
ALTER TABLE website_domain ADD COLUMN registry_version integer;
ALTER TABLE website_domain ADD COLUMN registry_redirect_to text;
ALTER TABLE website_domain ADD COLUMN registry_synced_at timestamptz;
ALTER TABLE website_domain DROP CONSTRAINT website_domain_state_check;
ALTER TABLE website_domain ADD CONSTRAINT website_domain_state_check CHECK(state IN('assigned','pending','quarantined','reserved','suspended','revoked'));
ALTER TABLE website_domain ADD CONSTRAINT website_domain_registry_check CHECK(NOT registry_managed OR (kind='platform' AND company_id IS NOT NULL AND site_id IS NOT NULL));
CREATE OR REPLACE FUNCTION website_domain_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.registry_managed AND NEW.registry_managed
     AND NEW.hostname=OLD.hostname AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id AND NEW.kind=OLD.kind AND NEW.created_at=OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'website publication history is append only' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION website_domain_guard() FROM PUBLIC;
DROP TRIGGER website_domain_no_reassign ON website_domain;
CREATE TRIGGER website_domain_no_reassign BEFORE UPDATE OR DELETE ON website_domain FOR EACH ROW EXECUTE FUNCTION website_domain_guard();
