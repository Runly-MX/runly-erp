-- Released platform names (autonomous installations) stay bound to their site for a release window and then
-- become claimable by any site. released_at starts the window; the guard only lets a row change owner once
-- the window is over, as a fresh assignment. Rows are still never deleted.
ALTER TABLE "website_domain" ADD COLUMN "released_at" TIMESTAMPTZ;
UPDATE "website_domain" SET "released_at" = now()
 WHERE "state" = 'quarantined' AND "kind" = 'platform' AND NOT "registry_managed" AND "released_at" IS NULL;

CREATE OR REPLACE FUNCTION website_domain_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.registry_managed AND NEW.registry_managed
     AND NEW.hostname=OLD.hostname AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id AND NEW.kind=OLD.kind AND NEW.created_at=OLD.created_at THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NOT OLD.registry_managed AND NOT NEW.registry_managed AND OLD.kind='platform'
     AND NEW.hostname=OLD.hostname AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id AND NEW.kind=OLD.kind AND NEW.created_at=OLD.created_at
     AND NEW.state IN('assigned','quarantined') AND OLD.state IN('assigned','quarantined') THEN
    RETURN NEW;
  END IF;
  -- A released platform name changes owner only after its 15-day window, and only as a fresh assignment.
  IF TG_OP='UPDATE' AND NOT OLD.registry_managed AND NOT NEW.registry_managed AND OLD.kind='platform' AND NEW.kind='platform'
     AND NEW.hostname=OLD.hostname AND NEW.created_at=OLD.created_at
     AND OLD.state='quarantined' AND OLD.released_at IS NOT NULL AND OLD.released_at <= now() - interval '15 days'
     AND NEW.state='assigned' AND NEW.released_at IS NULL AND NOT NEW.is_primary THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.kind='custom' AND NEW.kind='custom'
     AND NOT OLD.registry_managed AND NOT NEW.registry_managed AND NEW.hostname=OLD.hostname THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'website publication history is append only' USING ERRCODE='23514';
END $$;
