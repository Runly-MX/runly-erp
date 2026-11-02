-- S2 is additive. Existing public columns, URLs, IDs and submissions are untouched.
BEGIN;
ALTER TABLE website_site ADD COLUMN default_for_company boolean NOT NULL DEFAULT false,
  ADD COLUMN draft_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN draft_identity jsonb;
ALTER TABLE website_page ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN draft_seo jsonb, ADD COLUMN draft_metadata jsonb;
ALTER TABLE website_blog_post ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN draft_seo jsonb;
ALTER TABLE website_site ALTER COLUMN id SET DEFAULT uuidv7();
ALTER TABLE website_page ALTER COLUMN id SET DEFAULT uuidv7();

-- Pin the historical singular adapter once. Later creates never change this selection.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) n
  FROM website_site WHERE enabled
) UPDATE website_site s SET default_for_company=true FROM ranked r WHERE s.id=r.id AND r.n=1;
UPDATE website_site SET draft_identity=jsonb_build_object('name',name,'siteType',site_type,
  'settings',settings,'seoDefaults',seo_defaults,'themeId',theme_id,'homepagePageId',homepage_page_id);
UPDATE website_page SET draft_seo=seo,
  draft_metadata=jsonb_build_object('title',title,'slug',slug,'routePath',route_path,'visibility',visibility);
UPDATE website_blog_post SET draft_seo=seo;

CREATE UNIQUE INDEX website_site_company_id_id_key ON website_site(company_id,id);
CREATE UNIQUE INDEX website_site_active_default_key ON website_site(company_id) WHERE enabled AND default_for_company;
CREATE UNIQUE INDEX website_page_company_id_id_key ON website_page(company_id,id);
CREATE UNIQUE INDEX website_theme_company_id_site_id_id_key ON website_theme(company_id,site_id,id);
CREATE UNIQUE INDEX website_menu_company_id_id_key ON website_menu(company_id,id);
CREATE UNIQUE INDEX website_blog_category_company_id_site_id_id_key ON website_blog_category(company_id,site_id,id);
CREATE UNIQUE INDEX website_form_company_id_id_key ON website_form(company_id,id);
CREATE INDEX website_item_owner_idx ON website_menu_item(company_id,menu_id);
CREATE INDEX website_field_owner_idx ON website_form_field(company_id,form_id);
CREATE INDEX website_submission_owner_idx ON website_form_submission(company_id,form_id);
CREATE INDEX website_version_owner_idx ON website_page_version(company_id,page_id);

-- NOT VALID preserves anomalous historical rows for controlled resolution. New writes
-- must satisfy these constraints; validation/backfill is a separate operation.
ALTER TABLE website_site ADD CONSTRAINT website_site_company_fk FOREIGN KEY(company_id) REFERENCES company(id) NOT VALID;
ALTER TABLE website_page ADD CONSTRAINT website_page_site_owner_fk FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id) NOT VALID;
ALTER TABLE website_theme ADD CONSTRAINT website_theme_site_owner_fk FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id) NOT VALID;
ALTER TABLE website_menu ADD CONSTRAINT website_menu_site_owner_fk FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id) NOT VALID;
ALTER TABLE website_blog_category ADD CONSTRAINT website_category_site_owner_fk FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id) NOT VALID;
ALTER TABLE website_blog_post ADD CONSTRAINT website_post_site_owner_fk FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id) NOT VALID;
ALTER TABLE website_blog_post ADD CONSTRAINT website_post_category_owner_fk FOREIGN KEY(company_id,site_id,category_id) REFERENCES website_blog_category(company_id,site_id,id) NOT VALID;
ALTER TABLE website_menu_item ADD CONSTRAINT website_item_menu_owner_fk FOREIGN KEY(company_id,menu_id) REFERENCES website_menu(company_id,id) NOT VALID;
ALTER TABLE website_form_field ADD CONSTRAINT website_field_form_owner_fk FOREIGN KEY(company_id,form_id) REFERENCES website_form(company_id,id) NOT VALID;
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_form_owner_fk FOREIGN KEY(company_id,form_id) REFERENCES website_form(company_id,id) NOT VALID;
ALTER TABLE website_page_version ADD CONSTRAINT website_version_page_owner_fk FOREIGN KEY(company_id,page_id) REFERENCES website_page(company_id,id) NOT VALID;
ALTER TABLE website_published_render ADD CONSTRAINT website_render_site_owner_fk FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id) NOT VALID;

