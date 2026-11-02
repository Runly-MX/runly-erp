BEGIN;
CREATE UNIQUE INDEX growth_property_company_id_scope_unique ON growth_property(company_id,id);
CREATE TABLE website_form_scope (
 id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, form_id uuid NOT NULL,
 owner_kind text NOT NULL CHECK(owner_kind IN ('website','growth_property')),
 owner_website_site_id uuid, owner_property_id uuid, analytics_property_id uuid NOT NULL,
 legacy_site_id uuid NOT NULL, classification text NOT NULL, policy_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,form_id), UNIQUE(company_id,form_id,id),
 CHECK((owner_kind='website' AND owner_website_site_id IS NOT NULL AND owner_property_id IS NULL)
 OR (owner_kind='growth_property' AND owner_property_id IS NOT NULL AND owner_website_site_id IS NULL AND analytics_property_id=owner_property_id)),
 FOREIGN KEY(company_id,form_id) REFERENCES website_form(company_id,id),
 FOREIGN KEY(company_id,owner_website_site_id) REFERENCES website_site(company_id,id),
 FOREIGN KEY(company_id,owner_property_id) REFERENCES growth_property(company_id,id),
 FOREIGN KEY(company_id,analytics_property_id) REFERENCES growth_property(company_id,id)
);
CREATE INDEX website_form_scope_site_idx ON website_form_scope(company_id,owner_website_site_id);
CREATE INDEX website_form_scope_property_idx ON website_form_scope(company_id,owner_property_id);
CREATE INDEX website_form_scope_analytics_idx ON website_form_scope(company_id,analytics_property_id);
CREATE FUNCTION website_form_scope_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM website_form WHERE company_id=NEW.company_id AND id=NEW.form_id AND site_id=NEW.legacy_site_id)
 OR (NEW.owner_kind='website' AND (NEW.legacy_site_id<>NEW.owner_website_site_id OR NOT EXISTS(SELECT 1 FROM growth_property WHERE company_id=NEW.company_id AND id=NEW.analytics_property_id AND website_site_id=NEW.owner_website_site_id)))
 OR (NEW.owner_kind='growth_property' AND NEW.legacy_site_id<>NEW.owner_property_id)
 THEN RAISE EXCEPTION 'invalid form scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER website_form_scope_validate BEFORE INSERT ON website_form_scope FOR EACH ROW EXECUTE FUNCTION website_form_scope_validate();
ALTER TABLE website_form_scope ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_form_scope_backend_only ON website_form_scope AS RESTRICTIVE FOR ALL USING(false) WITH CHECK(false);
REVOKE ALL ON website_form_scope FROM PUBLIC,anon,authenticated;
CREATE FUNCTION website_form_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'form scope is immutable'; END $$;
CREATE TRIGGER website_form_scope_immutable BEFORE UPDATE OR DELETE ON website_form_scope FOR EACH ROW EXECUTE FUNCTION website_form_scope_immutable();
ALTER TABLE website_form ADD COLUMN definition_revision integer NOT NULL DEFAULT 0;
ALTER TABLE website_form_submission ADD COLUMN definition_revision integer;
ALTER TABLE website_form_submission ADD COLUMN owner_scope_id uuid;
ALTER TABLE website_form_submission ADD COLUMN website_site_id uuid;
ALTER TABLE website_form_submission ADD COLUMN page_id uuid;
ALTER TABLE website_form_submission ADD COLUMN blog_post_id uuid;
ALTER TABLE website_form_submission ADD COLUMN release_id uuid;
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_source_check CHECK(page_id IS NULL OR blog_post_id IS NULL);
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_context_check CHECK((page_id IS NULL AND blog_post_id IS NULL AND release_id IS NULL) OR website_site_id IS NOT NULL);
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_scope_fk FOREIGN KEY(company_id,form_id,owner_scope_id) REFERENCES website_form_scope(company_id,form_id,id);
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_site_fk FOREIGN KEY(company_id,website_site_id) REFERENCES website_site(company_id,id);
CREATE UNIQUE INDEX website_page_company_site_scope_idx ON website_page(company_id,site_id,id);
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_page_fk FOREIGN KEY(company_id,website_site_id,page_id) REFERENCES website_page(company_id,site_id,id);
CREATE UNIQUE INDEX website_blog_company_site_scope_idx ON website_blog_post(company_id,site_id,id);
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_blog_fk FOREIGN KEY(company_id,website_site_id,blog_post_id) REFERENCES website_blog_post(company_id,site_id,id);
ALTER TABLE website_form_submission ADD CONSTRAINT website_submission_release_fk FOREIGN KEY(company_id,website_site_id,release_id) REFERENCES website_release(company_id,site_id,id);
CREATE INDEX website_submission_scope_idx ON website_form_submission(company_id,form_id,owner_scope_id);
CREATE INDEX website_submission_site_page_idx ON website_form_submission(company_id,website_site_id,page_id);
CREATE INDEX website_submission_site_blog_idx ON website_form_submission(company_id,website_site_id,blog_post_id);
CREATE INDEX website_submission_release_idx ON website_form_submission(company_id,website_site_id,release_id);
CREATE FUNCTION website_submission_scope_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope website_form_scope;
BEGIN
 IF NEW.owner_scope_id IS NOT NULL THEN
   SELECT * INTO STRICT scope FROM website_form_scope WHERE id=NEW.owner_scope_id AND company_id=NEW.company_id AND form_id=NEW.form_id;
   IF (scope.owner_kind='website' AND NEW.website_site_id IS DISTINCT FROM scope.owner_website_site_id)
   OR (scope.owner_kind='growth_property' AND (NEW.website_site_id IS NOT NULL OR NEW.page_id IS NOT NULL OR NEW.blog_post_id IS NOT NULL OR NEW.release_id IS NOT NULL))
   THEN RAISE EXCEPTION 'invalid submission scope'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER website_submission_scope_validate BEFORE INSERT OR UPDATE ON website_form_submission FOR EACH ROW EXECUTE FUNCTION website_submission_scope_validate();
CREATE FUNCTION website_form_definition_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='website_form' THEN
   NEW.definition_revision=OLD.definition_revision+1; RETURN NEW;
 END IF;
 UPDATE website_form SET definition_revision=definition_revision+1 WHERE id=COALESCE(NEW.form_id,OLD.form_id) AND company_id=COALESCE(NEW.company_id,OLD.company_id);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER website_form_definition_touch BEFORE UPDATE ON website_form FOR EACH ROW EXECUTE FUNCTION website_form_definition_touch();
CREATE TRIGGER website_field_definition_touch AFTER INSERT OR UPDATE OR DELETE ON website_form_field FOR EACH ROW EXECUTE FUNCTION website_form_definition_touch();
-- No ownership backfill: existing IDs/answers are preserved and ambiguous rows
-- require the authenticated, audited resolution command.
COMMIT;
