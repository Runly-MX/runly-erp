-- Autonomous installations decide their own platform names. A name stays bound to its site forever (never deleted,
-- never reassigned); the only local transition allowed is its liveness: assigned <-> quarantined (released or site deleted).
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
  RAISE EXCEPTION 'website publication history is append only' USING ERRCODE='23514';
END $$;