CREATE TABLE website_draft_command (
  id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL,
  actor_id uuid NOT NULL, operation text NOT NULL, key_hash text NOT NULL,
  request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,actor_id,operation,key_hash),
  FOREIGN KEY(company_id) REFERENCES company(id)
);

-- Backend commands use a privileged DB role after application authorization. There
-- is intentionally no direct anonymous/authenticated Data API policy for CMS data.
DO $$ DECLARE t text; r text; BEGIN
  FOREACH t IN ARRAY ARRAY['website_site','website_page','website_page_version','website_theme',
    'website_menu','website_menu_item','website_published_render','website_blog_category',
    'website_blog_post','website_form','website_form_field','website_form_submission','website_draft_command'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    -- Restrictive false defeats an old permissive policy as well. Trusted
    -- backend owner/BYPASSRLS still runs the application tenant policy.
    EXECUTE format('CREATE POLICY website_backend_only ON %I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC',t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',t,r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Coexistence: an old writer also changes the revision. Saving a draft never
-- updates seo/title/routes used by the public legacy reader.
CREATE FUNCTION website_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
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
    IF NEW.draft_builder_data IS DISTINCT FROM OLD.draft_builder_data OR NEW.draft_seo IS DISTINCT FROM OLD.draft_seo
      OR NEW.revision <> OLD.revision THEN NEW.revision=OLD.revision+1; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_page_revision BEFORE UPDATE ON website_page FOR EACH ROW EXECUTE FUNCTION website_revision_guard();
CREATE TRIGGER website_post_revision BEFORE UPDATE ON website_blog_post FOR EACH ROW EXECUTE FUNCTION website_revision_guard();

CREATE FUNCTION website_touch_draft_site() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW IS DISTINCT FROM OLD THEN
    UPDATE website_site SET draft_revision=draft_revision+1 WHERE company_id=NEW.company_id AND id=NEW.site_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_page_touch AFTER INSERT OR UPDATE ON website_page FOR EACH ROW EXECUTE FUNCTION website_touch_draft_site();
CREATE TRIGGER website_post_touch AFTER INSERT OR UPDATE ON website_blog_post FOR EACH ROW EXECUTE FUNCTION website_touch_draft_site();

CREATE FUNCTION website_site_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'website ownership is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('name',NEW.name); END IF;
  IF NEW.site_type IS DISTINCT FROM OLD.site_type THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('siteType',NEW.site_type); END IF;
  IF NEW.settings IS DISTINCT FROM OLD.settings THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('settings',NEW.settings); END IF;
  IF NEW.seo_defaults IS DISTINCT FROM OLD.seo_defaults THEN NEW.draft_identity=coalesce(NEW.draft_identity,'{}'::jsonb)||jsonb_build_object('seoDefaults',NEW.seo_defaults); END IF;
  IF NEW.draft_identity IS DISTINCT FROM OLD.draft_identity AND NEW.draft_revision=OLD.draft_revision THEN
    NEW.draft_revision=OLD.draft_revision+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_site_revision BEFORE UPDATE ON website_site FOR EACH ROW EXECUTE FUNCTION website_site_revision_guard();

-- Even an old binary creating the first site gets a pinned default. Existing
-- owners/defaults are never reassigned as a side effect of creating another site.
CREATE FUNCTION website_first_site_default() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM website_site WHERE company_id=NEW.company_id) THEN NEW.default_for_company=true; END IF;
  IF NEW.draft_identity IS NULL THEN NEW.draft_identity=jsonb_build_object('name',NEW.name,'siteType',NEW.site_type,'settings',NEW.settings,'seoDefaults',NEW.seo_defaults); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_first_site BEFORE INSERT ON website_site FOR EACH ROW EXECUTE FUNCTION website_first_site_default();

REVOKE ALL ON FUNCTION website_revision_guard(),website_touch_draft_site(),website_site_revision_guard(),website_first_site_default() FROM PUBLIC;
COMMIT;
