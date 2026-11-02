BEGIN;
ALTER TABLE website_page_version ALTER COLUMN id SET DEFAULT uuidv7();
ALTER TABLE website_site ADD COLUMN publication_revision integer NOT NULL DEFAULT 0,
 ADD COLUMN active_release_id uuid, ADD COLUMN last_published_release_id uuid,
 ADD COLUMN lifecycle text NOT NULL DEFAULT 'draft', ADD COLUMN release_managed boolean NOT NULL DEFAULT false;
CREATE TABLE website_release (
 id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, site_id uuid NOT NULL,
 base_release_id uuid, draft_revision integer NOT NULL, publication_revision integer NOT NULL,
 state text NOT NULL DEFAULT 'preparing' CHECK(state IN('preparing','ready','failed','revoked')),
 manifest jsonb, manifest_hash text, failure_code text, actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,site_id,id),
 FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id),
 FOREIGN KEY(company_id,site_id,base_release_id) REFERENCES website_release(company_id,site_id,id)
);
ALTER TABLE website_site ADD CONSTRAINT website_active_release_owner_fk FOREIGN KEY(company_id,id,active_release_id) REFERENCES website_release(company_id,site_id,id);
ALTER TABLE website_site ADD CONSTRAINT website_last_release_owner_fk FOREIGN KEY(company_id,id,last_published_release_id) REFERENCES website_release(company_id,site_id,id);
CREATE TABLE website_publication_event (
 id uuid PRIMARY KEY DEFAULT uuidv7(),company_id uuid NOT NULL,site_id uuid NOT NULL,
 release_id uuid,from_release_id uuid,publication_revision integer NOT NULL,action text NOT NULL,
 actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,site_id,publication_revision),
 FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id),
 FOREIGN KEY(company_id,site_id,release_id) REFERENCES website_release(company_id,site_id,id),
 FOREIGN KEY(company_id,site_id,from_release_id) REFERENCES website_release(company_id,site_id,id)
);
CREATE TABLE website_publication_outbox (
 id uuid PRIMARY KEY DEFAULT uuidv7(),event_id uuid NOT NULL UNIQUE REFERENCES website_publication_event(id),
 company_id uuid NOT NULL,site_id uuid NOT NULL,publication_revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE website_domain (
 hostname text PRIMARY KEY, company_id uuid,site_id uuid,
 kind text NOT NULL CHECK(kind IN('legacy','platform','reserved')),
 state text NOT NULL CHECK(state IN('assigned','pending','quarantined','reserved')),
 ready boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((company_id IS NULL)=(site_id IS NULL)),
 FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id)
);
-- Adopt only unambiguous existing hostnames; never select a winner for duplicates.
WITH hosts AS (
 SELECT id,company_id,regexp_replace(lower(rtrim(regexp_replace(regexp_replace(trim(domain),'^https?://','','i'),'[:/].*$',''),'.')),'^www\.','') root
 FROM website_site WHERE domain IS NOT NULL AND domain<>''
), aliases AS (
 SELECT id,company_id,root host FROM hosts UNION ALL SELECT id,company_id,'www.'||root FROM hosts
), valid AS (SELECT *,count(*) OVER(PARTITION BY host) n FROM aliases WHERE host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' AND host LIKE '%.%')
INSERT INTO website_domain(hostname,company_id,site_id,kind,state,ready)
 SELECT host,CASE WHEN max(n)=1 THEN (array_agg(company_id))[1] END,
 CASE WHEN max(n)=1 THEN (array_agg(id))[1] END,'legacy',CASE WHEN max(n)=1 THEN 'assigned' ELSE 'quarantined' END,max(n)=1
 FROM valid GROUP BY host;
CREATE INDEX website_release_history_idx ON website_release(company_id,site_id,created_at,id);
CREATE INDEX website_domain_owner_idx ON website_domain(company_id,site_id);
CREATE INDEX website_event_release_idx ON website_publication_event(company_id,site_id,release_id);
CREATE FUNCTION website_sealed_release() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.state='ready' AND NEW.state='revoked' AND (to_jsonb(NEW)-'state')=(to_jsonb(OLD)-'state') THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' OR OLD.state IN('ready','revoked') OR NEW.company_id<>OLD.company_id OR NEW.site_id<>OLD.site_id THEN
  RAISE EXCEPTION 'sealed website release is immutable' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER website_release_seal BEFORE UPDATE OR DELETE ON website_release FOR EACH ROW EXECUTE FUNCTION website_sealed_release();
CREATE FUNCTION website_history_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'website publication history is append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER website_event_append_only BEFORE UPDATE OR DELETE ON website_publication_event FOR EACH ROW EXECUTE FUNCTION website_history_append_only();
CREATE TRIGGER website_domain_no_reassign BEFORE UPDATE OR DELETE ON website_domain FOR EACH ROW EXECUTE FUNCTION website_history_append_only();
REVOKE ALL ON FUNCTION website_sealed_release(),website_history_append_only() FROM PUBLIC;
CREATE OR REPLACE FUNCTION website_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.site_id IS DISTINCT FROM OLD.site_id THEN
    RAISE EXCEPTION 'website ownership is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='website_page' THEN
    IF NEW.title IS DISTINCT FROM OLD.title THEN NEW.draft_metadata=coalesce(NEW.draft_metadata,'{}'::jsonb)||jsonb_build_object('title',NEW.title); END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN NEW.draft_metadata=coalesce(NEW.draft_metadata,'{}'::jsonb)||jsonb_build_object('slug',NEW.slug); END IF;
    IF NEW.route_path IS DISTINCT FROM OLD.route_path THEN NEW.draft_metadata=coalesce(NEW.draft_metadata,'{}'::jsonb)||jsonb_build_object('routePath',NEW.route_path); END IF;
    IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN NEW.draft_metadata=coalesce(NEW.draft_metadata,'{}'::jsonb)||jsonb_build_object('visibility',NEW.visibility); END IF;
    IF NEW.seo IS DISTINCT FROM OLD.seo THEN NEW.draft_seo=NEW.seo; END IF;
    IF (to_jsonb(NEW)-ARRAY['revision','updated_at','published_builder_data','status','published_at','updated_by_id'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_at','published_builder_data','status','published_at','updated_by_id'])
      OR NEW.revision <> OLD.revision THEN NEW.revision=OLD.revision+1; END IF;
  ELSE
    IF NEW.seo IS DISTINCT FROM OLD.seo THEN NEW.draft_seo=NEW.seo; END IF;
    IF (to_jsonb(NEW)-ARRAY['revision','updated_at','published_builder_data','status','published_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_at','published_builder_data','status','published_at']) OR NEW.revision<>OLD.revision THEN NEW.revision=OLD.revision+1; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION website_site_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'website ownership is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('name',NEW.name); END IF;
  IF NEW.site_type IS DISTINCT FROM OLD.site_type THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('siteType',NEW.site_type); END IF;
  IF NEW.settings IS DISTINCT FROM OLD.settings THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('settings',NEW.settings); END IF;
  IF NEW.seo_defaults IS DISTINCT FROM OLD.seo_defaults THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('seoDefaults',NEW.seo_defaults); END IF;
  IF NEW.theme_id IS DISTINCT FROM OLD.theme_id THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('themeId',NEW.theme_id); END IF;
  IF NEW.homepage_page_id IS DISTINCT FROM OLD.homepage_page_id THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('homepagePageId',NEW.homepage_page_id); END IF;
  IF (NEW.analytics_mode IS DISTINCT FROM OLD.analytics_mode OR NEW.turnstile_site_key IS DISTINCT FROM OLD.turnstile_site_key OR NEW.turnstile_secret_key IS DISTINCT FROM OLD.turnstile_secret_key) AND NEW.draft_revision=OLD.draft_revision THEN NEW.draft_revision=OLD.draft_revision+1; END IF;
  IF NEW.draft_identity IS DISTINCT FROM OLD.draft_identity AND NEW.draft_revision=OLD.draft_revision THEN
    NEW.draft_revision=OLD.draft_revision+1;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION website_touch_draft_site() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE owner_site uuid;
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN('website_page','website_blog_post') THEN
   IF NEW.revision=OLD.revision THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='website_menu_item' THEN SELECT site_id INTO owner_site FROM website_menu WHERE id=NEW.menu_id AND company_id=NEW.company_id;
 ELSE owner_site=NEW.site_id; END IF;
 UPDATE website_site SET draft_revision=draft_revision+1 WHERE company_id=NEW.company_id AND id=owner_site;
 RETURN NEW;
END $$;
CREATE TRIGGER website_theme_touch AFTER INSERT OR UPDATE ON website_theme FOR EACH ROW EXECUTE FUNCTION website_touch_draft_site();
CREATE TRIGGER website_menu_touch AFTER INSERT OR UPDATE ON website_menu FOR EACH ROW EXECUTE FUNCTION website_touch_draft_site();
CREATE TRIGGER website_item_touch AFTER INSERT OR UPDATE ON website_menu_item FOR EACH ROW EXECUTE FUNCTION website_touch_draft_site();
CREATE FUNCTION website_resource_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id OR
 (to_jsonb(NEW)->>'site_id') IS DISTINCT FROM (to_jsonb(OLD)->>'site_id') OR
 (to_jsonb(NEW)->>'menu_id') IS DISTINCT FROM (to_jsonb(OLD)->>'menu_id') OR
 (to_jsonb(NEW)->>'form_id') IS DISTINCT FROM (to_jsonb(OLD)->>'form_id') THEN
 RAISE EXCEPTION 'website ownership is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION website_resource_identity_guard() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['website_site','website_page','website_blog_post','website_theme','website_menu','website_menu_item','website_blog_category','website_form','website_form_field','website_form_submission'] LOOP
 EXECUTE format('CREATE TRIGGER website_resource_identity BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION website_resource_identity_guard()',t);
 END LOOP;
END $$;
DO $$ DECLARE t text;r text; BEGIN
 FOREACH t IN ARRAY ARRAY['website_release','website_publication_event','website_publication_outbox','website_domain'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY website_backend_only ON %I AS RESTRICTIVE FOR ALL TO PUBLIC USING(false) WITH CHECK(false)',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON %I FROM %I',t,r); END IF; END LOOP;
 END LOOP;
END $$;
COMMIT;
